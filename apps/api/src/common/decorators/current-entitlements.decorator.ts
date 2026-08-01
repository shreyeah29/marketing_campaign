import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common'

import type { EntitlementSnapshot } from '@vsp/database'

/**
 * Injects the entitlement snapshot the guard resolved for this request.
 *
 * Reuses the resolution the `EntitlementGuard` already did and cached on the
 * request, so a handler never re-resolves. Throws if it is absent, which can only
 * happen on a route that skipped the guard (a public one) — using this decorator
 * there is a programming error worth surfacing loudly rather than resolving a
 * second time and hiding the mistake.
 */
export const CurrentEntitlements = createParamDecorator(
  (_data: unknown, context: ExecutionContext): EntitlementSnapshot => {
    const request = context.switchToHttp().getRequest<{ entitlements?: EntitlementSnapshot }>()

    if (!request.entitlements) {
      throw new InternalServerErrorException(
        'No entitlement snapshot on this request. @CurrentEntitlements() requires the ' +
          'EntitlementGuard to have run — the route must not be @Public().',
      )
    }

    return request.entitlements
  },
)
