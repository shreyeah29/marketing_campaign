import { describe, expect, it } from 'vitest'

import {
  COACH_DIMENSIONS,
  buildCoachAnswerPrompt,
  buildCoachPrompt,
  COST_BOUNDARY_RULES,
  parseCoachResult,
  scrubCoachResult,
  scrubMoney,
} from '../brief-coach.prompt.js'

/**
 * The coach speaks directly to a client, so the cost boundary is tested at both
 * ends: the instruction the model is given, and what happens when it ignores it.
 *
 * The second half is the part that matters. "How much should I spend?" is a
 * direct request to break the rule, and a model weighing one prompt line against
 * an explicit question will usually answer the question — helpfully, in rupees,
 * inside a brief the client is about to approve. So the prompt is asserted
 * because it is the first defence, and the scrubber is asserted because it is
 * the one that does not depend on cooperation.
 */

/** Every shape money arrives in, gathered in one place. */
const CURRENCY = [
  { name: 'rupee symbol', re: /₹/ },
  { name: 'dollar symbol', re: /\$/ },
  { name: 'euro or pound', re: /[€£]/ },
  { name: 'currency code', re: /\b(?:INR|USD|EUR|GBP)\b/i },
  { name: 'the word rupees', re: /\brupees?\b/i },
  { name: 'lakh or crore amount', re: /\b\d[\d,.]*\s?(?:lakh|crore|k)\b/i },
  { name: 'a comma-grouped amount', re: /\b\d{1,3}(?:,\d{2,3})+\b/ },
  { name: 'the word budget', re: /\bbudget/i },
  { name: 'the word spend', re: /\bspend/i },
  { name: 'the word credits', re: /\bcredits?\b/i },
]

function expectNoMoney(text: string, context: string): void {
  for (const { name, re } of CURRENCY) {
    expect(re.test(text), `${context} contains ${name}: ${text}`).toBe(false)
  }
}

const GROUNDING = {
  products: ['- Caramel Iced Latte', '- Lazy Chocos Latte'],
  brand: ['- Business: Always Sunday'],
  campaigns: ['- Republic Day Sale'],
}

describe('the prompt forbids money and offers pace instead', () => {
  it('states the rule in the coaching prompt', () => {
    const prompt = buildCoachPrompt(GROUNDING)
    expect(prompt).toContain('MONEY IS FORBIDDEN')
    expect(prompt).toContain('₹')
    expect(prompt).toMatch(/Light, Standard or Heavy/)
  })

  it('states it again in the answer prompt, where the question is asked', () => {
    const prompt = buildCoachAnswerPrompt()
    expect(prompt).toContain(COST_BOUNDARY_RULES)
    expect(prompt).toMatch(/how much should I spend/i)
  })

  it("keeps the client's own prices out of the model's context", () => {
    // The catalogue holds prices; the grounding must not. A price handed to the
    // model is an invitation to write it into the sharpened brief, which would
    // be the coach adding money — however true the figure.
    const prompt = buildCoachPrompt(GROUNDING)
    expect(prompt).not.toMatch(/₹\s?\d/)
    expect(prompt).toContain("If the brief already contains the client's own product prices")
  })
})

describe('the rewrite is written for an image model', () => {
  it('asks for the specifics a photograph needs', () => {
    // The point of the coach. What a person types carries none of this, and an
    // image model asked for "a campaign for my latte" invents a setting, a light
    // and a mood — producing a competent photograph of nobody's product.
    const prompt = buildCoachPrompt(GROUNDING)
    expect(prompt).toContain('PHOTOGRAPHY DIRECTION')
    expect(prompt).toMatch(/light a quality and a direction/i)
    expect(prompt).toMatch(/depth/i)
    expect(prompt).toMatch(/three or four colours/i)
  })

  it('forbids text inside the image, where the price would be faked', () => {
    // Every figure on the finished poster is laid on afterwards from the
    // catalogue. A model asked for a price draws something that resembles one.
    const prompt = buildCoachPrompt(GROUNDING)
    expect(prompt).toMatch(/NEVER ask for text, letters, numbers, prices or logos/i)
    expect(prompt).toMatch(/calm, uncluttered area/i)
  })

  it('still refuses to become a prompt template', () => {
    // The failure on the other side: a brief about brunch with a list of camera
    // settings stapled to it. It is the client's brief, in their voice.
    expect(buildCoachPrompt(GROUNDING)).toMatch(/direction, not a prompt template/i)
  })
})

describe('look & feel is not a dimension', () => {
  it('is absent from the shape the model is asked for', () => {
    // It is chosen from the gallery on intake, so a chip here could name a gap
    // and offer no way to close it. The prompt must not reintroduce it.
    const prompt = buildCoachPrompt(GROUNDING)
    expect(prompt).not.toMatch(/"look"/)
    expect(prompt).toMatch(/Visual direction is NOT one of the dimensions/)
    expect(prompt).not.toMatch(/"look": bool/)
    expect(COACH_DIMENSIONS.map((d) => d.id)).toEqual([
      'product',
      'offer',
      'timing',
      'audience',
      'success',
    ])
  })

  it('is ignored when a model returns it anyway', () => {
    // Coverage is built from COACH_DIMENSIONS, so a stray key cannot make the
    // meter longer than the chips.
    const withLook = JSON.stringify({
      coverage: {
        product: true,
        offer: true,
        timing: true,
        audience: true,
        success: true,
        look: true,
      },
      sharpened: 'A complete brief.',
    })
    const result = parseCoachResult(withLook)
    expect(Object.keys(result?.coverage ?? {})).toEqual([
      'product',
      'offer',
      'timing',
      'audience',
      'success',
    ])
  })

  it('tells the model to stop asking once a direction is chosen', () => {
    const prompt = buildCoachPrompt({ ...GROUNDING, lookChosen: true })
    expect(prompt).toMatch(/already been chosen/)
    // And says nothing of the sort when it is not.
    expect(buildCoachPrompt(GROUNDING)).not.toMatch(/already been chosen/)
  })
})

describe('a model that answers the money question anyway', () => {
  it('strips the amount from "how much should I spend?"', () => {
    // The exact failure this guards: a helpful, plausible, forbidden answer.
    const modelAnswer =
      'For a 15-day festive push I would budget ₹25,000 — about ₹1,600 a day. ' +
      'Put 60% behind prospecting and keep the rest for retargeting.'

    const { text, changed } = scrubMoney(modelAnswer)

    expect(changed).toBe(true)
    expectNoMoney(text, 'the scrubbed answer')
    // Still a sentence, and still about the thing the client can act on.
    expect(text).toMatch(/pace/i)
    expect(text).toContain('prospecting')
    expect(text).toContain('60%')
  })

  it('handles every shape an amount arrives in', () => {
    const shapes = [
      'Spend ₹25,000 this month.',
      'A budget of Rs. 12,500 works.',
      'Allocate INR 40000 to this.',
      'Around 2 lakh is typical.',
      'That is roughly $1.2k a week.',
      'Set aside 15,000 rupees.',
      'It costs 3 crore over the year.',
    ]
    for (const shape of shapes) {
      expectNoMoney(scrubMoney(shape).text, `"${shape}"`)
    }
  })

  it('leaves percentages, dates and counts alone', () => {
    // Over-scrubbing has a cost too: these are the numbers a client acts on.
    const kept = 'Run it for 15 days, aim for 30% more reach, and post 5 times a week.'
    const { text, changed } = scrubMoney(kept)
    expect(changed).toBe(false)
    expect(text).toBe(kept)
  })

  it('rewrites money words rather than deleting the sentence around them', () => {
    // "Increase your budget" → "Increase your pace" is both true and actionable.
    // Deleting the word would leave "Increase your ." which reads as a bug.
    expect(scrubMoney('Increase your budget for the launch week.').text).toBe(
      'Increase your pace for the launch week.',
    )
    expect(scrubMoney('Budget more for retargeting.').text).toBe('Pace more for retargeting.')
  })
})

describe('parsing the coach result', () => {
  const valid = JSON.stringify({
    coverage: {
      product: true,
      offer: true,
      timing: false,
      audience: false,
      success: false,
    },
    priority: 'audience',
    scaffolds: { audience: 'It is for ', timing: 'It runs from ' },
    sharpened: 'Launch the Caramel Iced Latte with a weekend offer for young professionals.',
    added: ['for young professionals'],
    summary: 'adds audience',
  })

  it('reads the whole shape', () => {
    const result = parseCoachResult(valid)
    expect(result?.coverage.product).toBe(true)
    expect(result?.coverage.timing).toBe(false)
    expect(result?.priority).toBe('audience')
    expect(result?.scaffolds.audience).toBe('It is for')
    expect(result?.added).toEqual(['for young professionals'])
  })

  it('survives a fenced response', () => {
    expect(parseCoachResult('```json\n' + valid + '\n```')).not.toBeNull()
  })

  it('drops highlight spans that are not in the rewrite', () => {
    // A span that does not match would paint the wrong words or throw at render.
    const drifted = JSON.stringify({
      coverage: {
        product: true,
        offer: true,
        timing: true,
        audience: true,
        success: true,
      },
      priority: null,
      scaffolds: {},
      sharpened: 'Launch the latte this weekend.',
      added: ['for young professionals', 'this weekend'],
      summary: '',
    })
    expect(parseCoachResult(drifted)?.added).toEqual(['this weekend'])
  })

  it('rejects a result with no rewrite rather than rendering half a card', () => {
    expect(parseCoachResult('{"coverage":{},"sharpened":""}')).toBeNull()
    expect(parseCoachResult('not json at all')).toBeNull()
    expect(parseCoachResult('{"sharpened":"fine but no coverage"}')).toBeNull()
  })

  it('treats a missing dimension as uncovered rather than guessing', () => {
    const partial = JSON.stringify({
      coverage: { product: true },
      sharpened: 'A brief.',
    })
    const result = parseCoachResult(partial)
    expect(result?.coverage.product).toBe(true)
    expect(result?.coverage.audience).toBe(false)
  })
})

describe('scrubbing a whole result', () => {
  it('cleans the rewrite, the summary and the scaffolds together', () => {
    const dirty = parseCoachResult(
      JSON.stringify({
        coverage: {
          product: true,
          offer: true,
          timing: true,
          audience: true,
          success: true,
        },
        priority: null,
        scaffolds: { success: 'We would spend ₹20,000 to get ' },
        sharpened: 'Launch the latte with a ₹25,000 budget across two weeks.',
        added: ['with a ₹25,000 budget'],
        summary: 'adds the budget of ₹25,000',
      }),
    )
    expect(dirty).not.toBeNull()

    const clean = scrubCoachResult(dirty!)
    expectNoMoney(clean.sharpened, 'sharpened')
    expectNoMoney(clean.summary, 'summary')
    expectNoMoney(clean.scaffolds.success ?? '', 'scaffold')

    // Every surviving highlight still exists in the scrubbed text, so the
    // rendering can find it.
    for (const span of clean.added) {
      expect(clean.sharpened.includes(span), `highlight "${span}" is not in the rewrite`).toBe(true)
    }
  })
})
