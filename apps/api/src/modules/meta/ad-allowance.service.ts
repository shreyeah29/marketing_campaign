import { ForbiddenException, Injectable } from '@nestjs/common'

import { createAdminClient, type PrismaClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { loadEnv } from '../../config/env.js'

/**
 * The monthly ad allowance.
 *
 * Ads run on each client's own Meta ad account, funded by our payment method.
 * The client therefore gets an allowance rather than a budget, and sees it as a
 * percentage rather than a figure: the rupees are our cost position, and knowing
 * them tells a client what we pay for media rather than anything about their
 * campaign.
 *
 * Reads through the **admin** client, not the tenant one.
 *
 * That looks wrong at first glance and is the point. `organization` carries the
 * allocation and the running spend, and the tenant plane must not be able to
 * select those columns at all — so the allowance is computed here, behind an
 * explicit organisation id, and only the derived integer crosses back. A tenant
 * query that could reach the columns is a tenant query that will eventually
 * return them.
 */

export interface AllowanceView {
  /**
   * Whether an allocation has been set at all.
   *
   * `usedPct` is 0 both for an organisation with a fresh allowance and for one
   * with no allowance configured, and those need opposite treatment in the UI: a
   * pace selector priced in "% of your allowance" is meaningless without one.
   * Boolean rather than the figure, so nothing about the amount crosses.
   */
  configured: boolean
  /** Rounded integer, 0-100+. The only allowance figure a tenant ever receives. */
  usedPct: number
  /** ISO date the allowance resets — the 1st of next month, tenant's timezone. */
  resetsOn: string
  /** True at 100%: no new ad flight may start. */
  paused: boolean
  /** The month being measured, `YYYY-MM`, so a stale page is obvious. */
  month: string
}

/** `YYYY-MM` for a date in a given IANA timezone. */
export function monthKey(at: Date, timezone: string): string {
  try {
    // en-CA gives YYYY-MM-DD, which slices cleanly and does not depend on locale.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    })
      .format(at)
      .slice(0, 7)
  } catch {
    return at.toISOString().slice(0, 7)
  }
}

/** First day of the month after the one containing `at`, as `YYYY-MM-DD`. */
function nextReset(at: Date, timezone: string): string {
  const [y, m] = monthKey(at, timezone).split('-').map(Number)
  const year = m === 12 ? (y as number) + 1 : (y as number)
  const month = m === 12 ? 1 : (m as number) + 1
  return `${String(year)}-${String(month).padStart(2, '0')}-01`
}

/**
 * Percentage of allowance consumed.
 *
 * An allocation of zero means "not configured", not "everything is spent". The
 * distinction matters: returning 100 for an unconfigured organisation would pause
 * every ad flight it has the moment this ships.
 */
export function usedPercent(allocationMinor: number, spentMinor: number): number {
  if (allocationMinor <= 0) return 0
  return Math.round((spentMinor / allocationMinor) * 100)
}

@Injectable()
export class AdAllowanceService {
  /**
   * Owner-role client. The allocation columns are deliberately unreachable from
   * the tenant plane, so the one place allowed to read them does so explicitly
   * and returns only what a tenant may see.
   *
   * Falls back to `DATABASE_URL` when `DIRECT_DATABASE_URL` is unset. That path
   * is row-level-secured and would return nothing here without a tenant context,
   * which is the safe direction to fail: an allowance that reads as unconfigured
   * pauses nothing, where an allowance that reads as spent pauses everything.
   */
  private readonly admin: PrismaClient

  constructor() {
    const env = loadEnv()
    this.admin = createAdminClient(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)
  }

  private async row(organizationId: string): Promise<{
    allocation: number
    spent: number
    timezone: string
    month: string | null
  } | null> {
    const org = await this.admin.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: {
        adAllocationMonthly: true,
        adSpentThisMonth: true,
        adSpendMonth: true,
        timezone: true,
      },
    })
    if (!org) return null
    return {
      allocation: org.adAllocationMonthly,
      spent: org.adSpentThisMonth,
      timezone: org.timezone,
      month: org.adSpendMonth,
    }
  }

  /** What the tenant sees: a percentage, a reset date, and whether it is paused. */
  async view(principal: Principal): Promise<AllowanceView> {
    const now = new Date()
    const row = await this.row(principal.organizationId)
    if (!row) {
      return {
        configured: false,
        usedPct: 0,
        resetsOn: nextReset(now, 'UTC'),
        paused: false,
        month: monthKey(now, 'UTC'),
      }
    }
    const current = monthKey(now, row.timezone)
    // A running total belonging to a previous month reads as zero rather than
    // being trusted: the roll has not happened yet, and last month's spend must
    // not pause this month's ads.
    const spent = row.month === current ? row.spent : 0
    const usedPct = usedPercent(row.allocation, spent)
    return {
      configured: row.allocation > 0,
      usedPct,
      resetsOn: nextReset(now, row.timezone),
      paused: row.allocation > 0 && usedPct >= 100,
      month: current,
    }
  }

  /**
   * The gate. Throws when a new ad flight would start past the allowance.
   *
   * Enforced server-side because it is a spending control: a disabled button is
   * a courtesy, and this endpoint is reachable without one. The message carries
   * no figures — it says the allowance is reached and when it resets, which is
   * everything the client can act on.
   */
  async assertCanStartFlight(principal: Principal): Promise<void> {
    const view = await this.view(principal)
    if (!view.paused) return
    const month = new Date(`${view.month}-01T00:00:00Z`).toLocaleString('en-GB', {
      month: 'long',
      timeZone: 'UTC',
    })
    throw new ForbiddenException(
      `Ad allowance reached for ${month} — new ad flights are paused. It resets on ${view.resetsOn}.`,
    )
  }
}
