import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'

import type { Principal } from '../auth/principal.js'

/**
 * Injects the authenticated principal into a handler.
 *
 * Throws rather than returning `undefined` when absent. A handler that declared
 * it needs a principal must not receive one that is missing — the alternative is
 * `principal?.organizationId` scattered through the codebase, and eventually one
 * of those optional chains silently produces a query with no tenant.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>()

    if (!request.principal) {
      throw new UnauthorizedException(
        'No authenticated principal on this request. A handler using @CurrentPrincipal() must ' +
          'not be marked @Public().',
      )
    }

    return request.principal
  },
)
