/**
 * The money-safety gate, as pure logic.
 *
 * An ad may not be approved without a budget, and never above the operator's
 * per-client monthly ceiling. Keeping this a plain function (no DB, no Nest) makes
 * the one rule that stands between an AI prompt and real ad spend trivially
 * testable and impossible to accidentally bypass.
 */

export class BudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetError'
  }
}

export interface BudgetCheck {
  /** Daily budget in the ad account's currency (major units). */
  readonly dailyBudget?: number | null
  /** Lifetime budget; when set it, not the daily figure, bounds total spend. */
  readonly lifetimeBudget?: number | null
  /** Operator-set per-client monthly ceiling. Null = no ceiling configured. */
  readonly monthlyCap?: number | null
}

/** How many days of daily-budget spend we treat as a "month" for cap projection. */
const DAYS_PER_MONTH = 30

/**
 * Throw `BudgetError` unless the ad is safe to approve: a positive budget exists,
 * and its projected monthly spend does not exceed the operator's cap.
 */
export function assertWithinCap(check: BudgetCheck): void {
  const daily = check.dailyBudget ?? 0
  const lifetime = check.lifetimeBudget ?? 0

  if (daily < 0 || lifetime < 0) {
    throw new BudgetError('Budget cannot be negative.')
  }
  if (daily <= 0 && lifetime <= 0) {
    throw new BudgetError('A daily or lifetime budget is required before approval.')
  }

  const cap = check.monthlyCap
  if (cap != null && cap > 0) {
    // A lifetime budget caps total spend outright; a daily budget is projected
    // across a month. We take whichever the ad actually uses.
    const projectedMonthly = lifetime > 0 ? lifetime : daily * DAYS_PER_MONTH
    if (projectedMonthly > cap) {
      throw new BudgetError(
        `Projected monthly spend (${String(projectedMonthly)}) exceeds the client's monthly cap (${String(cap)}).`,
      )
    }
  }
}
