import { describe, expect, it } from 'vitest'

import { buildPosterBrief, withoutMoney } from '../poster-brief.js'

/**
 * The poster brief asks for the opposite of every other image prompt here.
 *
 * Everywhere else the instruction ends with "no text anywhere", because Runway
 * cannot spell. This one lists the words and demands them spelled exactly — so
 * the tests that matter are the ones proving the two paths cannot be confused,
 * and that the money rule survives the switch.
 */

const BRAND = {
  displayName: 'Always Sunday Café',
  primaryColor: '#7B1E1E',
  accentColor: '#E4A11B',
  instagramHandle: '@alwayssunday.cafe',
  locationLine: 'Always Sunday Café, Hyderabad',
}

describe('the brief asks for a design, not a photograph', () => {
  it('demands the exact words and forbids any others', () => {
    const brief = buildPosterBrief({
      headline: '1+1 on all items',
      subline: 'when you bring your sibling',
      brand: BRAND,
    })
    expect(brief).toContain('"1+1 on all items"')
    expect(brief).toContain('"when you bring your sibling"')
    expect(brief).toMatch(/Spell every one of those exactly/)
    expect(brief).toMatch(/Do not add any other words/)
  })

  it('never carries the no-text clause the photographic path appends', () => {
    // The two paths must not be confusable. A poster brief that inherited "no
    // text anywhere" would ask for a poster with nothing written on it.
    const brief = buildPosterBrief({ headline: 'Weekend brunch', brand: BRAND })
    expect(brief).not.toMatch(/no text/i)
    expect(brief).not.toMatch(/no letters/i)
  })

  it('describes a layout rather than a mood', () => {
    // "A beautiful festive poster" produces a mood; naming where each element
    // sits produces a composition.
    const brief = buildPosterBrief({ headline: 'Weekend brunch', brand: BRAND })
    expect(brief).toMatch(/top-left corner/i)
    expect(brief).toMatch(/footer bar/i)
    expect(brief).toMatch(/visual focus/i)
  })

  it('uses the brand kit rather than inventing a look', () => {
    const brief = buildPosterBrief({ headline: 'Weekend brunch', brand: BRAND })
    expect(brief).toContain('#7B1E1E')
    expect(brief).toContain('@alwayssunday.cafe')
    expect(brief).toContain('Always Sunday Café')
  })

  it('omits what the workspace does not have, rather than filling it in', () => {
    const brief = buildPosterBrief({ headline: 'Weekend brunch' })
    expect(brief).not.toMatch(/undefined|null/)
    expect(brief).not.toMatch(/footer bar holding/i)
    expect(brief).toContain('"Weekend brunch"')
  })
})

describe('money never reaches the poster model', () => {
  it('strips an amount a person typed into the headline', () => {
    // "Everything at ₹99" is a natural thing to type. The offer survives, the
    // figure does not — a wrong price on artwork reaches a customer.
    const brief = buildPosterBrief({ headline: 'Everything at ₹99 this weekend', brand: BRAND })
    expect(brief).not.toContain('₹')
    expect(brief).not.toContain('99')
    expect(brief).toContain('this weekend')
  })

  it('keeps an offer that is not a price', () => {
    // 1+1 is a claim the campaign already made and can be checked at a glance.
    expect(withoutMoney('1+1 on all items')).toBe('1+1 on all items')
    expect(withoutMoney('Buy 2 get 1 free')).toBe('Buy 2 get 1 free')
  })

  it('strips every shape an amount arrives in', () => {
    for (const shape of ['Flat ₹200 off', 'Just Rs. 149', 'From 500 rupees', 'Only $9 today']) {
      const cleaned = withoutMoney(shape)
      expect(/[₹$€£]\s?\d/.test(cleaned), shape).toBe(false)
      expect(/\d+\s?(?:rupees?|rs\.?)/i.test(cleaned), shape).toBe(false)
    }
  })

  it('forbids the model adding money of its own', () => {
    const brief = buildPosterBrief({ headline: 'Weekend brunch', brand: BRAND })
    expect(brief).toMatch(/invented offers, prices, amounts of money/i)
  })

  it('leaves dates and counts alone', () => {
    expect(withoutMoney('9–19 August, 2 for 1')).toBe('9–19 August, 2 for 1')
  })
})

describe('the whole poster is written, not just a headline', () => {
  it('lays out every piece the generator produced', () => {
    // The reference poster had twelve lines on it and its author typed none of
    // them. Designing around one typed headline reproduces the input.
    const brief = buildPosterBrief({
      headline: 'Celebrate Bonds Over Good Food',
      copy: {
        headline: 'Celebrate Bonds Over Good Food',
        offer: '1+1',
        offerNote: 'ON ALL ITEMS',
        condition: 'WHEN YOU BRING YOUR SIBLING',
        features: ['Bring Your Sibling', 'Enjoy Any 2 Items', 'Make Memories'],
        dateLine: '9TH – 19TH AUGUST',
        footnote: '*T&C Apply',
      },
      brand: BRAND,
    })

    expect(brief).toContain('"1+1"')
    expect(brief).toMatch(/single largest element/i)
    expect(brief).toContain('"ON ALL ITEMS"')
    expect(brief).toContain('"WHEN YOU BRING YOUR SIBLING"')
    expect(brief).toContain('"Bring Your Sibling"')
    expect(brief).toContain('"9TH – 19TH AUGUST"')
    expect(brief).toContain('"*T&C Apply"')
  })

  it('caps the icon row at four, because it is a row', () => {
    const brief = buildPosterBrief({
      headline: 'Weekend brunch',
      copy: {
        headline: 'Weekend brunch',
        features: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
      },
    })
    expect([...brief.matchAll(/One icon caption/g)]).toHaveLength(4)
    expect(brief).not.toContain('"Five"')
  })

  it('keeps money out of the generated lines too', () => {
    // The generator is told not to, and told-not-to is not a guarantee.
    const brief = buildPosterBrief({
      headline: 'Weekend brunch',
      copy: { headline: 'Weekend brunch', offer: 'Flat ₹200 off', offerNote: 'from Rs. 149' },
    })
    expect(brief).not.toContain('₹')
    expect(brief).not.toMatch(/Rs\.\s?149/)
  })

  it('omits a piece the campaign does not have', () => {
    const brief = buildPosterBrief({
      headline: 'Weekend brunch',
      copy: { headline: 'Weekend brunch' },
    })
    expect(brief).not.toMatch(/icon caption/i)
    expect(brief).not.toMatch(/date badge/i)
    expect(brief).not.toMatch(/small print/i)
  })
})
