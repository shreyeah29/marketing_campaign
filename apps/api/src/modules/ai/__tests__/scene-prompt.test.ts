import { describe, expect, it } from 'vitest'

import {
  buildImageDirection,
  PRODUCT_REFERENCE_TAG,
  RUNWAY_RATIO,
  buildProductShotPrompt,
  buildScenePrompt,
  clampImagePrompt,
} from '../scene-prompt.js'

/** gen4_image's published ratio list. A value outside it is a 400, not a crop. */
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

const LIMIT = 1000

describe('RUNWAY_RATIO', () => {
  it('maps every template aspect to a ratio Runway accepts', () => {
    for (const [aspect, ratio] of Object.entries(RUNWAY_RATIO)) {
      expect(GEN4_IMAGE_RATIOS.has(ratio), `${aspect} → ${ratio}`).toBe(true)
    }
  })

  it('covers every aspect the templates render at', () => {
    for (const aspect of ['1:1', '4:5', '9:16', '16:9']) {
      expect(RUNWAY_RATIO[aspect]).toBeDefined()
    }
  })
})

describe('clampImagePrompt', () => {
  const long = 'a warm marble counter with soft directional studio light '.repeat(40)

  it('leaves a prompt that already fits completely alone', () => {
    const out = clampImagePrompt('Concept 1', 'A calm marble surface.', LIMIT)
    expect(out).toBe('Concept 1 — A calm marble surface.')
  })

  it('brings an over-long prompt within the limit', () => {
    expect(long.length).toBeGreaterThan(LIMIT)
    const out = clampImagePrompt('Concept 1', long, LIMIT)
    expect(out.length).toBeLessThanOrEqual(LIMIT)
  })

  it('keeps the no-text instruction, which is what truncation would destroy', () => {
    // The whole reason this function exists: the campaign generator puts the
    // no-text rule at the END of the prompt, so trimming the tail removes the
    // one constraint that stops Runway drawing invented lettering.
    const out = clampImagePrompt('Concept 1', long, LIMIT)
    expect(out).toContain('No text, letters, numbers or logos')
  })

  it('keeps the beginning of the description', () => {
    const out = clampImagePrompt('Concept 1', long, LIMIT)
    expect(out.startsWith('Concept 1 — a warm marble counter')).toBe(true)
  })

  it('does not end mid-word or on dangling punctuation', () => {
    const out = clampImagePrompt('Concept 1', long, LIMIT)
    expect(out).not.toMatch(/\s[—,;:-]\s*No text/)
  })

  it('prefers the no-text rule over detail when the budget is tiny', () => {
    const out = clampImagePrompt('Concept 1', long, 60)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.startsWith('No text')).toBe(true)
  })

  it('handles a missing title', () => {
    const out = clampImagePrompt(null, 'A calm marble surface.', LIMIT)
    expect(out).toBe('A calm marble surface.')
  })
})

describe('buildScenePrompt', () => {
  it('fits inside Runway’s prompt budget', () => {
    // The scene prompt repeats its exclusions deliberately; that repetition
    // must not push it past the limit that rejects the whole request.
    const out = buildScenePrompt({ theme: 'Republic Day', mood: 'festive and warm' })
    expect(out.length).toBeLessThanOrEqual(LIMIT)
  })

  it('always forbids text and products', () => {
    const out = buildScenePrompt()
    expect(out).toContain('no text')
    expect(out).toContain('no product')
  })
})

describe('buildProductShotPrompt', () => {
  it('names the reference tag literally, or the photograph is ignored', () => {
    // Runway matches a reference by its tag appearing in the prompt. A prompt
    // that never mentions it generates a plausible invented product instead —
    // a failure that returns a perfectly good image and is therefore invisible.
    const prompt = buildProductShotPrompt({ productName: 'Caramel latte' })
    expect(prompt).toContain(`@${PRODUCT_REFERENCE_TAG}`)
  })

  it('asks for faithfulness to the reference', () => {
    const prompt = buildProductShotPrompt({ productName: 'Caramel latte' })
    expect(prompt).toMatch(/faithful to the reference/i)
    expect(prompt).toContain('Caramel latte')
  })

  it('carries the operator’s own direction verbatim', () => {
    const prompt = buildProductShotPrompt({
      productName: 'Caramel latte',
      direction: 'sunlit marble table, aesthetic, very realistic',
    })
    expect(prompt).toContain('sunlit marble table, aesthetic, very realistic')
  })

  it('still forbids text, which is what keeps invented prices off a poster', () => {
    const prompt = buildProductShotPrompt({ productName: 'Caramel latte' })
    expect(prompt).toMatch(/no text/i)
    expect(prompt).toMatch(/no writing of any kind/i)
  })

  it('works with nothing supplied at all', () => {
    const prompt = buildProductShotPrompt()
    expect(prompt).toContain(`@${PRODUCT_REFERENCE_TAG}`)
    expect(prompt.length).toBeGreaterThan(80)
  })
})

describe('buildImageDirection', () => {
  it('names the place, so the cast is not left to the model to guess', () => {
    // The actual failure: a Rakshabandhan brief for a Hyderabad café returned
    // two East-Asian faces at a table. The audience was in the brief the whole
    // time and nothing required it to reach the picture.
    const direction = buildImageDirection({ locations: ['Hyderabad'] })
    expect(direction).toContain('Hyderabad')
    expect(direction).toMatch(/authentically local/i)
    expect(direction).toMatch(/not a generic international cast/i)
  })

  it('does not populate an empty scene with people', () => {
    // Most product shots have nobody in them. "If people appear" rather than
    // "add people" is the difference between a rule and an instruction.
    expect(buildImageDirection({ locations: ['Mumbai'] })).toMatch(/if people appear/i)
  })

  it('knows Rakshabandhan is between siblings, not a couple', () => {
    // The other half of the same picture being wrong. A romantic couple is not a
    // stylistic miss here, it is the wrong relationship for the festival.
    const direction = buildImageDirection({ theme: 'Rakshabandhan Sale' })
    expect(direction).toMatch(/rakhi/i)
    expect(direction).toMatch(/siblings, not a couple/i)
  })

  it('matches an occasion however it is spelled', () => {
    for (const theme of ['raksha bandhan', 'Rakhi Offers', 'RAKSHABANDHAN']) {
      expect(buildImageDirection({ theme }), theme).toMatch(/rakhi/i)
    }
  })

  it('carries both the place and the occasion together', () => {
    const direction = buildImageDirection({
      locations: ['Hyderabad'],
      theme: 'Rakshabandhan at the cafe',
    })
    expect(direction).toContain('Hyderabad')
    expect(direction).toMatch(/rakhi/i)
  })

  it('says nothing when it knows nothing', () => {
    // An empty direction must not append stray punctuation to a prompt that is
    // already at its character limit.
    expect(buildImageDirection({})).toBe('')
    expect(buildImageDirection({ locations: [], theme: '   ' })).toBe('')
  })

  it('leaves an unrecognised theme alone rather than inventing a culture', () => {
    const direction = buildImageDirection({ theme: 'Autumn menu refresh' })
    expect(direction).toBe('')
  })
})
