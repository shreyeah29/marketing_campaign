import { UnauthorizedException, ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Principal } from '../../../common/auth/principal.js'
import { ReadOnlySessionGuard } from '../../../common/guards/read-only.guard.js'
import { resetEnvCache } from '../../../config/env.js'
import { ViewAsService } from '../view-as.service.js'

beforeEach(() => {
  // loadEnv validates the whole environment; provide the required baseline.
  process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5432/db'
  process.env['REDIS_URL'] = 'redis://localhost:6379'
  process.env['BETTER_AUTH_SECRET'] = 'x'.repeat(40)
  process.env['ENCRYPTION_MASTER_KEY'] = 'y'.repeat(40)
  resetEnvCache()
})

const claims = {
  platformAdminId: 'admin_1',
  organizationId: 'org_abc',
  email: 'operator@example.com',
}

describe('ViewAsService', () => {
  it('round-trips claims through issue → verify', () => {
    const svc = new ViewAsService()
    const { token, expiresAt } = svc.issue(claims)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(svc.verify(token)).toEqual(claims)
  })

  it('rejects a tampered payload', () => {
    const svc = new ViewAsService()
    const { token } = svc.issue(claims)
    const [payload, sig] = token.split('.')
    const forged = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    forged['organizationId'] = 'org_victim'
    const forgedB64 = Buffer.from(JSON.stringify(forged), 'utf8').toString('base64url')
    expect(() => svc.verify(`${forgedB64}.${sig ?? ''}`)).toThrow(UnauthorizedException)
  })

  it('rejects a platform-admin realm token — the realms do not cross', () => {
    // A token signed with a different derived key must not verify, even if the
    // base secret is shared. Simulate by signing with a service built under a
    // different secret.
    const svc = new ViewAsService()
    process.env['BETTER_AUTH_SECRET'] = 'z'.repeat(40)
    resetEnvCache()
    const other = new ViewAsService()
    const { token } = other.issue(claims)
    expect(() => svc.verify(token)).toThrow(UnauthorizedException)
  })

  it('rejects garbage tokens', () => {
    const svc = new ViewAsService()
    expect(() => svc.verify('nonsense')).toThrow(UnauthorizedException)
    expect(() => svc.verify('a.b')).toThrow(UnauthorizedException)
  })
})

function httpContext(method: string, principal?: Principal): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, principal }) }),
  } as unknown as ExecutionContext
}

const viewer: Principal = {
  type: 'user',
  id: 'platform:admin_1',
  organizationId: 'org_abc',
  role: 'VIEWER',
  permissions: new Set(),
  impersonation: { platformAdminId: 'admin_1', readOnly: true },
}

describe('ReadOnlySessionGuard', () => {
  const guard = new ReadOnlySessionGuard()

  it('lets safe methods through for a view-as principal', () => {
    expect(guard.canActivate(httpContext('GET', viewer))).toBe(true)
    expect(guard.canActivate(httpContext('HEAD', viewer))).toBe(true)
    expect(guard.canActivate(httpContext('OPTIONS', viewer))).toBe(true)
  })

  it('rejects every mutating verb for a view-as principal', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => guard.canActivate(httpContext(method, viewer))).toThrow(ForbiddenException)
    }
  })

  it('ignores ordinary principals and unauthenticated requests', () => {
    const member: Principal = {
      type: 'user',
      id: 'user_1',
      organizationId: 'org_abc',
      role: 'ADMIN',
      permissions: new Set(),
    }
    expect(guard.canActivate(httpContext('POST', member))).toBe(true)
    expect(guard.canActivate(httpContext('POST'))).toBe(true)
  })
})
