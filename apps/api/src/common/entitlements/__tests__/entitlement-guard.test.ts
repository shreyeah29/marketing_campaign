/**
 * Entitlement enforcement, tested against a real request pipeline.
 *
 * The feature guard is the security boundary of the modular design — the frontend
 * hiding a menu item is only UX. So it is tested by driving actual requests
 * through a Nest app with the guard installed, injecting a principal and an
 * entitlement snapshot the way the (Phase 6) auth middleware will, and asserting:
 * an enabled feature is reachable, a disabled one is 403 feature_not_enabled, and
 * a suspended organisation is blocked outright.
 *
 * A mocked guard would prove nothing about the wiring; this exercises the
 * decorator, the reflector metadata, the guard order relative to the permission
 * guard, and the problem+json shape together.
 */

import {
  Controller,
  Get,
  Injectable,
  Module,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type { EntitlementSnapshot } from '@marketing-os/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Principal } from '../../auth/principal.js'
import { EntitlementGuard, RequiresFeature } from '../../guards/entitlement.guard.js'
import { PermissionsGuard, RequirePermissions } from '../../guards/permissions.guard.js'
import { PERMISSIONS, effectivePermissions } from '../../rbac/permissions.js'
import { EntitlementService } from '../entitlement.service.js'

// A principal + snapshot injected the way the auth middleware will in Phase 6.
// Mutated per test to simulate different organisations.
const state: { principal: Principal | undefined; snapshot: EntitlementSnapshot } = {
  principal: undefined,
  snapshot: makeSnapshot('ACTIVE', ['crm.contacts']),
}

function makeSnapshot(
  status: EntitlementSnapshot['status'],
  features: string[],
): EntitlementSnapshot {
  return {
    organizationId: 'org-test',
    status,
    planKey: 'growth',
    features: new Set(features),
    limits: new Map([['contacts', 100]]),
    featureConfig: new Map(),
    resolvedAt: new Date().toISOString(),
  }
}

function makePrincipal(): Principal {
  return {
    type: 'user',
    id: 'user-test',
    organizationId: 'org-test',
    role: 'ADMIN',
    permissions: effectivePermissions('ADMIN'),
  }
}

/** Stands in for the Phase 6 auth middleware: attaches the current principal. */
@Injectable()
class InjectPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>()
    if (state.principal !== undefined) request.principal = state.principal
    return true
  }
}

/** Returns the test's chosen snapshot instead of hitting Postgres/Redis. */
@Injectable()
class StubEntitlementService {
  async resolve(): Promise<EntitlementSnapshot> {
    return Promise.resolve(state.snapshot)
  }
}

@Controller('crm')
class GatedController {
  @Get('contacts')
  @RequiresFeature('crm.contacts')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  contacts(): { ok: true } {
    return { ok: true }
  }

  @Get('deals')
  @RequiresFeature('crm.deals')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  deals(): { ok: true } {
    return { ok: true }
  }
}

@Module({
  controllers: [GatedController],
  providers: [
    { provide: EntitlementService, useClass: StubEntitlementService },
    // Order mirrors production: inject principal, then entitlement, then permission.
    { provide: APP_GUARD, useClass: InjectPrincipalGuard },
    {
      provide: APP_GUARD,
      inject: [Reflector, EntitlementService],
      useFactory: (reflector: Reflector, entitlements: EntitlementService) =>
        new EntitlementGuard(reflector, entitlements),
    },
    {
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
    },
  ],
})
class TestModule {}

let app: NestFastifyApplication

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

afterAll(async () => {
  await app.close()
})

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: path })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

describe('feature entitlement enforcement', () => {
  it('allows a route whose feature is enabled', async () => {
    state.principal = makePrincipal()
    state.snapshot = makeSnapshot('ACTIVE', ['crm.contacts'])

    const res = await get('/crm/contacts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('blocks a route whose feature is not enabled, with feature_not_enabled', async () => {
    // Same org, same permissions — only the feature entitlement differs. This is
    // the core of the modular design: the module is off, so the route is off.
    state.principal = makePrincipal()
    state.snapshot = makeSnapshot('ACTIVE', ['crm.contacts']) // deals NOT enabled

    const res = await get('/crm/deals')
    expect(res.status).toBe(403)
    expect(res.body['code']).toBe('feature_not_enabled')
    expect(res.body['feature']).toBe('crm.deals')
    expect(res.body['upgradeable']).toBe(true)
  })

  it('blocks every route for a suspended organisation, before the feature check', async () => {
    state.principal = makePrincipal()
    state.snapshot = makeSnapshot('SUSPENDED', ['crm.contacts']) // has the feature, but suspended

    const res = await get('/crm/contacts')
    expect(res.status).toBe(403)
    expect(res.body['code']).toBe('subscription_inactive')
  })

  it('still enforces permissions after the feature check', async () => {
    // Feature enabled, but a viewer lacks even crm:read? Viewers DO have crm:read,
    // so instead drop the principal's permissions to prove the permission guard
    // still runs downstream of the entitlement guard.
    state.principal = { ...makePrincipal(), permissions: new Set() }
    state.snapshot = makeSnapshot('ACTIVE', ['crm.contacts'])

    const res = await get('/crm/contacts')
    expect(res.status).toBe(403)
    // The permission guard's message, not the entitlement guard's — proving the
    // request passed the feature gate and was stopped by the permission gate.
    expect(String(res.body['message'])).toContain('permission')
  })
})
