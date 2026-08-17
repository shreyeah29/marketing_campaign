import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_IMAGE_RATIO,
  DEFAULT_VIDEO_RATIO,
  SEED_FRAME_RATIO,
  generateRunwayImage,
} from '../runway.js'

/**
 * Ratios are the one Runway input we cannot get wrong quietly.
 *
 * Send a value the model does not accept and Runway rejects the task before it
 * draws anything — in about half a second, with a 400 that the controller turns
 * into a generic "media generation failed". That is exactly what happened: the
 * adapter used `1280:720`, a gen4_turbo (video) ratio, for gen4_image, and every
 * poster failed while the key and the credits were both fine.
 *
 * The two lists below are Runway's, transcribed from its API documentation.
 * They are the assertion the old code was missing — it carried a comment
 * claiming one value was "valid for both", which no test ever checked.
 */
const GEN4_IMAGE_RATIOS = new Set([
  '1920:1080',
  '1080:1920',
  '1024:1024',
  '1360:768',
  '1080:1080',
  '1168:880',
  '1440:1080',
  '1080:1440',
  '1808:768',
  '2112:912',
])

const GEN4_TURBO_RATIOS = new Set([
  '1280:720',
  '720:1280',
  '1104:832',
  '832:1104',
  '960:960',
  '1584:672',
])

/** "1920:1080" → 1.777… so pairs can be compared by shape, not by string. */
function aspect(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return (w as number) / (h as number)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Runway ratio constants', () => {
  it('defaults to a ratio each model actually accepts', () => {
    expect(GEN4_IMAGE_RATIOS.has(DEFAULT_IMAGE_RATIO)).toBe(true)
    expect(GEN4_TURBO_RATIOS.has(DEFAULT_VIDEO_RATIO)).toBe(true)
  })

  it('never uses a video ratio for an image', () => {
    // The exact bug: 1280:720 is valid for video and invalid for images.
    expect(GEN4_IMAGE_RATIOS.has(DEFAULT_VIDEO_RATIO)).toBe(false)
  })

  it('maps every video ratio to a seed-frame ratio the image model accepts', () => {
    for (const [videoRatio, imageRatio] of SEED_FRAME_RATIO) {
      expect(GEN4_TURBO_RATIOS.has(videoRatio)).toBe(true)
      expect(GEN4_IMAGE_RATIOS.has(imageRatio)).toBe(true)
    }
  })

  it('keeps the seed frame the same shape as the video it becomes', () => {
    for (const [videoRatio, imageRatio] of SEED_FRAME_RATIO) {
      // Within 2%: the two lists offer no exactly-equal pairs for every shape.
      expect(Math.abs(aspect(videoRatio) - aspect(imageRatio))).toBeLessThan(
        aspect(videoRatio) * 0.02,
      )
    }
  })

  it('covers every video ratio Runway accepts', () => {
    // A video ratio with no mapping silently falls back to landscape, which
    // would hand a portrait clip a landscape first frame.
    for (const videoRatio of GEN4_TURBO_RATIOS) {
      expect(SEED_FRAME_RATIO.has(videoRatio)).toBe(true)
    }
  })
})

describe('generateRunwayImage request', () => {
  it('sends a gen4_image ratio to text_to_image', async () => {
    let sent: { model?: string; ratio?: string } = {}

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { body?: string }) => {
        sent = JSON.parse(init?.body ?? '{}') as { model?: string; ratio?: string }
        expect(url).toContain('/text_to_image')
        // Fail the create call so the test never reaches the 5s poll loop.
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'stopped by test' }),
        } as Response)
      }),
    )

    await expect(generateRunwayImage({ apiKey: 'k', prompt: 'a marble surface' })).rejects.toThrow()

    expect(sent.model).toBe('gen4_image')
    expect(sent.ratio).toBeDefined()
    expect(GEN4_IMAGE_RATIOS.has(sent.ratio as string)).toBe(true)
  })
})
