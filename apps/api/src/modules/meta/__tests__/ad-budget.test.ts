import { describe, expect, it } from 'vitest'

import { assertWithinCap, BudgetError } from '../ad-budget.js'

describe('assertWithinCap — the money-safety gate', () => {
  it('rejects an approval with no budget at all', () => {
    expect(() => assertWithinCap({})).toThrow(BudgetError)
    expect(() => assertWithinCap({ dailyBudget: 0, lifetimeBudget: 0 })).toThrow(/budget is required/i)
  })

  it('rejects a negative budget', () => {
    expect(() => assertWithinCap({ dailyBudget: -5 })).toThrow(/negative/i)
  })

  it('allows any positive budget when no cap is configured', () => {
    expect(() => assertWithinCap({ dailyBudget: 100000 })).not.toThrow()
    expect(() => assertWithinCap({ lifetimeBudget: 999999 })).not.toThrow()
  })

  it('projects a daily budget across 30 days against the monthly cap', () => {
    // 500/day * 30 = 15000 — over a 10000 cap.
    expect(() => assertWithinCap({ dailyBudget: 500, monthlyCap: 10000 })).toThrow(/exceeds/i)
    // 300/day * 30 = 9000 — under the cap.
    expect(() => assertWithinCap({ dailyBudget: 300, monthlyCap: 10000 })).not.toThrow()
  })

  it('uses the lifetime budget directly against the cap when set', () => {
    expect(() => assertWithinCap({ lifetimeBudget: 12000, monthlyCap: 10000 })).toThrow(/exceeds/i)
    expect(() => assertWithinCap({ lifetimeBudget: 8000, monthlyCap: 10000 })).not.toThrow()
  })

  it('lets a lifetime budget override a daily figure for the projection', () => {
    // Daily would project to 30000 (over cap) but a lifetime budget bounds it to 5000.
    expect(() =>
      assertWithinCap({ dailyBudget: 1000, lifetimeBudget: 5000, monthlyCap: 10000 }),
    ).not.toThrow()
  })

  it('treats a spend exactly at the cap as allowed', () => {
    expect(() => assertWithinCap({ lifetimeBudget: 10000, monthlyCap: 10000 })).not.toThrow()
  })
})
