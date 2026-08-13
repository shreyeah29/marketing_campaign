import { createHmac, timingSafeEqual, hash as nodeHash } from 'node:crypto'

import { Injectable, UnauthorizedException } from '@nestjs/common'

import { loadEnv } from '../../config/env.js'

/**
 * View-as-client bridge tokens.
 *
 * A platform admin exchanges their platform token — server-side, through the
 * platform controller — for one of these: a short-lived token that resolves to
 * a **read-only VIEWER principal** inside one named organisation. The platform
 * bearer token itself is never accepted by the tenant realm, so it can never
 * become a tenant write credential; this token is the only bridge, and it is
 * signed with its own derived key so neither realm's tokens verify here.
 *
 * Read-only is enforced in three layers, none of which trust this token alone:
 * the ReadOnlySessionGuard rejects non-GET requests, the VIEWER permission set
 * carries no write permissions, and the tenant transaction runs SET TRANSACTION
 * READ ONLY so a missed guard becomes a Postgres error, not a silent write.
 */

export interface ViewAsClaims {
  readonly platformAdminId: string
  readonly organizationId: string
  readonly email: string
}

interface TokenPayload extends ViewAsClaims {
  readonly exp: number
}

/** Header the web app presents the bridge token in. */
export const VIEW_AS_HEADER = 'x-mos-view-as'

/**
 * The pre-rebrand header name, still accepted.
 *
 * The API and the web app deploy separately, so for one release a browser may be
 * running the old bundle against the new API or the reverse. Accepting both
 * removes that window entirely — and the failure it would otherwise cause is a
 * CORS preflight rejection, which surfaces as a bare network error with no
 * status code and is miserable to diagnose.
 *
 * Safe to delete once both sides have been deployed for a release.
 */
export const LEGACY_VIEW_AS_HEADER = 'x-vsp-view-as'

@Injectable()
export class ViewAsService {
  private readonly signingKey: string
  // Half an hour: long enough to look around a client workspace, short enough
  // that a leaked token is soon worthless. No refresh — start a new session.
  private static readonly TTL_MS = 30 * 60 * 1000

  constructor() {
    const env = loadEnv()
    // A third derived key: distinct from both the tenant realm and the
    // platform-admin realm, so no token of one kind verifies as another.
    this.signingKey = nodeHash('sha256', `platform-view-as::${env.BETTER_AUTH_SECRET}`)
  }

  issue(claims: ViewAsClaims): { token: string; expiresAt: Date } {
    const exp = Date.now() + ViewAsService.TTL_MS
    const payload: TokenPayload = { ...claims, exp }
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const token = `${payloadB64}.${this.hmac(payloadB64).toString('base64url')}`
    return { token, expiresAt: new Date(exp) }
  }

  /** Verifies a bridge token and returns its claims, or throws. */
  verify(token: string): ViewAsClaims {
    const [payloadB64, signatureB64] = token.split('.')
    if (payloadB64 === undefined || signatureB64 === undefined) {
      throw new UnauthorizedException('Malformed view-as token')
    }

    const expected = this.hmac(payloadB64)
    const given = Buffer.from(signatureB64, 'base64url')
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Invalid view-as token signature')
    }

    let payload: TokenPayload
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload
    } catch {
      throw new UnauthorizedException('Malformed view-as token payload')
    }

    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('View-as session expired')
    }

    return {
      platformAdminId: payload.platformAdminId,
      organizationId: payload.organizationId,
      email: payload.email,
    }
  }

  private hmac(data: string): Buffer {
    return createHmac('sha256', this.signingKey).update(data).digest()
  }
}
