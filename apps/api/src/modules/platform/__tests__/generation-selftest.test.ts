import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvCache } from '../../../config/env.js'

/**
 * The self-test's job is to name the broken step and stop.
 *
 * These cover the behaviours that make it worth having rather than the plumbing:
 * that the walk stops at the first real failure instead of reporting five
 * consequences of one cause, that the expensive step is genuinely optional, and
 * that a provider's own text never reaches the response.
 */

const listAvailableImageModels = vi.fn()
const generateImage = vi.fn()
const checkRunwayKey = vi.fn()

vi.mock('../../ai/adapters/openai-media.js', () => ({
  listAvailableImageModels: (...a: unknown[]) => listAvailableImageModels(...a),
  generateImage: (...a: unknown[]) => generateImage(...a),
  imageModelCandidates: (configured?: string | null) =>
    configured ? [configured] : ['gpt-image-2', 'gpt-image-1', 'dall-e-3'],
}))

vi.mock('../../ai/adapters/runway.js', () => ({
  checkRunwayKey: (...a: unknown[]) => checkRunwayKey(...a),
}))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
const persistBytes = vi.fn()

async function service() {
  const { GenerationSelfTestService } = await import('../generation-selftest.service.js')
  return new GenerationSelfTestService(logger as never, { persistBytes } as never)
}

/** The minimum a valid environment needs for `loadEnv` to parse. */
const BASE_ENV = {
  DATABASE_URL: 'postgresql://app:pw@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  ENCRYPTION_MASTER_KEY: 'y'.repeat(32),
}

function setEnv(extra: Record<string, string | undefined>): void {
  resetEnvCache()
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...extra })) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

const ORIGINAL = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  checkRunwayKey.mockResolvedValue({ ok: true, detail: 'ok' })
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  resetEnvCache()
})

describe('GenerationSelfTestService', () => {
  it('stops at the missing key rather than reporting five consequences of it', async () => {
    setEnv({ OPENAI_API_KEY: undefined, RUNWAY_API_KEY: undefined })
    const result = await (await service()).run(true)

    expect(result.ok).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]?.id).toBe('openai-key')
    expect(result.steps[0]?.detail).toMatch(/OPENAI_API_KEY/)
    // Nothing downstream is even attempted — no listing, no drawing, no upload.
    expect(listAvailableImageModels).not.toHaveBeenCalled()
    expect(generateImage).not.toHaveBeenCalled()
    expect(persistBytes).not.toHaveBeenCalled()
  })

  it('separates "the key is invalid" from "the project cannot draw"', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-test' })
    listAvailableImageModels.mockResolvedValue({
      image: [],
      total: 0,
      unreadable: true,
      sample: [],
    })
    const invalid = await (await service()).run(false)
    expect(invalid.steps.at(-1)?.id).toBe('openai-reachable')
    expect(invalid.steps.at(-1)?.detail).toMatch(/invalid|revoked/i)

    // A key that lists plenty of models but none that draw is a different
    // problem with a different fix, and the message must say so. This is the
    // gpt-image-1 case that cost an afternoon of deploys.
    listAvailableImageModels.mockResolvedValue({
      image: [],
      total: 42,
      unreadable: false,
      sample: [],
    })
    const cannotDraw = await (await service()).run(false)
    expect(cannotDraw.steps.at(-1)?.id).toBe('openai-image-model')
    expect(cannotDraw.steps.at(-1)?.detail).toMatch(/Settings/)
  })

  it('names the models the key can use when the configured one is not among them', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-test', OPENAI_IMAGE_MODEL: 'gpt-image-9' })
    listAvailableImageModels.mockResolvedValue({
      image: ['dall-e-3', 'gpt-image-2'],
      total: 40,
      unreadable: false,
      sample: [],
    })
    const result = await (await service()).run(false)
    const step = result.steps.find((s) => s.id === 'openai-image-model')
    expect(step?.status).toBe('fail')
    expect(step?.detail).toContain('gpt-image-2')
    expect(step?.detail).toMatch(/OPENAI_IMAGE_MODEL/)
  })

  it('does not draw or upload unless asked, because that costs money', async () => {
    setEnv({
      OPENAI_API_KEY: 'sk-test',
      RUNWAY_API_KEY: 'rw',
      SUPABASE_URL: 'https://s.co',
      SUPABASE_SERVICE_KEY: 'k',
    })
    listAvailableImageModels.mockResolvedValue({
      image: ['gpt-image-2'],
      total: 40,
      unreadable: false,
      sample: [],
    })

    const cheap = await (await service()).run(false)
    expect(generateImage).not.toHaveBeenCalled()
    expect(persistBytes).not.toHaveBeenCalled()
    expect(cheap.steps.find((s) => s.id === 'openai-draw')?.status).toBe('skip')
    expect(cheap.drew).toBe(false)
    // Skipping is not failing: a run with nothing wrong still reports ok.
    expect(cheap.ok).toBe(true)

    generateImage.mockResolvedValue({
      b64: Buffer.from('png').toString('base64'),
      model: 'gpt-image-2',
    })
    persistBytes.mockResolvedValue({ persisted: true, url: 'https://s.co/x.png', storageKey: 'x' })
    const full = await (await service()).run(true)
    expect(generateImage).toHaveBeenCalledOnce()
    expect(persistBytes).toHaveBeenCalledOnce()
    expect(full.drew).toBe(true)
    expect(full.ok).toBe(true)
  })

  it('reports a drawn-but-unstorable picture as a storage failure, not a drawing one', async () => {
    // The order that matters: this combination is why a poster could generate
    // successfully and still never appear.
    setEnv({ OPENAI_API_KEY: 'sk-test', SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_KEY: 'k' })
    listAvailableImageModels.mockResolvedValue({
      image: ['gpt-image-2'],
      total: 40,
      unreadable: false,
      sample: [],
    })
    generateImage.mockResolvedValue({
      b64: Buffer.from('png').toString('base64'),
      model: 'gpt-image-2',
    })
    persistBytes.mockResolvedValue({ persisted: false, url: 'https://provider/x', storageKey: 'x' })

    const result = await (await service()).run(true)
    expect(result.steps.find((s) => s.id === 'openai-draw')?.status).toBe('pass')
    expect(result.steps.find((s) => s.id === 'storage-write')?.status).toBe('fail')
    expect(result.ok).toBe(false)
  })

  it('flags unset storage before spending an image to find out', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-test', SUPABASE_URL: undefined, SUPABASE_SERVICE_KEY: undefined })
    listAvailableImageModels.mockResolvedValue({
      image: ['gpt-image-2'],
      total: 40,
      unreadable: false,
      sample: [],
    })
    const result = await (await service()).run(false)
    const config = result.steps.find((s) => s.id === 'storage-config')
    const draw = result.steps.findIndex((s) => s.id === 'openai-draw')
    expect(config?.status).toBe('fail')
    // Ordering is the point: knowing storage is unset is free, so it is reported
    // before the step that bills for an image.
    expect(result.steps.findIndex((s) => s.id === 'storage-config')).toBeLessThan(draw)
  })

  it('treats Runway as a separate answer, not part of one verdict', async () => {
    setEnv({
      OPENAI_API_KEY: 'sk-test',
      RUNWAY_API_KEY: 'rw',
      SUPABASE_URL: 'https://s.co',
      SUPABASE_SERVICE_KEY: 'k',
    })
    listAvailableImageModels.mockResolvedValue({
      image: ['gpt-image-2'],
      total: 40,
      unreadable: false,
      sample: [],
    })
    checkRunwayKey.mockResolvedValue({
      ok: false,
      status: 401,
      detail: 'Unauthorized for org_secret',
    })

    const result = await (await service()).run(false)
    // Posters are fine; photography is not. Both facts survive.
    expect(result.steps.find((s) => s.id === 'openai-image-model')?.status).toBe('pass')
    const runway = result.steps.find((s) => s.id === 'runway-reachable')
    expect(runway?.status).toBe('fail')
    // The provider's own text names an account and must not be forwarded.
    expect(runway?.detail).not.toContain('org_secret')
  })
})
