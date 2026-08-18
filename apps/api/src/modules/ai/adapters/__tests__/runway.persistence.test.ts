import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateRunwayImage, generateRunwayVideo } from '../runway.js'

/**
 * Runway's URLs expire; ours do not. Nothing may leave this adapter holding one.
 *
 * The failure this guards against is invisible at the time it happens. A
 * generation succeeds, the row is written with `https://…runwayml.com/…`, the
 * image loads all afternoon, and some days later every asset in the library is a
 * broken rectangle with no error anywhere to explain it. So the adapter copies
 * each asset into our storage before returning, and refuses to return a URL that
 * is still the provider's.
 */

const RUNWAY_URL = 'https://dnznrvs01_.cloudfront.runwayml.com/out/abc123.png'
const RUNWAY_VIDEO_URL = 'https://dnznrvs01_.cloudfront.runwayml.com/out/abc123.mp4'

interface FetchCall {
  url: string
  body: unknown
}

/**
 * A Runway that always succeeds.
 *
 * `image_to_video` and `text_to_image` both return a task id, and the task poll
 * returns the given output. Timers are faked so the adapter's five-second poll
 * interval does not make the suite take a minute.
 */
function mockRunway(output: string): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        calls.push({ url, body: JSON.parse(String(init.body)) })
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'task_1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'task_1', status: 'SUCCEEDED', output: [output] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/**
 * Runs `fn` while advancing fake timers, so the poll sleep resolves at once.
 *
 * The outcome is captured before the timers are advanced. Without that, a
 * rejection raised while draining the loop has no handler attached yet and
 * Vitest reports it as an unhandled rejection — a failing suite for a test that
 * is doing exactly what it says.
 */
async function withoutWaiting<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers()
  const settled = fn().then(
    (value) => ({ ok: true, value }) as const,
    (error: unknown) => ({ ok: false, error }) as const,
  )
  // Drain the poll loop: each iteration sleeps once, then awaits a fetch.
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(6_000)
  }
  const outcome = await settled
  if (outcome.ok) return outcome.value
  throw outcome.error
}

describe('generated media is copied into our storage', () => {
  it('returns our URL, never the provider’s', async () => {
    mockRunway(RUNWAY_URL)
    const persist = vi.fn((_url: string, key: string) =>
      Promise.resolve(`https://bucket.test/${key}.png`),
    )

    const result = await withoutWaiting(() =>
      generateRunwayImage({
        apiKey: 'k',
        prompt: 'a caramel latte',
        persist,
        storageKey: 'org_1/assets/a_1/v0',
      }),
    )

    expect(persist).toHaveBeenCalledWith(RUNWAY_URL, 'org_1/assets/a_1/v0')
    expect(result.url).toBe('https://bucket.test/org_1/assets/a_1/v0.png')
    expect(result.url).not.toContain('runwayml.com')
  })

  it('fails loudly when the copy fails, rather than persisting an expiring URL', async () => {
    // The storage service throws when the bucket is unconfigured. The generation
    // has already been paid for at this point, and losing it is still better
    // than writing a link that works today and 404s next week — because the
    // second one is not discovered until it is too late to regenerate cheaply.
    mockRunway(RUNWAY_URL)
    const persist = vi.fn(() => Promise.reject(new Error('SUPABASE_URL is not set')))

    await expect(
      withoutWaiting(() =>
        generateRunwayImage({
          apiKey: 'k',
          prompt: 'a caramel latte',
          persist,
          storageKey: 'org_1/assets/a_1/v0',
        }),
      ),
    ).rejects.toThrow(/SUPABASE_URL is not set/)
  })

  it('refuses a persister that hands back the provider’s URL unchanged', async () => {
    // The shape of a well-meaning regression: a `persist` that catches its own
    // error and falls back to the source. It compiles, it returns a string, and
    // every asset it touches dies within days. The adapter checks rather than
    // trusting the contract.
    mockRunway(RUNWAY_URL)
    const persist = vi.fn((url: string) => Promise.resolve(url))

    await expect(
      withoutWaiting(() =>
        generateRunwayImage({
          apiKey: 'k',
          prompt: 'a caramel latte',
          persist,
          storageKey: 'org_1/assets/a_1/v0',
        }),
      ),
    ).rejects.toThrow(/still the provider/i)
  })

  it('refuses an empty URL from the persister', async () => {
    mockRunway(RUNWAY_URL)
    const persist = vi.fn(() => Promise.resolve(''))

    await expect(
      withoutWaiting(() =>
        generateRunwayImage({
          apiKey: 'k',
          prompt: 'a caramel latte',
          persist,
          storageKey: 'org_1/assets/a_1/v0',
        }),
      ),
    ).rejects.toThrow(/could not be stored/i)
  })
})

describe('re-running a generation does not orphan files', () => {
  it('writes to the same key both times', async () => {
    // Idempotence here is the storage key, not a cache: the upload upserts, so
    // an identical key overwrites the previous object. A key containing a
    // timestamp — which is what this replaced — leaves the first file in the
    // bucket with nothing in the database pointing at it, on every retry.
    const keys: string[] = []
    const persist = vi.fn((_url: string, key: string) => {
      keys.push(key)
      return Promise.resolve(`https://bucket.test/${key}.png`)
    })

    for (let run = 0; run < 2; run++) {
      mockRunway(RUNWAY_URL)
      await withoutWaiting(() =>
        generateRunwayImage({
          apiKey: 'k',
          prompt: 'a caramel latte',
          persist,
          storageKey: 'org_1/assets/a_1/v0',
        }),
      )
      vi.unstubAllGlobals()
    }

    expect(keys).toEqual(['org_1/assets/a_1/v0', 'org_1/assets/a_1/v0'])
    expect(new Set(keys).size).toBe(1)
  })
})

describe('the video path stores both the clip and its seed frame', () => {
  it('keeps the frame under a sibling key and sends our URL to Runway', async () => {
    const calls = mockRunway(RUNWAY_VIDEO_URL)
    const persist = vi.fn((_url: string, key: string) =>
      Promise.resolve(`https://bucket.test/${key}.bin`),
    )

    const result = await withoutWaiting(() =>
      generateRunwayVideo({
        apiKey: 'k',
        prompt: 'a caramel latte, slow pour',
        persist,
        storageKey: 'org_1/assets/v_1/v0',
      }),
    )

    // The seed frame first, then the clip — both ours, and the frame's key is a
    // sibling of the clip's so a regeneration replaces the pair.
    expect(persist.mock.calls.map((c) => c[1])).toEqual([
      'org_1/assets/v_1/v0-frame',
      'org_1/assets/v_1/v0',
    ])
    expect(result.url).toBe('https://bucket.test/org_1/assets/v_1/v0.bin')

    // image_to_video is handed our stored frame, not Runway's expiring one.
    const videoCall = calls.find((c) => c.url.includes('image_to_video'))
    const body = videoCall?.body as { promptImage?: string } | undefined
    expect(body?.promptImage).toBe('https://bucket.test/org_1/assets/v_1/v0-frame.bin')
  })
})
