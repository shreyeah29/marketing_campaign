import { describe, expect, it } from 'vitest'

import { __testables } from '../cost-redaction.interceptor.js'

const { redact, isCostKey } = __testables

/**
 * The rule these tests defend: a tenant response contains no money.
 *
 * They assert the denylist explicitly rather than trusting it, because the cost
 * of a miss is not a broken screen — it is a client reading our commercial
 * position out of a network tab.
 */
describe('isCostKey', () => {
  it('catches the direct cost fields', () => {
    for (const k of ['spend', 'cpc', 'cpm', 'cpl', 'roas', 'social_spend', 'socialSpend']) {
      expect(isCostKey(k), k).toBe(true)
    }
  })

  it('catches every cost_per_* Meta might invent', () => {
    for (const k of [
      'cost_per_action_type',
      'cost_per_thruplay',
      'costPerLead',
      'cost_per_unique_click',
    ]) {
      expect(isCostKey(k), k).toBe(true)
    }
  })

  it('catches our own cost naming', () => {
    for (const k of ['costUsd', 'totalCostUsd', 'aiSpendUsd', 'marginUsd', 'monthlyFee']) {
      expect(isCostKey(k), k).toBe(true)
    }
  })

  it('catches the operator-only allocation fields', () => {
    // These live on the organisation record and must never reach a tenant, even
    // though the tenant is allowed the percentage derived from them.
    for (const k of ['adAllocationMonthly', 'adSpentThisMonth', 'ad_allocation_monthly']) {
      expect(isCostKey(k), k).toBe(true)
    }
  })

  it('leaves performance and the tenant-visible allowance alone', () => {
    for (const k of [
      'impressions',
      'reach',
      'clicks',
      'ctr',
      'leads',
      'saves',
      'shares',
      'revenue',
      'leadsPer1kImpressions',
      'adAllowanceUsedPct',
      'conversions',
    ]) {
      expect(isCostKey(k), k).toBe(false)
    }
  })

  it('is case-insensitive', () => {
    expect(isCostKey('SPEND')).toBe(true)
    expect(isCostKey('Cpc')).toBe(true)
  })
})

describe('redact', () => {
  it('strips cost from a flat object', () => {
    const out = redact({ impressions: 1000, clicks: 20, spend: 4500, cpl: 12.5 })
    expect(out).toEqual({ impressions: 1000, clicks: 20 })
  })

  it('strips cost from every depth', () => {
    const out = redact({
      kpis: { leads: 4, spend: 99 },
      channels: [
        { channel: 'INSTAGRAM', leads: 3, cpc: 1.1 },
        { channel: 'FACEBOOK', leads: 1, cpc: 2.2 },
      ],
    })
    expect(out).toEqual({
      kpis: { leads: 4 },
      channels: [
        { channel: 'INSTAGRAM', leads: 3 },
        { channel: 'FACEBOOK', leads: 1 },
      ],
    })
  })

  it('does not mutate the input', () => {
    // The value handed to an interceptor may still be referenced elsewhere.
    const input = { leads: 2, spend: 500 }
    redact(input)
    expect(input.spend).toBe(500)
  })

  it('passes dates through intact rather than walking them', () => {
    const d = new Date('2026-08-17T00:00:00.000Z')
    const out = redact({ date: d, spend: 1 }) as { date: Date }
    expect(out.date).toBeInstanceOf(Date)
    expect(out.date.toISOString()).toBe('2026-08-17T00:00:00.000Z')
  })

  it('handles null, primitives and empty structures', () => {
    expect(redact(null)).toBeNull()
    expect(redact(42)).toBe(42)
    expect(redact('spend')).toBe('spend')
    expect(redact([])).toEqual([])
    expect(redact({})).toEqual({})
  })

  it('survives a cyclic structure instead of hanging', () => {
    const a: Record<string, unknown> = { leads: 1 }
    a['self'] = a
    expect(() => redact(a)).not.toThrow()
  })

  it('strips a nested allowance leak', () => {
    // The realistic accident: an organisation record serialised whole into a
    // tenant response, carrying the operator-only allocation with it.
    const out = redact({
      organization: {
        id: 'o1',
        name: 'Always Sunday',
        adAllocationMonthly: 2500000,
        adSpentThisMonth: 900000,
      },
      adAllowanceUsedPct: 36,
    })
    expect(out).toEqual({
      organization: { id: 'o1', name: 'Always Sunday' },
      adAllowanceUsedPct: 36,
    })
  })
})
