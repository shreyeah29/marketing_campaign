import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'

import type { AuthenticatedRequest, RequestIdentity } from './request-identity.js'

/**
 * Injects the authenticated identity — the user, independent of any organisation.
 *
 * For identity-scoped routes: the session view, listing organisations, switching
 * organisation, accepting an invitation. These need to know *who* is calling
 * without requiring a resolved organisation principal, so a user with no org (or
 * still choosing one) can use them.
 *
 * Throws when there is no session, so an identity route is never handled for an
 * anonymous caller. Such routes are marked `@Public()` to skip the org-permission
 * guard, which makes this decorator the actual authentication check for them.
 */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestIdentity => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (!request.identity) {
      throw new UnauthorizedException('Authentication required')
    }

    return request.identity
  },
)
