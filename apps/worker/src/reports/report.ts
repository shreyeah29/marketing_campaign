/**
 * Monthly client report — the pure half. Everything here is a function of its
 * inputs so the poller stays a thin orchestrator and this logic is testable
 * without a database.
 *
 * Content rule: this report goes to the CLIENT. Ad spend, fees, ROI and any
 * other money-the-operator-carries numbers must never appear here — the only
 * revenue shown is the client's own won-deal revenue. The operator's private
 * spend view lives in the platform console, not in email.
 */

export interface ReportPeriod {
  /** Inclusive UTC start of the calendar month. */
  readonly start: Date
  /** Exclusive UTC start of the following month. */
  readonly end: Date
  /** Human label, e.g. "July 2026". */
  readonly label: string
  /** Stable key, e.g. "2026-07" — used for idempotency. */
  readonly key: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** The full calendar month (UTC) preceding `now`. */
export function previousMonthPeriod(now: Date): ReportPeriod {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() // 0-based
  const start = new Date(Date.UTC(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  const label = `${MONTHS[start.getUTCMonth()] ?? ''} ${String(start.getUTCFullYear())}`
  const key = `${String(start.getUTCFullYear())}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
  return { start, end, label, key }
}

/**
 * Deterministic campaign name for a period — the idempotency handle. One
 * EmailCampaign row with this name per organisation per month, ever.
 */
export function reportCampaignName(period: ReportPeriod): string {
  return `Monthly performance report ${period.key}`
}

export interface ReportData {
  readonly organizationName: string
  readonly period: ReportPeriod
  readonly leads: {
    readonly total: number
    readonly qualified: number
    readonly converted: number
    readonly bySource: readonly { source: string; count: number }[]
  }
  readonly deals: { readonly won: number; readonly revenue: number; readonly currency: string }
  readonly campaigns: {
    readonly active: number
    readonly top: readonly { name: string; leads: number }[]
  }
  readonly email: { readonly sent: number; readonly opens: number }
  readonly social: { readonly published: number }
  readonly ads: { readonly impressions: number; readonly clicks: number; readonly leads: number }
}

/** Escapes text interpolated into the HTML body. */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

const fmt = new Intl.NumberFormat('en-US')

function statCell(label: string, value: string): string {
  return `<td style="padding:14px 16px;border:1px solid #e3e3e3;border-radius:12px">
    <div style="font-size:22px;font-weight:600;color:#000">${value}</div>
    <div style="font-size:12px;color:#474747;margin-top:2px">${escapeHtml(label)}</div>
  </td>`
}

function sectionTitle(title: string): string {
  return `<h2 style="font-size:14px;font-weight:600;color:#000;margin:28px 0 10px;letter-spacing:-0.01em">${escapeHtml(title)}</h2>`
}

function tableRows(rows: readonly (readonly [string, string])[]): string {
  return rows
    .map(
      ([name, value]) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#111">${escapeHtml(name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#111;text-align:right">${value}</td>
    </tr>`,
    )
    .join('')
}

/**
 * The email body — inline-styled HTML (the house style for email; no template
 * engine, no external assets). Monochrome to match the product's design
 * language; renders fine in every client because it is just tables.
 */
export function composeReportHtml(data: ReportData): string {
  const { period } = data
  const sourceRows =
    data.leads.bySource.length > 0
      ? tableRows(data.leads.bySource.map((s) => [s.source, fmt.format(s.count)] as const))
      : tableRows([['No leads captured this month', '—'] as const])
  const campaignRows =
    data.campaigns.top.length > 0
      ? tableRows(data.campaigns.top.map((c) => [c.name, fmt.format(c.leads)] as const))
      : tableRows([['No campaign activity this month', '—'] as const])

  const revenue =
    data.deals.revenue > 0
      ? `${escapeHtml(data.deals.currency)} ${fmt.format(Math.round(data.deals.revenue))}`
      : '—'

  return `<div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:32px 20px;color:#000;background:#ffffff">
  <div style="font-size:12px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.08em">Monthly report</div>
  <h1 style="font-size:24px;font-weight:600;letter-spacing:-0.03em;margin:6px 0 2px">${escapeHtml(data.organizationName)}</h1>
  <div style="font-size:14px;color:#474747">${escapeHtml(period.label)}</div>

  ${sectionTitle('The month in numbers')}
  <table role="presentation" cellspacing="6" cellpadding="0" style="border-collapse:separate;width:100%">
    <tr>
      ${statCell('New leads', fmt.format(data.leads.total))}
      ${statCell('Qualified', fmt.format(data.leads.qualified))}
      ${statCell('Deals won', fmt.format(data.deals.won))}
      ${statCell('Revenue won', revenue)}
    </tr>
  </table>

  ${sectionTitle('Where your leads came from')}
  <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${sourceRows}</table>

  ${sectionTitle('Top campaigns by leads')}
  <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${campaignRows}</table>

  ${sectionTitle('Reach & engagement')}
  <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${tableRows(
    [
      ['Ad impressions', fmt.format(data.ads.impressions)] as const,
      ['Ad clicks', fmt.format(data.ads.clicks)] as const,
      ['Leads from ads', fmt.format(data.ads.leads)] as const,
      ['Emails delivered', fmt.format(data.email.sent)] as const,
      ['Email opens', fmt.format(data.email.opens)] as const,
      ['Social posts published', fmt.format(data.social.published)] as const,
    ],
  )}</table>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e3e3e3;font-size:12px;color:#9a9a9a">
    Sent automatically on the first of each month. Reply to this email to reach your marketing team.
  </div>
</div>`
}
