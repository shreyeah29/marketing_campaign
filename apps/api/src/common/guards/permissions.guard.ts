import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { can, type Principal } from '../auth/principal.js'
import type { Permission } from '../rbac/permissions.js'

export const PERMISSIONS_METADATA = 'mos:required-permissions'
export const PUBLIC_METADATA = 'mos:public'

/**
 * Declares the permissions a route requires.
 *
 * Applied per handler rather than checked inside it, so the requirement is
 * visible in the route's signature and can be enumerated — the OpenAPI document
 * and the audit log both read this metadata.
 */
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_METADATA, permissions)

/**
 * Marks a route as unauthenticated.
 *
 * Explicit opt-out rather than opt-in. The guard is global and denies by default,
 * so a new controller is protected the moment it exists — forgetting a decorator
 * makes a route unreachable, not unprotected. The previous implementation had the
 * inverse default, and a controller without `[Authorize]` was silently open.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_METADATA, true)

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler()
    const controller = context.getClass()

    const isPublic =
      this.reflector.get<boolean>(PUBLIC_METADATA, handler) === true ||
      this.reflector.get<boolean>(PUBLIC_METADATA, controller) === true

    if (isPublic) return true

    const request = context.switchToHttp().getRequest<{ principal?: Principal }>()
    const principal = request.principal

    // Deny by default. A route that is neither public nor authenticated is a
    // configuration mistake, and the safe response to a configuration mistake is
    // to refuse the request.
    if (!principal) {
      throw new UnauthorizedException('Authentication required')
    }

    const required =
      this.reflector.get<Permission[]>(PERMISSIONS_METADATA, handler) ??
      this.reflector.get<Permission[]>(PERMISSIONS_METADATA, controller) ??
      []

    // An authenticated route with no declared permission is readable by any
    // member of the organisation. Tenant scoping still applies — that is enforced
    // in the data layer, not here.
    if (required.length === 0) return true

    const missing = required.filter((permission) => !can(principal, permission))

    if (missing.length > 0) {
      // Names the missing permission so the client can render something better
      // than "forbidden", and so support can answer "why can't I do this?".
      throw new ForbiddenException({
        message: 'You do not have permission to perform this action',
        required: missing,
        role: principal.role,
      })
    }

    return true
  }
}
