import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppLogger } from '@vsp/observability'

import { resetEnvCache } from '../../config/env.js'
import { StorageService } from '../storage.js'

/**
 * The behaviour worth pinning here is the *fallback*, not the happy path.
 *
 * A creative that cannot be copied into the bucket must still reach the user —
 * they are sitting in front of the screen waiting for a poster, and an
 * unconfigured bucket or a flaky upload is not a reason to lose it. Every test
 * below asserts one of the two halves of that contract: the durable URL when
 * storage works, the provider's own URL and `persisted: false` when it doesn't.
 */

const BASE_ENV = {
  DATABASE_URL: 'postgresql://app:pw@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  ENCRYPTION_MASTER_KEY: 'y'.repeat(32),
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as AppLogger

function withEnv(extra: Record<string, string> = {}): void {
  resetEnvCache()
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...extra })) process.env[k] = v
}

function png(bytes = 4): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })
}

beforeEach(() => {
  delete process.env['SUPABASE_URL']
  delete process.env['SUPABASE_SERVICE_KEY']
  delete process.env['SUPABASE_BUCKET']
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetEnvCache()
})

describe('StorageService', () => {
  it('returns the provider URL untouched when no bucket is configured', async () => {
    withEnv()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch)

    const result = await new StorageService(logger).persist('https://runway.example/a.png', 'org/1')

    expect(result).toEqual({
      url: 'https://runway.example/a.png',
      storageKey: 'org/1',
      persisted: false,
    })
    // Nothing was downloaded — an unconfigured deployment must not burn
    // bandwidth fetching bytes it has nowhere to put.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uploads to the bucket and returns the public URL', async () => {
    withEnv({
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-key',
      SUPABASE_BUCKET: 'creatives',
    })

    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        calls.push({ url: String(input), ...(init ? { init } : {}) })
        return Promise.resolve(
          init?.method === 'POST' ? new Response('{}', { status: 200 }) : png(),
        )
      }) as unknown as typeof fetch,
    )

    const result = await new StorageService(logger).persist(
      'https://runway.example/a.png',
      'org1/asset1/123',
    )

    expect(result.persisted).toBe(true)
    // The extension comes from the source's content-type, not the source URL —
    // Runway's links carry query strings and no usable suffix.
    expect(result.storageKey).toBe('org1/asset1/123.png')
    expect(result.url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/creatives/org1/asset1/123.png',
    )

    const upload = calls[1]
    expect(upload?.url).toBe(
      'https://proj.supabase.co/storage/v1/object/creatives/org1/asset1/123.png',
    )
    const headers = upload?.init?.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer service-key')
    expect(headers['x-upsert']).toBe('true')
  })

  it('falls back to the provider URL when the upload is rejected', async () => {
    withEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_KEY: 'service-key' })
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string | URL, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'POST' ? new Response('bucket not found', { status: 404 }) : png(),
        ),
      ) as unknown as typeof fetch,
    )

    const result = await new StorageService(logger).persist('https://runway.example/a.png', 'k')

    expect(result.url).toBe('https://runway.example/a.png')
    expect(result.persisted).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })

  it('falls back when the provider URL itself has already expired', async () => {
    withEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_KEY: 'service-key' })
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('gone', { status: 403 })),
      ) as unknown as typeof fetch,
    )

    const result = await new StorageService(logger).persist('https://runway.example/a.png', 'k')
    expect(result).toEqual({
      url: 'https://runway.example/a.png',
      storageKey: 'k',
      persisted: false,
    })
  })

  it('keys variants by position so identical images never collide', async () => {
    withEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_KEY: 'service-key' })
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string | URL, init?: RequestInit) =>
        Promise.resolve(init?.method === 'POST' ? new Response('{}', { status: 200 }) : png()),
      ) as unknown as typeof fetch,
    )

    const same = 'https://runway.example/same.png'
    const results = await new StorageService(logger).persistMany([same, same], 'org1/asset1/123')

    expect(results.map((r) => r.storageKey)).toEqual([
      'org1/asset1/123-0.png',
      'org1/asset1/123-1.png',
    ])
  })
})
