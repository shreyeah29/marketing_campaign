import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'

import { PlatformAuthService, type PlatformPrincipal } from './platform-auth.service.js'

/**
 * Guards the platform-admin plane.
 *
 * Applied at the controller level on the platform routes, which are also marked
 * `@Public()` so the tenant guards (entitlement, permission) skip them — a
 * platform admin has no tenant, no organisation and no tenant permissions, so the
 * tenant guards would wrongly reject them. This guard replaces that check with the
 * platform realm's own: a valid platform token, or nothing.
 *
 * This is the mechanism that makes the super-admin portal unreachable by tenants.
 * A tenant session token is signed by a different realm with a different key; it
 * cannot satisfy this guard, so even though the routes sit under the same host,
 * no tenant can enter the platform plane.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@Inject(PlatformAuthService) private readonly auth: PlatformAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
      platformAdmin?: PlatformPrincipal
    }>()

    const header = request.headers['authorization']
    const raw = Array.isArray(header) ? header[0] : header

    if (raw === undefined || !raw.startsWith('Bearer ')) {
      throw new UnauthorizedException('Platform authentication required')
    }

    // Throws on an invalid or expired token; the exception filter turns it into a
    // problem+json 401.
    request.platformAdmin = this.auth.verify(raw.slice('Bearer '.length))
    return true
  }
}
