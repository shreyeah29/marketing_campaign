import { describe, expect, it } from 'vitest'

import { CREATIVE_DIRECTIONS, findDirection } from '../creative-directions.js'
import {
  buildRecommendPrompt,
  fallbackRecommendations,
  parseRecommendations,
} from '../direction-recommender.js'

describe('the prompt', () => {
  it('offers the model every direction, so it cannot miss one', () => {
    const prompt = buildRecommendPrompt('a café campaign')
    for (const d of CREATIVE_DIRECTIONS) expect(prompt).toContain(d.id)
  })

  it('tells it to prefer a typeset direction when the brief names a real offer', () => {
    // The one rule that matters. A drawn "1+1" can come back "1+l"; a typeset
    // one cannot, so a brief with a concrete figure in it must surface the path
    // that cannot get it wrong.
    expect(buildRecommendPrompt('x')).toMatch(/promotional.*cannot spell it wrong/is)
  })
})

describe('parsing the reply', () => {
  it('reads a plain reply and a fenced one alike', () => {
    const json = '{"picks":[{"id":"promo-pair","reason":"Built for a 1+1"}]}'
    expect(parseRecommendations(json)[0]?.id).toBe('promo-pair')
    expect(parseRecommendations('Sure!\n```json\n' + json + '\n```')[0]?.id).toBe('promo-pair')
  })

  it('drops ids that are not in the catalogue', () => {
    // A card that does not exist renders as a dead tile, and the model has no
    // way of knowing it invented one.
    const picks = parseRecommendations(
      '{"picks":[{"id":"made-up","reason":"x"},{"id":"ai-minimal","reason":"y"}]}',
    )
    expect(picks).toHaveLength(1)
    expect(picks[0]?.id).toBe('ai-minimal')
  })

  it('drops a repeat rather than showing the same card twice', () => {
    const picks = parseRecommendations(
      '{"picks":[{"id":"ai-minimal","reason":"a"},{"id":"ai-minimal","reason":"b"}]}',
    )
    expect(picks).toHaveLength(1)
  })

  it('never returns more than three', () => {
    const many = CREATIVE_DIRECTIONS.slice(0, 6).map((d) => `{"id":"${d.id}","reason":"r"}`)
    expect(parseRecommendations(`{"picks":[${many.join(',')}]}`)).toHaveLength(3)
  })

  it('returns nothing rather than throwing on junk', () => {
    expect(parseRecommendations('I cannot help with that')).toEqual([])
    expect(parseRecommendations('{ broken')).toEqual([])
    expect(parseRecommendations('{"picks":"not an array"}')).toEqual([])
    expect(parseRecommendations('')).toEqual([])
  })
})

describe('the keyword fallback', () => {
  it('always returns three real directions, whatever the brief says', () => {
    for (const brief of ['', 'hello', 'Raksha Bandhan 1+1 at my café until Sunday', 'xyzzy']) {
      const picks = fallbackRecommendations(brief)
      expect(picks, brief).toHaveLength(3)
      for (const p of picks) expect(findDirection(p.id), `${brief} → ${p.id}`).not.toBeNull()
    }
  })

  it('leads with the typeset path when the brief names an offer', () => {
    // Same rule as the prompt's, and it has to hold without a model too —
    // otherwise a deployment with no LLM quietly loses the guarantee.
    expect(fallbackRecommendations('1+1 on all drinks this weekend')[0]?.id).toBe('promo-pair')
    expect(fallbackRecommendations('flat 40% off everything')[0]?.id).toBe('promo-flash')
  })

  it('recognises an occasion', () => {
    const picks = fallbackRecommendations('a Diwali campaign for our store')
    expect(picks.some((p) => p.id === 'ai-festive')).toBe(true)
  })

  it('never suggests a direction that needs something the brief has not got', () => {
    // Product and transform directions require an uploaded picture. Recommending
    // one for a plain text brief sends someone to an empty screen.
    for (const brief of ['a Diwali campaign', 'weekend sale', 'new opening next month']) {
      for (const p of fallbackRecommendations(brief)) {
        expect(findDirection(p.id)?.needs, `${brief} → ${p.id}`).not.toBe('photo')
      }
    }
  })

  it('gives every pick a reason short enough to sit under a card', () => {
    for (const p of fallbackRecommendations('1+1 café offer for Diwali until Sunday')) {
      expect(p.reason.length).toBeGreaterThan(0)
      expect(p.reason.length).toBeLessThanOrEqual(90)
    }
  })
})
