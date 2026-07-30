import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'

import type { AppLogger } from '@vsp/observability'

import { LOGGER } from '../../infrastructure/database.module.js'

import { AuthService } from './auth.service.js'
import { IdentityService } from './identity.service.js'
import type { AuthenticatedRequest } from './request-identity.js'

/**
 * Resolves the authenticated principal and attaches it to the request.
 *
 * This is the one place a Better Auth session becomes a `Principal`. It runs as
 * the **first** global guard, before entitlement and permission checks, so every
 * downstream layer — the guards, the tenant interceptor that opens the RLS
 * context, `@CurrentPrincipal()` — reads a principal that is already resolved.
 *
 * It never rejects. Attaching a principal is its whole job; enforcement is the
 * later guards' job. A request with no valid session simply gets no principal,
 * and `PermissionsGuard` then denies any non-public route. This keeps the two
 * concerns — "who are you" and "may you" — in separate, individually correct
 * places.
 *
 * Resolution has two stages, mirroring identity vs. authorisation:
 *   1. A valid session yields an **identity** (the user), attached always.
 *   2. If that session has an active organisation the user still belongs to, a
 *      **principal** (user + org + role + permissions) is attached too. A user
 *      with no organisation, or whose active org membership was revoked, keeps
 *      their identity but gets no principal — org routes 401, identity routes
 *      (session, switch org, accept invite) still work.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    try {
      const result = await this.auth.instance.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })

      if (result?.session && result.user) {
        const { session, user } = result

        request.identity = {
          userId: user.id,
          email: user.email,
          name: user.name,
          sessionId: session.id,
          emailVerified: user.emailVerified,
        }

        // Active org: the session's, or the user's default the first time.
        let activeOrgId = await this.identity.readActiveOrganizationId(session.id)
        if (!activeOrgId) {
          activeOrgId = await this.identity.pickDefaultOrganizationId(user.id)
          if (activeOrgId) await this.identity.persistActiveOrganization(session.id, activeOrgId)
        }

        if (activeOrgId) {
          const membership = await this.identity.resolveActiveMembership(user.id, activeOrgId)
          if (membership) {
            request.principal = this.identity.buildPrincipal(
              { id: user.id, email: user.email, name: user.name },
              activeOrgId,
              membership,
              session.id,
            )
          }
        }
      }
    } catch (error) {
      // A malformed or expired cookie is "not authenticated", never a 500. The
      // request proceeds with no principal and the permission guard denies it.
      this.logger.debug({ err: error }, 'session resolution failed; proceeding unauthenticated')
    }

    return true
  }
}
