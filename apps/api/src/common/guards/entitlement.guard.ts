import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { ERROR_CODES } from '@vsp/contracts'
import type { EntitlementSnapshot } from '@vsp/database'

import type { Principal } from '../auth/principal.js'
import { EntitlementService } from '../entitlements/entitlement.service.js'
import { PUBLIC_METADATA } from './permissions.guard.js'

export const FEATURE_METADATA = 'vsp:required-feature'

/**
 * Declares the feature a route belongs to.
 *
 * A route with `@RequiresFeature('crm.contacts')` is reachable only by an
 * organisation that has that feature enabled. This is the API half of the modular
 * design: the frontend hides a disabled feature's navigation for UX, but hiding a
 * menu item does not stop an API call — this guard is the actual boundary.
 */
export const RequiresFeature = (featureId: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_METADATA, featureId)

/**
 * Enforces subscription status and feature entitlement.
 *
 * Runs before the permission guard, matching the pipeline order the design
 * requires: authenticated → tenant → **subscription active → feature enabled** →
 * permission → limit. Two failures with distinct codes so a client can tell "your
 * account is suspended" from "you don't have this module":
 *
 *   · Suspended / deleted organisation → `403 forbidden` (payment_required-adjacent;
 *     the account itself is not permitted to act).
 *   · Feature not enabled → `403 feature_not_enabled`, which the UI turns into an
 *     upgrade prompt rather than a generic error.
 *
 * The resolved snapshot is attached to the request so downstream code — the limit
 * service, the workspace endpoint — reuses it without re-resolving.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler()
    const controller = context.getClass()

    const isPublic =
      this.reflector.get<boolean>(PUBLIC_METADATA, handler) === true ||
      this.reflector.get<boolean>(PUBLIC_METADATA, controller) === true
    if (isPublic) return true

    const request = context
      .switchToHttp()
      .getRequest<{ principal?: Principal; entitlements?: EntitlementSnapshot }>()

    const principal = request.principal
    // No principal yet — let the permission guard produce the 401. This guard
    // does not authenticate; it authorises an already-authenticated caller.
    if (!principal) return true

    const snapshot = await this.entitlements.resolve(principal.organizationId)
    // Cache on the request so the permission guard, the limit service and the
    // handler all reuse this one resolution.
    request.entitlements = snapshot

    // A suspended or deleted organisation cannot act at all, regardless of which
    // features it once had. Checked first: there is no point evaluating a feature
    // for an account that is not permitted to operate.
    if (snapshot.status === 'SUSPENDED' || snapshot.status === 'DELETED') {
      throw new ForbiddenException({
        message:
          snapshot.status === 'SUSPENDED'
            ? 'This workspace is suspended. Contact your administrator.'
            : 'This workspace is no longer active.',
        code: ERROR_CODES.SUBSCRIPTION_INACTIVE,
      })
    }

    const requiredFeature =
      this.reflector.get<string>(FEATURE_METADATA, handler) ??
      this.reflector.get<string>(FEATURE_METADATA, controller)

    // A route with no declared feature is not feature-gated — health, settings,
    // the workspace endpoint itself. Tenant scoping and permissions still apply.
    if (requiredFeature === undefined) return true

    if (!snapshot.features.has(requiredFeature)) {
      throw new ForbiddenException({
        message: 'This feature is not enabled for your workspace.',
        code: ERROR_CODES.FEATURE_NOT_ENABLED,
        feature: requiredFeature,
        // Signals the UI to offer an upgrade rather than show a dead end.
        upgradeable: true,
      })
    }

    return true
  }
}
