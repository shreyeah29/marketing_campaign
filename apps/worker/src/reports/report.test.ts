import { describe, expect, it } from 'vitest'

import {
  composeReportHtml,
  escapeHtml,
  previousMonthPeriod,
  reportCampaignName,
  type ReportData,
} from './report.js'

describe('previousMonthPeriod', () => {
  it('returns the prior calendar month in UTC', () => {
    const period = previousMonthPeriod(new Date('2026-08-02T09:00:00Z'))
    expect(period.start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(period.end.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(period.label).toBe('July 2026')
    expect(period.key).toBe('2026-07')
  })

  it('crosses the year boundary in January', () => {
    const period = previousMonthPeriod(new Date('2026-01-15T23:59:59Z'))
    expect(period.start.toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(period.end.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(period.label).toBe('December 2025')
    expect(period.key).toBe('2025-12')
  })

  it('treats the first instant of a month as belonging to the new month', () => {
    const period = previousMonthPeriod(new Date('2026-03-01T00:00:00Z'))
    expect(period.key).toBe('2026-02')
    expect(period.end.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('reportCampaignName', () => {
  it('is deterministic per period — the idempotency handle', () => {
    const a = previousMonthPeriod(new Date('2026-08-02T00:00:00Z'))
    const b = previousMonthPeriod(new Date('2026-08-30T12:00:00Z'))
    expect(reportCampaignName(a)).toBe(reportCampaignName(b))
    expect(reportCampaignName(a)).toBe('Monthly performance report 2026-07')
  })
})

const baseData: ReportData = {
  organizationName: 'Acme & Co <Legal>',
  period: previousMonthPeriod(new Date('2026-08-02T00:00:00Z')),
  leads: {
    total: 42,
    qualified: 10,
    converted: 3,
    bySource: [
      { source: 'META_ADS', count: 30 },
      { source: 'Website "form"', count: 12 },
    ],
  },
  deals: { won: 3, revenue: 12500.5, currency: 'USD' },
  campaigns: { active: 2, top: [{ name: 'Summer <Sale>', leads: 25 }] },
  email: { sent: 400, opens: 120 },
  social: { published: 8 },
  ads: { impressions: 90000, clicks: 1200, leads: 30 },
}

describe('composeReportHtml', () => {
  it('escapes interpolated names', () => {
    const html = composeReportHtml(baseData)
    expect(html).toContain('Acme &amp; Co &lt;Legal&gt;')
    expect(html).toContain('Summer &lt;Sale&gt;')
    expect(html).toContain('Website &quot;form&quot;')
    expect(html).not.toContain('<Legal>')
  })

  it('never mentions ad spend or operator money', () => {
    const html = composeReportHtml(baseData).toLowerCase()
    expect(html).not.toContain('spend')
    expect(html).not.toContain('roi')
    expect(html).not.toContain('budget')
    expect(html).not.toContain('fee')
  })

  it('shows the period label and headline numbers', () => {
    const html = composeReportHtml(baseData)
    expect(html).toContain('July 2026')
    expect(html).toContain('42')
    expect(html).toContain('USD 12,501')
    expect(html).toContain('90,000')
  })

  it('renders placeholder rows when the month was quiet', () => {
    const html = composeReportHtml({
      ...baseData,
      leads: { total: 0, qualified: 0, converted: 0, bySource: [] },
      deals: { won: 0, revenue: 0, currency: 'USD' },
      campaigns: { active: 0, top: [] },
    })
    expect(html).toContain('No leads captured this month')
    expect(html).toContain('No campaign activity this month')
  })
})

describe('escapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
