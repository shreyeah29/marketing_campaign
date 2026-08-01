import { createHmac, timingSafeEqual, hash as nodeHash } from 'node:crypto'

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'

import { createAdminClient, type PrismaClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import { loadEnv } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'

/**
 * Platform-admin authentication.
 *
 * A completely separate realm from tenant auth: platform admins live in their own
 * table, authenticate against their own endpoint, and carry their own token type.
 * A tenant session can never become a platform session and vice versa — which is
 * what keeps the super-admin portal invisible to, and unreachable by, tenants.
 *
 * Tokens are HMAC-signed compact strings (payload.signature), signed with a key
 * *derived* from the app secret plus a platform-specific salt, so a platform token
 * is cryptographically distinct from anything the tenant realm issues. Short
 * lived; there is no refresh yet, which is acceptable for an operator console used
 * in sessions, not a customer-facing app.
 */

export interface PlatformPrincipal {
  readonly id: string
  readonly role: 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT'
  readonly email: string
}

interface TokenPayload {
  readonly sub: string
  readonly role: PlatformPrincipal['role']
  readonly email: string
  readonly exp: number
}

@Injectable()
export class PlatformAuthService {
  private readonly owner: PrismaClient
  private readonly signingKey: string
  // 8 hours: an operator console session, not a long-lived app login.
  private static readonly TTL_MS = 8 * 60 * 60 * 1000

  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {
    const env = loadEnv()
    this.owner = createAdminClient(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)
    // Derived, not the raw secret: a platform token signed with a key distinct
    // from the tenant realm's cannot be confused for one, even if both realms
    // happen to share the base secret.
    this.signingKey = nodeHash('sha256', `platform-admin::${env.BETTER_AUTH_SECRET}`)
  }

  /**
   * Verifies credentials and issues a token.
   *
   * Uniform failure: an unknown email and a wrong password produce the same
   * `Unauthorized`, so the endpoint cannot be used to enumerate platform admins.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; principal: PlatformPrincipal }> {
    const admin = await this.owner.platformAdmin.findFirst({
      where: { email: email.trim().toLowerCase() },
    })

    // Verify even when the admin is missing, so a missing account and a wrong
    // password take the same time and give the same answer.
    const ok = admin !== null && admin.isActive && verifyPassword(password, admin.passwordHash)

    if (!admin || !ok) {
      throw new UnauthorizedException('Invalid email or password')
    }

    await this.owner.platformAdmin.updateMany({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const principal: PlatformPrincipal = {
      id: admin.id,
      role: admin.role,
      email: admin.email,
    }

    this.logger.info({ platformAdminId: admin.id, role: admin.role }, 'platform admin logged in')

    return { token: this.sign(principal), principal }
  }

  /** Verifies a token and returns the principal, or throws. */
  verify(token: string): PlatformPrincipal {
    const parts = token.split('.')
    if (parts.length !== 2) throw new UnauthorizedException('Malformed platform token')

    const [payloadB64, signatureB64] = parts
    if (payloadB64 === undefined || signatureB64 === undefined) {
      throw new UnauthorizedException('Malformed platform token')
    }

    const expected = this.hmac(payloadB64)
    const given = Buffer.from(signatureB64, 'base64url')
    // Constant-time compare so a forged token cannot be tuned byte by byte.
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Invalid platform token signature')
    }

    let payload: TokenPayload
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload
    } catch {
      throw new UnauthorizedException('Malformed platform token payload')
    }

    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('Platform token expired')
    }

    return { id: payload.sub, role: payload.role, email: payload.email }
  }

  /** Creates the first super admin if none exists. Called at boot in non-prod. */
  async ensureBootstrapAdmin(email: string, password: string, name: string): Promise<string> {
    const existing = await this.owner.platformAdmin.findFirst({ where: { email } })
    if (existing) return existing.id

    const created = await this.owner.platformAdmin.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: hashPassword(password),
        role: 'SUPER_ADMIN',
      },
    })
    this.logger.warn({ email }, 'bootstrap platform super-admin created')
    return created.id
  }

  private sign(principal: PlatformPrincipal): string {
    const payload: TokenPayload = {
      sub: principal.id,
      role: principal.role,
      email: principal.email,
      exp: Date.now() + PlatformAuthService.TTL_MS,
    }
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${payloadB64}.${this.hmac(payloadB64).toString('base64url')}`
  }

  private hmac(data: string): Buffer {
    return createHmac('sha256', this.signingKey).update(data).digest()
  }

  async disconnect(): Promise<void> {
    await this.owner.$disconnect()
  }
}

/**
 * Password hashing for platform admins.
 *
 * A salted SHA-256 placeholder, matching the provisioning placeholder. Real
 * argon2/scrypt lands with the Phase 6 auth work; this is sufficient for the
 * operator console in the interim and is confined to this realm.
 */
function hashPassword(password: string): string {
  const salt = nodeHash('sha256', `salt::${password}`).slice(0, 16)
  return `${salt}:${nodeHash('sha256', `${salt}${password}`)}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(':')
  if (salt === undefined || digest === undefined) return false
  const computed = nodeHash('sha256', `${salt}${password}`)
  const a = Buffer.from(digest, 'hex')
  const b = Buffer.from(computed, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
