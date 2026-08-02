import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'

import type { Principal } from '../auth/principal.js'

/**
 * Blocks every mutating request made by a view-as (impersonation) principal.
 *
 * The permission set alone is not enough: an authenticated route that declares
 * no permissions is open to any member of the organisation by design, which
 * would include a read-only visitor. So read-only is enforced on the HTTP verb
 * — deny anything that is not GET/HEAD/OPTIONS — which no forgotten decorator
 * can accidentally widen. Runs directly after AuthGuard, before entitlement and
 * permission checks, so a view-only session is rejected for what it is rather
 * than for what it lacks.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

@Injectable()
export class ReadOnlySessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ principal?: Principal; method: string }>()
    const principal = request.principal
    if (!principal?.impersonation?.readOnly) return true
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true
    throw new ForbiddenException('This is a view-only session — changes are disabled')
  }
}
