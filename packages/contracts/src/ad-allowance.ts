/**
 * Ad allowance arithmetic, shared by the API and the worker.
 *
 * It lives here rather than in either of them because both must agree exactly.
 * The worker decides which advertising days belong to "this month" when it
 * reconciles the running total; the API decides which month it is when it
 * reports the percentage and when it pauses a flight. If those two disagreed by
 * a day, a client's ads would pause on the 1st because August's spend was still
 * being counted against September's allowance — a bug that appears once a month
 * and is invisible the rest of the time.
 *
 * Currency is minor units (paise) throughout. A rupee that has been through a
 * float comes back as 2499.9999999999995, and these figures decide whether a
 * client's ads keep running.
 */

/** The percentages at which a client is told about their allowance. */
export const ALLOWANCE_ALERT_THRESHOLDS = [70, 85, 100] as const

export type AllowanceThreshold = (typeof ALLOWANCE_ALERT_THRESHOLDS)[number]

/**
 * `YYYY-MM` for an instant, in a given IANA timezone.
 *
 * The timezone is the organisation's own. 31 August 19:00 UTC is already
 * 1 September in Auckland, so a poller running then must not attribute the
 * closing hours of August to September.
 */
export function monthKey(at: Date, timezone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD, which slices cleanly and does not vary by
    // the host's locale the way a default format would.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    })
      .format(at)
      .slice(0, 7)
  } catch {
    // An unparseable timezone on one organisation's record must not take the
    // allowance check down for every organisation.
    return at.toISOString().slice(0, 7)
  }
}

/** First day of the month after the one containing `at`, as `YYYY-MM-DD`. */
export function nextResetDate(at: Date, timezone: string): string {
  const [y, m] = monthKey(at, timezone).split('-').map(Number)
  const year = m === 12 ? (y as number) + 1 : (y as number)
  const month = m === 12 ? 1 : (m as number) + 1
  return `${String(year)}-${String(month).padStart(2, '0')}-01`
}

/**
 * Inclusive date bounds of a `YYYY-MM` month, as UTC-midnight dates.
 *
 * `AdInsight.date` is a SQL DATE — an advertising day as Meta reported it, with
 * no time and no zone. Comparing it against bounds built this way is exact, and
 * is why attribution keys off the row's own date rather than when the poller
 * happened to run.
 */
export function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number)
  const year = y as number
  const mon = m as number
  const from = new Date(Date.UTC(year, mon - 1, 1))
  // Day 0 of the next month is the last day of this one, leap years included.
  const to = new Date(Date.UTC(year, mon, 0))
  return { from, to }
}

/**
 * Percentage of allowance consumed, rounded.
 *
 * An allocation of zero means "not configured", not "everything is spent".
 * Returning 100 for an unconfigured organisation would pause every ad flight it
 * has the moment the feature ships.
 *
 * Not clamped at 100: Meta reports spend after the fact and can restate it
 * upward, so an overshoot is real and must be visible rather than hidden behind
 * a ceiling.
 */
export function allowanceUsedPct(allocationMinor: number, spentMinor: number): number {
  if (allocationMinor <= 0) return 0
  return Math.round((spentMinor / allocationMinor) * 100)
}

/**
 * Which thresholds a percentage has reached.
 *
 * Returns all of them, not just the highest: an organisation that jumps from 60%
 * to 92% between two runs has crossed both 70 and 85, and the caller decides
 * which have already been announced. Deciding that here would make this function
 * stateful, and the "fire once" guarantee belongs next to the store that
 * remembers.
 */
export function thresholdsReached(usedPct: number): AllowanceThreshold[] {
  return ALLOWANCE_ALERT_THRESHOLDS.filter((t) => usedPct >= t)
}

/**
 * Rupees-with-decimals (how Meta reports spend, and how `AdInsight.spend` is
 * stored) to minor units.
 *
 * Rounded, not truncated: summing a month of truncated days loses up to a rupee,
 * and this total is compared against an allocation to decide whether to stop
 * spending.
 */
export function majorToMinor(major: string | number): number {
  const n = typeof major === 'number' ? major : Number(major)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}
