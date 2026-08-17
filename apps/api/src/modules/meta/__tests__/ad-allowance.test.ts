import { describe, expect, it } from 'vitest'

import { monthKey, usedPercent } from '../ad-allowance.service.js'

/**
 * The allowance maths, tested for the two ways it can be wrong in a direction
 * that matters: pausing a client who has room, and failing to pause one who does
 * not.
 */
describe('usedPercent', () => {
  it('reads an unconfigured allocation as nothing used, never everything', () => {
    // The failure this prevents: shipping the feature with allocations unset and
    // pausing every ad flight in the system on the first deploy.
    expect(usedPercent(0, 0)).toBe(0)
    expect(usedPercent(0, 500_000)).toBe(0)
  })

  it('computes the ordinary case', () => {
    expect(usedPercent(2_500_000, 0)).toBe(0)
    expect(usedPercent(2_500_000, 625_000)).toBe(25)
    expect(usedPercent(2_500_000, 2_125_000)).toBe(85)
    expect(usedPercent(2_500_000, 2_500_000)).toBe(100)
  })

  it('rounds rather than truncates, and can exceed 100', () => {
    // Meta reports spend after the fact, so an overshoot is real and must show as
    // one — clamping to 100 would hide that we are out of pocket.
    expect(usedPercent(1_000_000, 855_000)).toBe(86)
    expect(usedPercent(1_000_000, 1_140_000)).toBe(114)
  })

  it('crosses each alert threshold exactly once', () => {
    const alloc = 1_000_000
    expect(usedPercent(alloc, 699_000)).toBe(70)
    expect(usedPercent(alloc, 849_000)).toBe(85)
    expect(usedPercent(alloc, 995_000)).toBe(100)
  })
})

describe('monthKey', () => {
  it('uses the organisation timezone, not the server one', () => {
    // 31 August 19:00 UTC is already 1 September in Auckland. A poller running
    // then must not add August spend to September's total, or vice versa.
    const at = new Date('2026-08-31T19:00:00.000Z')
    expect(monthKey(at, 'UTC')).toBe('2026-08')
    expect(monthKey(at, 'Asia/Kolkata')).toBe('2026-09')
    expect(monthKey(at, 'Pacific/Auckland')).toBe('2026-09')
  })

  it('pads single-digit months', () => {
    expect(monthKey(new Date('2026-01-15T12:00:00.000Z'), 'UTC')).toBe('2026-01')
  })

  it('falls back to UTC on an unknown timezone rather than throwing', () => {
    // A bad timezone string in one organisation's record must not take down the
    // allowance check for everyone.
    expect(monthKey(new Date('2026-08-17T12:00:00.000Z'), 'Not/AZone')).toBe('2026-08')
  })
})
