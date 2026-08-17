import { describe, expect, it } from 'vitest'

import {
  allowanceUsedPct,
  majorToMinor,
  monthBounds,
  monthKey,
  nextResetDate,
  thresholdsReached,
} from '../ad-allowance.js'

/**
 * These functions are shared by the API and the worker precisely so the two
 * cannot disagree, so the tests live with them. Every case here is one where
 * being wrong costs a client either a paused campaign or an unbilled month.
 */

describe('allowanceUsedPct', () => {
  it('reads an unconfigured allocation as nothing used, never everything', () => {
    // The failure this prevents: shipping with allocations unset and pausing
    // every ad flight in the system on the first deploy.
    expect(allowanceUsedPct(0, 0)).toBe(0)
    expect(allowanceUsedPct(0, 500_000)).toBe(0)
  })

  it('computes the ordinary case', () => {
    expect(allowanceUsedPct(2_500_000, 625_000)).toBe(25)
    expect(allowanceUsedPct(2_500_000, 2_125_000)).toBe(85)
    expect(allowanceUsedPct(2_500_000, 2_500_000)).toBe(100)
  })

  it('does not clamp an overshoot', () => {
    // Meta restates spend upward for up to ~48 hours. Hiding an overshoot behind
    // a ceiling would hide that we are out of pocket.
    expect(allowanceUsedPct(1_000_000, 1_140_000)).toBe(114)
  })

  it('crosses each alert threshold exactly once', () => {
    expect(allowanceUsedPct(1_000_000, 699_000)).toBe(70)
    expect(allowanceUsedPct(1_000_000, 849_000)).toBe(85)
    expect(allowanceUsedPct(1_000_000, 995_000)).toBe(100)
  })
})

describe('monthKey', () => {
  it('uses the organisation timezone, not the server one', () => {
    // 31 August 19:00 UTC is already 1 September in Auckland. A poller running
    // then must not attribute August's closing hours to September.
    const at = new Date('2026-08-31T19:00:00.000Z')
    expect(monthKey(at, 'UTC')).toBe('2026-08')
    expect(monthKey(at, 'Asia/Kolkata')).toBe('2026-09')
    expect(monthKey(at, 'Pacific/Auckland')).toBe('2026-09')
  })

  it('pads single-digit months', () => {
    expect(monthKey(new Date('2026-01-15T12:00:00.000Z'), 'UTC')).toBe('2026-01')
  })

  it('falls back to UTC on an unknown timezone rather than throwing', () => {
    expect(monthKey(new Date('2026-08-17T12:00:00.000Z'), 'Not/AZone')).toBe('2026-08')
  })
})

describe('nextResetDate', () => {
  it('is the first of next month', () => {
    expect(nextResetDate(new Date('2026-08-17T12:00:00.000Z'), 'UTC')).toBe('2026-09-01')
  })

  it('rolls the year over December', () => {
    expect(nextResetDate(new Date('2026-12-20T12:00:00.000Z'), 'UTC')).toBe('2027-01-01')
  })
})

describe('monthBounds', () => {
  it('covers the whole month inclusively', () => {
    const { from, to } = monthBounds('2026-08')
    expect(from.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(to.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('gets February right in a leap year and out of one', () => {
    expect(monthBounds('2028-02').to.toISOString().slice(0, 10)).toBe('2028-02-29')
    expect(monthBounds('2026-02').to.toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('gets a 30-day month right', () => {
    expect(monthBounds('2026-09').to.toISOString().slice(0, 10)).toBe('2026-09-30')
  })

  it('gets December right without spilling into January', () => {
    const { from, to } = monthBounds('2026-12')
    expect(from.toISOString().slice(0, 10)).toBe('2026-12-01')
    expect(to.toISOString().slice(0, 10)).toBe('2026-12-31')
  })
})

describe('thresholdsReached', () => {
  it('returns nothing below the first threshold', () => {
    expect(thresholdsReached(69)).toEqual([])
  })

  it('returns every threshold crossed, not just the highest', () => {
    // An organisation can jump 60% → 92% between two runs. Both 70 and 85 were
    // crossed, and the caller decides which have already been announced.
    expect(thresholdsReached(92)).toEqual([70, 85])
    expect(thresholdsReached(100)).toEqual([70, 85, 100])
  })

  it('includes a threshold landed on exactly', () => {
    expect(thresholdsReached(70)).toEqual([70])
    expect(thresholdsReached(85)).toEqual([70, 85])
  })

  it('still reports 100 on an overshoot', () => {
    expect(thresholdsReached(140)).toEqual([70, 85, 100])
  })
})

describe('majorToMinor', () => {
  it('converts Meta rupees to paise', () => {
    expect(majorToMinor('1234.56')).toBe(123_456)
    expect(majorToMinor(0)).toBe(0)
  })

  it('rounds rather than truncates', () => {
    // A month of truncated days loses up to a rupee, and this total decides
    // whether spending stops.
    expect(majorToMinor('0.005')).toBe(1)
    expect(majorToMinor('10.999')).toBe(1100)
  })

  it('treats unparseable spend as zero rather than NaN', () => {
    // NaN in this figure would make the percentage NaN and the comparison
    // against 100 false, so an over-spent account would never pause.
    expect(majorToMinor('')).toBe(0)
    expect(majorToMinor('not a number')).toBe(0)
  })
})
