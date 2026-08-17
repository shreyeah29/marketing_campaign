import { describe, expect, it } from 'vitest'

import { ALLOWANCE_ALERT_THRESHOLDS, thresholdsReached } from '@marketing-os/contracts'

import { buildAlertCopy, monthLabel, textToHtml } from './allowance-alerts.js'

/**
 * The copy tests are the important ones here.
 *
 * These strings go to a client's inbox. The rule is that they carry no figures
 * except the percentage and the reset date, and that rule is exactly the kind
 * that decays: someone adds "you have ₹3,400 left" because it is genuinely more
 * helpful, and nothing fails. So the assertion is made against the output rather
 * than trusted to review.
 */

/** Anything that would indicate money, in any of the forms it could arrive in. */
const CURRENCY_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'rupee sign', re: /₹/ },
  { name: 'dollar sign', re: /\$/ },
  { name: 'INR/USD code', re: /\b(?:INR|USD|EUR|GBP)\b/i },
  { name: 'the word rupees', re: /\brupees?\b/i },
  { name: 'the word spend', re: /\bspen[dt]\b/i },
  { name: 'the word budget', re: /\bbudget\b/i },
  { name: 'the word cost', re: /\bcosts?\b/i },
  { name: 'cost per lead', re: /\bcpl\b|cost per lead/i },
  { name: 'a lakh or crore amount', re: /\b\d+(?:[.,]\d+)?\s?(?:L|lakh|cr|crore|k)\b/i },
  { name: 'a comma-grouped amount', re: /\b\d{1,3}(?:,\d{2,3})+\b/ },
]

const CASES = ALLOWANCE_ALERT_THRESHOLDS.map((threshold) => ({
  threshold,
  usedPct: threshold === 85 ? 92 : threshold,
}))

describe('alert copy carries no money', () => {
  for (const { threshold, usedPct } of CASES) {
    it(`the ${String(threshold)}% alert mentions no currency`, () => {
      const { subject, body } = buildAlertCopy({
        threshold,
        usedPct,
        monthLabel: 'August',
        resetsOn: '2026-09-01',
        adSetToPause: 'Retargeting · 18-34 Mumbai',
      })
      for (const { name, re } of CURRENCY_PATTERNS) {
        expect(re.test(subject), `subject contains ${name}: ${subject}`).toBe(false)
        expect(re.test(body), `body contains ${name}`).toBe(false)
      }
    })
  }

  it('says nothing about money even when the ad set name does', () => {
    // A client can name an ad set anything. If they call one "Budget push", the
    // template must not be the thing that introduced the word — but it will
    // appear, and that is theirs, not ours. Asserted so the distinction is
    // deliberate rather than accidental.
    const { body } = buildAlertCopy({
      threshold: 85,
      usedPct: 88,
      monthLabel: 'August',
      resetsOn: '2026-09-01',
      adSetToPause: 'Budget push ₹300 latte',
    })
    expect(body).toContain('Budget push ₹300 latte')
    // Everything outside the quoted name is clean.
    const withoutName = body.replace('Budget push ₹300 latte', '')
    expect(/₹/.test(withoutName)).toBe(false)
    expect(/\bbudget\b/i.test(withoutName)).toBe(false)
  })
})

describe('alert copy content', () => {
  it('states the actual percentage, not the threshold it tripped', () => {
    // Firing the 85 alert at 92% must say 92. Saying 85 would be a smaller number
    // than the truth, on the message whose job is to convey urgency.
    const { subject, body } = buildAlertCopy({
      threshold: 85,
      usedPct: 92,
      monthLabel: 'August',
      resetsOn: '2026-09-01',
      adSetToPause: null,
    })
    expect(subject).toContain('92%')
    expect(body).toContain('92%')
    expect(subject).not.toContain('85%')
  })

  it('names the ad set to pause at 85%', () => {
    const { body } = buildAlertCopy({
      threshold: 85,
      usedPct: 86,
      monthLabel: 'August',
      resetsOn: '2026-09-01',
      adSetToPause: 'Cold audience · broad',
    })
    expect(body).toContain('"Cold audience · broad"')
    expect(body).toContain('fewest impressions into leads')
  })

  it('says so plainly when there is no ad set worth naming', () => {
    const { body } = buildAlertCopy({
      threshold: 85,
      usedPct: 86,
      monthLabel: 'August',
      resetsOn: '2026-09-01',
      adSetToPause: null,
    })
    expect(body).toContain('not enough delivery data yet')
  })

  it('tells the 100% reader that running campaigns are unaffected', () => {
    // The panic this pre-empts: "paused" reading as "my live ads stopped".
    const { subject, body } = buildAlertCopy({
      threshold: 100,
      usedPct: 100,
      monthLabel: 'August',
      resetsOn: '2026-09-01',
      adSetToPause: null,
    })
    expect(subject).toBe('Ad allowance reached for August')
    expect(body).toContain('already running are unaffected')
    expect(body).toContain('2026-09-01')
  })

  it('carries the reset date in every alert', () => {
    for (const { threshold, usedPct } of CASES) {
      const { body } = buildAlertCopy({
        threshold,
        usedPct,
        monthLabel: 'August',
        resetsOn: '2026-09-01',
        adSetToPause: null,
      })
      expect(body, `threshold ${String(threshold)}`).toContain('2026-09-01')
    }
  })
})

describe('threshold crossing', () => {
  it('reports both thresholds when a run jumps past two', () => {
    // 60% → 92% between two reconciliations. Both must be announced, and the
    // record must show they were one event.
    expect(thresholdsReached(92)).toEqual([70, 85])
  })
})

describe('textToHtml', () => {
  it('escapes markup rather than emitting it', () => {
    // An ad set called `<script>` is a client's choice; rendering it is ours.
    const html = textToHtml('Pause "<script>alert(1)</script>" & retry')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })

  it('turns blank-line breaks into paragraphs', () => {
    const html = textToHtml('One.\n\nTwo.')
    expect(html).toBe('<p>One.</p>\n<p>Two.</p>')
  })

  it('keeps single newlines as line breaks inside a paragraph', () => {
    expect(textToHtml('a\nb')).toBe('<p>a<br />b</p>')
  })
})

describe('monthLabel', () => {
  it('names the month without a year or a day', () => {
    expect(monthLabel('2026-08')).toBe('August')
    expect(monthLabel('2026-01')).toBe('January')
    expect(monthLabel('2026-12')).toBe('December')
  })
})
