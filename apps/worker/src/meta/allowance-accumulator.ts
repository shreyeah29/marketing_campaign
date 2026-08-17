import { allowanceUsedPct, majorToMinor, monthBounds, monthKey } from '@marketing-os/contracts'
import type { PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

/**
 * Reconciles each organisation's month-to-date ad spend.
 *
 * Reconciles rather than accumulates. Every run re-reads the month's stored
 * insight rows, sums them, and **overwrites** `adSpentThisMonth`. It never adds a
 * delta to what was there before.
 *
 * That matters because Meta restates spend for up to about 48 hours after the
 * fact — an ad day that reported ₹4,100 this morning may report ₹4,340 tonight.
 * A process that added increments would count the restatement as new spend on
 * top of the old figure, and the error would compound every run for the rest of
 * the month with nothing to correct it. Overwriting makes each run
 * self-correcting: whatever Meta currently says the month cost is what we store.
 * The poller already upserts the last seven days of insight rows on every pass,
 * which is comfortably wider than the restatement window, so the rows being
 * summed are themselves current.
 *
 * Attribution is by the insight row's own `date`, never by when this ran. A run
 * at 00:05 on the 1st of September sums rows dated in September and finds none;
 * it does not sweep August's spend into the new month.
 */

export interface ReconcileResult {
  organizationId: string
  month: string
  spentMinor: number
  allocationMinor: number
  usedPct: number
  /** Set when this run also closed a previous month into the ledger. */
  closedMonth?: string
}

interface OrgRow {
  id: string
  timezone: string
  adAllocationMonthly: number
  adSpentThisMonth: number
  adSpendMonth: string | null
  monthlyFee: number
}

/**
 * Sums `AdInsight.spend` for one organisation over an inclusive date range.
 *
 * `spend` is a Decimal in major units, as Meta reports it. Summed in the
 * database and converted once, rather than converting per row and adding: two
 * hundred roundings introduce more error than one.
 */
async function spentInRange(
  db: PrismaClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const agg = await db.adInsight.aggregate({
    where: { organizationId, date: { gte: from, lte: to } },
    _sum: { spend: true },
  })
  return majorToMinor(agg._sum.spend?.toString() ?? '0')
}

/**
 * Closes a finished month into the ledger.
 *
 * Idempotent by the ledger's `(organizationId, month)` unique index: running
 * twice updates the same row rather than double-counting. The allocation and fee
 * of the moment are stored alongside the spend, so a past month still reads
 * correctly after a tier change — otherwise last August's 92% silently becomes
 * 46% when the client upgrades.
 */
async function closeMonth(
  db: PrismaClient,
  org: OrgRow,
  month: string,
  logger: AppLogger,
): Promise<void> {
  const { from, to } = monthBounds(month)
  const spentMinor = await spentInRange(db, org.id, from, to)
  await db.adSpendLedger.upsert({
    where: { organizationId_month: { organizationId: org.id, month } },
    create: {
      organizationId: org.id,
      month,
      spentMinor,
      allocationMinor: org.adAllocationMonthly,
      monthlyFeeMinor: org.monthlyFee,
    },
    update: {
      spentMinor,
      allocationMinor: org.adAllocationMonthly,
      monthlyFeeMinor: org.monthlyFee,
    },
  })
  logger.info(
    { organizationId: org.id, month, spentMinor, allocationMinor: org.adAllocationMonthly },
    'ad spend month closed into the ledger',
  )
}

/**
 * Reconcile one organisation. Returns the figure now stored.
 *
 * Runs for every organisation, not only those with an allocation: the ledger is
 * an evidence trail for renewal conversations, and a month with no allocation
 * set is exactly the month someone will later want to check.
 */
export async function reconcileOrg(
  db: PrismaClient,
  org: OrgRow,
  now: Date,
  logger: AppLogger,
): Promise<ReconcileResult> {
  const month = monthKey(now, org.timezone)
  let closedMonth: string | undefined

  // A running total belonging to an earlier month is closed before the new one
  // starts, so the ledger records what the month actually cost rather than a
  // figure that has since been overwritten.
  if (org.adSpendMonth !== null && org.adSpendMonth !== month) {
    await closeMonth(db, org, org.adSpendMonth, logger)
    closedMonth = org.adSpendMonth
  }

  const { from, to } = monthBounds(month)
  const spentMinor = await spentInRange(db, org.id, from, to)

  await db.organization.update({
    where: { id: org.id },
    data: { adSpentThisMonth: spentMinor, adSpendMonth: month },
  })

  return {
    organizationId: org.id,
    month,
    spentMinor,
    allocationMinor: org.adAllocationMonthly,
    usedPct: allowanceUsedPct(org.adAllocationMonthly, spentMinor),
    ...(closedMonth === undefined ? {} : { closedMonth }),
  }
}

/** Reconcile every organisation. One failure does not stop the others. */
export async function reconcileAllOrgs(
  db: PrismaClient,
  now: Date,
  logger: AppLogger,
): Promise<ReconcileResult[]> {
  const orgs = await db.organization.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      timezone: true,
      adAllocationMonthly: true,
      adSpentThisMonth: true,
      adSpendMonth: true,
      monthlyFee: true,
    },
  })

  const results: ReconcileResult[] = []
  for (const org of orgs) {
    try {
      results.push(await reconcileOrg(db, org, now, logger))
    } catch (err) {
      logger.error({ err, organizationId: org.id }, 'ad spend reconciliation failed')
    }
  }
  return results
}
