import { nextResetDate, thresholdsReached, type AllowanceThreshold } from '@marketing-os/contracts'
import type { PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import { sendEmail } from '../mailer.js'
import type { WorkerEnv } from '../config.js'

/**
 * Allowance alerts at 70, 85 and 100 per cent.
 *
 * Shipped inert. `Organization.adAlertsEnabled` is false by default, and with it
 * false this module still does everything except deliver: it computes the
 * threshold, picks the ad set it would name, writes the record, and logs what it
 * would have said. That is the dry run — the accumulator's arithmetic is proven
 * against seeded data but has never seen a real ad account, so the shape of
 * Meta's numbers is unverified, and an alert system in that state should not be
 * able to reach a client's inbox.
 *
 * Three properties this file exists to guarantee:
 *
 *   1. **Once per threshold per month.** Enforced by a unique index rather than a
 *      check-then-insert, because a poller running every fifteen minutes at 86%
 *      would otherwise send ninety-six emails a day and be filtered long before
 *      the 100% alert mattered.
 *   2. **No figures but the percentage and the reset date.** Every string built
 *      here is asserted against in the tests. A template drifting into rupees is
 *      the regression nobody notices, because it reads perfectly well.
 *   3. **Ranked by leads per 1,000 impressions, never cost per lead** — including
 *      internally. The ranking string ends up in a client's inbox, and a variable
 *      named `cpl` is one interpolation away from being in it.
 */

/** What an alert would say, before anyone decides whether to send it. */
export interface PlannedAlert {
  organizationId: string
  organizationName: string
  month: string
  threshold: AllowanceThreshold
  /** Every threshold crossed in this run, this one included. */
  firedWith: AllowanceThreshold[]
  /** The actual percentage — 92, not the 85 it tripped. */
  usedPct: number
  resetsOn: string
  /** Only set for the 85% alert. */
  adSetToPause: string | null
  subject: string
  body: string
}

interface OrgForAlerts {
  id: string
  name: string
  timezone: string
  adAlertsEnabled: boolean
}

/**
 * The weakest active ad set, by leads per 1,000 impressions.
 *
 * Deliberately not cost per lead. Ranking by cost would put the same ad sets in
 * nearly the same order while requiring spend to be in scope here — and this
 * function's return value is interpolated into an email. Keeping money out of the
 * query means it cannot end up in the message by accident.
 *
 * Ad sets with no impressions are skipped rather than ranked last: zero
 * impressions means the ad set has not had a chance to perform, and telling
 * someone to pause the one that has not started yet is worse advice than saying
 * nothing.
 */
export async function weakestAdSet(
  db: PrismaClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ name: string; impressions: bigint; leads: bigint }>>`
    SELECT s."name",
           sum(i."impressions")::bigint AS impressions,
           sum(i."leads")::bigint       AS leads
    FROM "ad_insight" i
    JOIN "ad" a          ON a."id" = i."ad_id"
    JOIN "ad_set" s      ON s."id" = a."ad_set_id"
    JOIN "ad_campaign" c ON c."id" = s."campaign_id"
    WHERE i."organization_id" = ${organizationId}
      AND i."date" >= ${from}
      AND i."date" <= ${to}
      AND c."deliveryStatus" = 'ACTIVE'
    GROUP BY s."id", s."name"
    HAVING sum(i."impressions") > 0
  `

  let worstName: string | null = null
  let worstRate = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const impressions = Number(row.impressions)
    const rate = (Number(row.leads) / impressions) * 1000
    if (rate < worstRate) {
      worstRate = rate
      worstName = row.name
    }
  }
  return worstName
}

/**
 * The message.
 *
 * The only numbers permitted are the percentage and the reset date. No rupees, no
 * allocation, no spend, and no ad-set performance figure either — naming the ad
 * set is actionable, quoting its leads-per-thousand invites a client to work
 * backwards toward cost.
 */
export function buildAlertCopy(input: {
  threshold: AllowanceThreshold
  usedPct: number
  monthLabel: string
  resetsOn: string
  adSetToPause: string | null
}): { subject: string; body: string } {
  const { threshold, usedPct, monthLabel, resetsOn, adSetToPause } = input

  if (threshold === 100) {
    return {
      subject: `Ad allowance reached for ${monthLabel}`,
      body: [
        `Your ad allowance for ${monthLabel} is fully used, so new ad flights are paused.`,
        '',
        'Campaigns already running are unaffected and will keep delivering. Anything scheduled to start stays scheduled rather than being cancelled.',
        '',
        `The allowance resets on ${resetsOn}, and paused flights start automatically from then.`,
        '',
        'If this campaign needs to keep pushing before then, reply and we will look at your allocation.',
      ].join('\n'),
    }
  }

  if (threshold === 85) {
    return {
      subject: `${String(usedPct)}% of your ${monthLabel} ad allowance is used`,
      body: [
        `You have used ${String(usedPct)}% of your ad allowance for ${monthLabel}.`,
        '',
        adSetToPause !== null
          ? `If you want to stretch what is left, "${adSetToPause}" is currently turning the fewest impressions into leads — pausing it would leave more of the allowance for the ad sets that are working.`
          : 'There is not enough delivery data yet to say which ad set is worth pausing.',
        '',
        `At 100% new ad flights pause until the allowance resets on ${resetsOn}. Campaigns already running keep delivering.`,
      ].join('\n'),
    }
  }

  return {
    subject: `${String(usedPct)}% of your ${monthLabel} ad allowance is used`,
    body: [
      `You have used ${String(usedPct)}% of your ad allowance for ${monthLabel}.`,
      '',
      'Nothing needs doing — this is the halfway note so the month holds no surprises.',
      '',
      `The allowance resets on ${resetsOn}.`,
    ].join('\n'),
  }
}

/**
 * Plain text to a minimal HTML body.
 *
 * Built from the same string rather than authored twice: two templates for one
 * message is two places for a figure to creep in, and only one of them would be
 * covered by the tests.
 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

/** `2026-08` → `August`, for copy. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y as number, (m as number) - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  })
}

/**
 * Evaluate one organisation and act on any threshold not yet announced.
 *
 * Returns what it planned, whether or not it sent — the caller logs it, and with
 * alerts disabled that log is the only output.
 */
export async function processAllowanceAlerts(
  db: PrismaClient,
  env: WorkerEnv,
  logger: AppLogger,
  org: OrgForAlerts,
  state: { month: string; usedPct: number; from: Date; to: Date },
  now: Date,
): Promise<PlannedAlert[]> {
  const crossed = thresholdsReached(state.usedPct)
  if (crossed.length === 0) return []

  const already = await db.adAllowanceAlert.findMany({
    where: { organizationId: org.id, month: state.month },
    select: { threshold: true },
  })
  const seen = new Set(already.map((a) => a.threshold))
  const fresh = crossed.filter((t) => !seen.has(t))
  if (fresh.length === 0) return []

  // Named once for the whole run, not per threshold: the query is the same and a
  // single reconciliation should not disagree with itself about which ad set is
  // weakest.
  const adSetToPause = fresh.includes(85)
    ? await weakestAdSet(db, org.id, state.from, state.to)
    : null

  const label = monthLabel(state.month)
  const resetsOn = nextResetDate(now, org.timezone)
  const planned: PlannedAlert[] = []

  for (const threshold of fresh) {
    const copy = buildAlertCopy({
      threshold,
      usedPct: state.usedPct,
      monthLabel: label,
      resetsOn,
      adSetToPause: threshold === 85 ? adSetToPause : null,
    })
    planned.push({
      organizationId: org.id,
      organizationName: org.name,
      month: state.month,
      threshold,
      firedWith: fresh,
      usedPct: state.usedPct,
      resetsOn,
      adSetToPause: threshold === 85 ? adSetToPause : null,
      ...copy,
    })
  }

  for (const alert of planned) {
    /**
     * The record is written whether or not anything is delivered.
     *
     * Written first, and `create` rather than `upsert`: two workers reconciling
     * the same organisation at once should collide on the unique index and one
     * should lose, rather than both proceeding to notify. A collision here is the
     * guarantee working, so it is caught and skipped rather than logged as an
     * error.
     */
    try {
      await db.adAllowanceAlert.create({
        data: {
          organizationId: alert.organizationId,
          month: alert.month,
          threshold: alert.threshold,
          firedWith: alert.firedWith,
          usedPctAtFire: alert.usedPct,
          adSetNamed: alert.adSetToPause,
          notifiedAt: org.adAlertsEnabled ? now : null,
        },
      })
    } catch {
      continue
    }

    if (!org.adAlertsEnabled) {
      // The dry run. Everything needed to judge the alert against real spend,
      // without anything leaving the building.
      logger.info(
        {
          dryRun: true,
          organizationId: alert.organizationId,
          organizationName: alert.organizationName,
          month: alert.month,
          threshold: alert.threshold,
          firedWith: alert.firedWith,
          usedPct: alert.usedPct,
          adSetToPause: alert.adSetToPause,
          subject: alert.subject,
        },
        'allowance alert WOULD have fired (alerts disabled for this organisation)',
      )
      continue
    }

    await db.notification.create({
      data: {
        organizationId: alert.organizationId,
        level: alert.threshold === 100 ? 'WARNING' : 'INFO',
        title: alert.subject,
        body: alert.body,
        actionUrl: '/app/marketing/facebook',
      },
    })

    // Owners and admins only: an allowance is a commercial matter, and a
    // contributor who cannot change it does not need the email.
    const recipients = await db.membership.findMany({
      where: { organizationId: alert.organizationId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { user: { select: { email: true } } },
    })
    for (const r of recipients) {
      const to = r.user?.email
      if (!to) continue
      await sendEmail(env, logger, {
        to,
        subject: alert.subject,
        text: alert.body,
        html: textToHtml(alert.body),
      })
    }

    logger.info(
      {
        organizationId: alert.organizationId,
        threshold: alert.threshold,
        usedPct: alert.usedPct,
        recipients: recipients.length,
      },
      'allowance alert sent',
    )
  }

  return planned
}
