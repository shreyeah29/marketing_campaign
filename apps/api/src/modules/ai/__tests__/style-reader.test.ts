import { describe, expect, it } from 'vitest'

import { parseReading } from '../style-reader.js'
import { buildPosterBrief } from '../poster-brief.js'

describe('parseReading', () => {
  const good = {
    name: 'Warm Festive',
    summary: 'Golden light on deep reds, generous and celebratory.',
    look: 'A warm palette of deep crimson, gold and cream, lit from a low side angle so surfaces catch a soft highlight. Composition is generous rather than dense, with real breathing room. Surfaces read matte and slightly textured, closer to print than to screen.',
  }

  it('reads a plain JSON reply', () => {
    expect(parseReading(JSON.stringify(good))).toEqual(good)
  })

  it('reads it out of a markdown fence, which models add regardless', () => {
    const fenced = `Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nHope that helps!`
    expect(parseReading(fenced)?.look).toBe(good.look)
  })

  it('rejects a reading with no paragraph, rather than saving a style that does nothing', () => {
    // `look` is the only field that reaches generation. A row without one would
    // sit in the gallery looking real and change nothing about any picture.
    expect(parseReading(JSON.stringify({ name: 'Empty', summary: 'x', look: '' }))).toBeNull()
    expect(parseReading(JSON.stringify({ name: 'Terse', look: 'too short' }))).toBeNull()
  })

  it('returns null rather than throwing on anything unparseable', () => {
    expect(parseReading('I cannot help with that.')).toBeNull()
    expect(parseReading('{ not json at all')).toBeNull()
    expect(parseReading('')).toBeNull()
  })

  it('still yields a usable style when the model omits the optional fields', () => {
    const reading = parseReading(JSON.stringify({ look: good.look }))
    expect(reading?.look).toBe(good.look)
    expect(reading?.name).toBe('Saved style')
    expect(reading?.summary).toBe('')
  })

  it('bounds the fields, so a chatty model cannot write an essay into a card', () => {
    const reading = parseReading(
      JSON.stringify({ name: 'N'.repeat(200), summary: 'S'.repeat(500), look: 'L'.repeat(2000) }),
    )
    expect(reading?.name.length).toBe(40)
    expect(reading?.summary.length).toBe(160)
    expect(reading?.look.length).toBe(900)
  })
})

describe('the saved look inside a poster brief', () => {
  const base = {
    headline: 'Rakshabandhan Special',
    brand: { displayName: 'Chai House', primaryColor: '#8B1E3F' },
  }

  it('carries the look, and says it must not move the layout', () => {
    const brief = buildPosterBrief({
      ...base,
      styleLook: 'Deep crimson and gold, low warm side light, matte textured surfaces.',
    })
    expect(brief).toContain('HOUSE STYLE')
    expect(brief).toContain('Deep crimson and gold')
    // The layout is built from the campaign's own offer and dates just above;
    // a saved style that reopened that decision would contradict it.
    expect(brief).toMatch(/not let it change the layout/i)
  })

  it('adds nothing at all when no style is chosen', () => {
    expect(buildPosterBrief(base)).not.toContain('HOUSE STYLE')
  })

  it('keeps the brand kit’s own colours ahead of the saved look', () => {
    // The palette is a fact about the business; the look is a preference. When
    // they disagree the fact has to be read first.
    const brief = buildPosterBrief({ ...base, styleLook: 'Cool blues and stark white.' })
    expect(brief.indexOf('Palette:')).toBeLessThan(brief.indexOf('HOUSE STYLE'))
  })

  it('keeps an attached reference ahead of the saved look', () => {
    // Attaching a picture to this campaign is the more specific instruction, so
    // it sits closest to the end where it carries the most weight.
    const brief = buildPosterBrief({ ...base, styleLook: 'Cool blues.', hasReference: true })
    expect(brief.indexOf('HOUSE STYLE')).toBeLessThan(brief.indexOf('USING THE ATTACHED REFERENCE'))
  })

  it('carries the client’s own price through, whatever style is applied', () => {
    // The cost boundary governs *our* money — credits, ad spend, margin. A
    // client's own price is the content of their advertisement, and no styling
    // path may quietly remove it.
    const brief = buildPosterBrief({
      headline: 'Everything at ₹99 this week',
      styleLook: 'Warm and bright.',
    })
    expect(brief).toContain('₹99')
  })
})
