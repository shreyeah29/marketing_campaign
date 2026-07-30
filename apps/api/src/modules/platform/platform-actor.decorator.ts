import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'

import type { PlatformPrincipal } from './platform-auth.service.js'

/** Injects the authenticated platform admin resolved by `PlatformAdminGuard`. */
export const PlatformActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformPrincipal => {
    const request = context.switchToHttp().getRequest<{ platformAdmin?: PlatformPrincipal }>()
    if (!request.platformAdmin) {
      throw new UnauthorizedException(
        'No platform admin on request; PlatformAdminGuard must run first',
      )
    }
    return request.platformAdmin
  },
)
