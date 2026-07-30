import { describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  assertPermissionMatrixValid,
  effectivePermissions,
  PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  type MemberRole,
} from '../common/rbac/permissions.js'
import { can, systemPrincipal } from '../common/auth/principal.js'
import { loadEnv, resetEnvCache, swaggerEnabled } from '../config/env.js'

const LADDER: readonly MemberRole[] = ['VIEWER', 'MEMBER', 'MANAGER', 'ADMIN', 'OWNER']

describe('permission matrix', () => {
  it('is internally consistent', () => {
    expect(() => assertPermissionMatrixValid()).not.toThrow()
  })

  it('keeps each role a superset of the one below', () => {
    // The role picker in the UI, and every customer's mental model, assumes this.
    // A break here means "promoting" someone could silently remove a capability.
    for (let i = 1; i < LADDER.length; i += 1) {
      const lower = permissionsForRole(LADDER[i - 1]!)
      const higher = new Set(permissionsForRole(LADDER[i]!))
      for (const permission of lower) {
        expect(higher.has(permission)).toBe(true)
      }
    }
  })

  it('grants every declared permission to at least one role', () => {
    // An ungranted permission is a control that looks real and can never pass.
    const granted = new Set(LADDER.flatMap((role) => [...permissionsForRole(role)]))
    for (const permission of ALL_PERMISSIONS) {
      expect(granted.has(permission)).toBe(true)
    }
  })
})

describe('separation of duties', () => {
  it('lets a member draft but not publish or send', () => {
    // The point of the MEMBER role: productive on day one without being able to
    // email the entire contact list.
    expect(roleHasPermission('MEMBER', PERMISSIONS.CONTENT_WRITE)).toBe(true)
    expect(roleHasPermission('MEMBER', PERMISSIONS.CONTENT_PUBLISH)).toBe(false)
    expect(roleHasPermission('MEMBER', PERMISSIONS.EMAIL_SEND)).toBe(false)
    expect(roleHasPermission('MEMBER', PERMISSIONS.WHATSAPP_SEND)).toBe(false)
    expect(roleHasPermission('MEMBER', PERMISSIONS.VOICE_CALL)).toBe(false)
  })

  it('withholds billing from admins', () => {
    // Running the workspace and changing the plan are different jobs.
    expect(roleHasPermission('ADMIN', PERMISSIONS.ORG_MANAGE)).toBe(true)
    expect(roleHasPermission('ADMIN', PERMISSIONS.BILLING_MANAGE)).toBe(false)
    expect(roleHasPermission('OWNER', PERMISSIONS.BILLING_MANAGE)).toBe(true)
  })

  it('gives a viewer no write capability at all', () => {
    const writes = ALL_PERMISSIONS.filter(
      (p) =>
        p.includes(':write') ||
        p.includes(':send') ||
        p.includes(':publish') ||
        p.includes(':delete'),
    )
    for (const permission of writes) {
      expect(roleHasPermission('VIEWER', permission)).toBe(false)
    }
  })

  it('requires an explicit grant for agent approval', () => {
    // Approving an agent's mutating action is a manager-level act.
    expect(roleHasPermission('MEMBER', PERMISSIONS.AGENTS_RUN)).toBe(true)
    expect(roleHasPermission('MEMBER', PERMISSIONS.AGENTS_APPROVE)).toBe(false)
    expect(roleHasPermission('MANAGER', PERMISSIONS.AGENTS_APPROVE)).toBe(true)
  })
})

describe('additional grants', () => {
  it('adds a single capability without promoting the role', () => {
    const permitted = effectivePermissions('MEMBER', [PERMISSIONS.EMAIL_SEND])
    expect(permitted.has(PERMISSIONS.EMAIL_SEND)).toBe(true)
    // Still not a manager — nothing else came along with it.
    expect(permitted.has(PERMISSIONS.CONTENT_PUBLISH)).toBe(false)
  })

  it('ignores a grant that is not a declared permission', () => {
    // A typo'd or removed permission string must not become a wildcard.
    const permitted = effectivePermissions('VIEWER', ['not:a:real:permission', '*'])
    expect(permitted.size).toBe(permissionsForRole('VIEWER').length)
  })
})

describe('system principal', () => {
  it('holds no permissions', () => {
    // A system principal that could pass any check would be a standing privilege
    // escalation waiting for a bug to find it. Platform work runs through
    // explicitly unscoped repositories instead.
    const principal = systemPrincipal('org-1')
    for (const permission of ALL_PERMISSIONS) {
      expect(can(principal, permission)).toBe(false)
    }
  })
})

describe('environment validation', () => {
  const base = {
    DATABASE_URL: 'postgresql://vsp_app:pw@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    ENCRYPTION_MASTER_KEY: 'y'.repeat(32),
  }

  it('rejects a short signing secret', () => {
    resetEnvCache()
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: 'too-short' })).toThrow(
      /BETTER_AUTH_SECRET must be at least 32/,
    )
  })

  it('reports every missing variable at once', () => {
    // A fresh deployment should not have to fix these one boot at a time.
    resetEnvCache()
    try {
      loadEnv({})
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('DATABASE_URL')
      expect(message).toContain('REDIS_URL')
      expect(message).toContain('BETTER_AUTH_SECRET')
      expect(message).toContain('ENCRYPTION_MASTER_KEY')
    }
  })

  it('defaults Swagger on outside production and off inside it', () => {
    resetEnvCache()
    expect(swaggerEnabled(loadEnv({ ...base, NODE_ENV: 'development' }))).toBe(true)
    resetEnvCache()
    expect(swaggerEnabled(loadEnv({ ...base, NODE_ENV: 'production' }))).toBe(false)
  })

  it('lets an explicit value override the environment default, both ways', () => {
    // The bug this guards: an `.optional().transform()` also runs on undefined,
    // making "unset" indistinguishable from "off" and the default dead code.
    resetEnvCache()
    expect(
      swaggerEnabled(loadEnv({ ...base, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })),
    ).toBe(true)
    resetEnvCache()
    expect(
      swaggerEnabled(loadEnv({ ...base, NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })),
    ).toBe(false)
  })
})
