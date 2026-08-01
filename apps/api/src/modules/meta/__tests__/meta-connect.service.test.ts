import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Principal } from '../../../common/auth/principal.js'
import { resetEnvCache } from '../../../config/env.js'
import { MetaConnectService } from '../meta-connect.service.js'

// authUrl + OAuth-state verification are pure (no DB / encryption), so stub those
// dependencies; the calls under test never touch them.
function makeService(): MetaConnectService {
  return new MetaConnectService({} as never, {} as never)
}

const principal = { id: 'user_1', organizationId: 'org_abc' } as Principal
const other = { id: 'user_2', organizationId: 'org_xyz' } as Principal

beforeEach(() => {
  // loadEnv validates the whole environment; provide the required baseline.
  process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5432/db'
  process.env['REDIS_URL'] = 'redis://localhost:6379'
  process.env['BETTER_AUTH_SECRET'] = 'x'.repeat(40)
  process.env['ENCRYPTION_MASTER_KEY'] = 'y'.repeat(40)
  process.env['META_APP_ID'] = 'app_123'
  process.env['META_APP_SECRET'] = 'shhh'
  process.env['META_OAUTH_REDIRECT_URI'] = 'https://app.example.com/meta/callback'
  process.env['META_GRAPH_VERSION'] = 'v21.0'
  delete process.env['META_CONFIG_ID']
  resetEnvCache()
})

afterEach(() => {
  delete process.env['META_APP_ID']
  delete process.env['META_APP_SECRET']
  delete process.env['META_OAUTH_REDIRECT_URI']
  resetEnvCache()
})

describe('authUrl', () => {
  it('builds a Meta OAuth dialog URL with app id, redirect, scopes and signed state', () => {
    const url = new URL(makeService().authUrl(principal))
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth')
    expect(url.searchParams.get('client_id')).toBe('app_123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/meta/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toContain('ads_management')
    // State binds the org id so the round-trip can't be pointed at another tenant.
    expect(url.searchParams.get('state')).toMatch(/^org_abc\.[a-f0-9]{64}$/)
  })

  it('fails cleanly when the operator has not configured Meta', () => {
    delete process.env['META_APP_ID']
    resetEnvCache()
    expect(() => makeService().authUrl(principal)).toThrow(/not configured/i)
  })
})

describe('OAuth state (CSRF protection)', () => {
  it('rejects a callback whose state was signed for a different organisation', async () => {
    const svc = makeService()
    // A valid state for `other`, replayed against `principal` — must be refused
    // before any token exchange happens.
    const stolen = new URL(svc.authUrl(other)).searchParams.get('state')!
    await expect(svc.handleCallback(principal, 'code_xyz', stolen)).rejects.toThrow(/invalid oauth state/i)
  })

  it('rejects a tampered state', async () => {
    const svc = makeService()
    const good = new URL(svc.authUrl(principal)).searchParams.get('state')!
    const tampered = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')
    await expect(svc.handleCallback(principal, 'code_xyz', tampered)).rejects.toThrow(/invalid oauth state/i)
  })
})
