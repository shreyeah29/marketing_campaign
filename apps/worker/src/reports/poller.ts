import type { PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import {
  composeReportHtml,
  previousMonthPeriod,
  reportCampaignName,
  type ReportData,
  type ReportPeriod,
} from './report.js'

/**
 * The monthly client report — composes last month's performance into an email
 * and hands it to the existing delivery pipeline.
 *
 * This poller never touches the network. For each opted-in organisation it
 * writes one EmailCampaign (the ledger) plus one QUEUED EmailSend; the schedule
 * poller's email drain then does the actual send with its atomic claim and
 * bounded retries. Idempotency is the deterministic campaign name per
 * organisation per month — checked in the same transaction that creates it, so
 * a redeploy or a second worker pod cannot double-send.
 *
 * Runs on the OWNER connection: it must enumerate organisations across tenants.
 * Every write names its organizationId explicitly, like the other pollers.
 */

const TICK_MS = 60 * 60 * 1000
const FIRST_TICK_MS = 60 * 1000

export class MonthlyReportPoller {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private running = false

  constructor(
    private readonly db: PrismaClient,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    const tick = async (): Promise<void> => {
      if (this.stopped) return
      await this.runOnce()
      if (!this.stopped) this.timer = setTimeout(() => void tick(), TICK_MS)
    }
    this.timer = setTimeout(() => void tick(), FIRST_TICK_MS)
    this.logger.info({ tickMs: TICK_MS }, 'monthly report poller started')
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    const deadline = Date.now() + 60_000
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const period = previousMonthPeriod(new Date())
      const enabled = await this.db.organizationSettings.findMany({
        where: {
          monthlyReportEnabled: true,
          organization: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE'] } },
        },
        select: {
          organizationId: true,
          reportRecipientEmail: true,
          organization: { select: { name: true } },
        },
      })
      for (const settings of enabled) {
        try {
          await this.sendForOrg(
            settings.organizationId,
            settings.organization.name,
            settings.reportRecipientEmail,
            period,
          )
        } catch (err) {
          this.logger.error(
            { err, organizationId: settings.organizationId },
            'monthly report failed for organisation',
          )
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'monthly report tick failed')
    } finally {
      this.running = false
    }
  }

  private async sendForOrg(
    organizationId: string,
    organizationName: string,
    recipientOverride: string | null,
    period: ReportPeriod,
  ): Promise<void> {
    const name = reportCampaignName(period)

    // Cheap pre-check outside the transaction — in steady state every tick
    // after the first sees the row and stops here.
    const already = await this.db.emailCampaign.findFirst({
      where: { organizationId, name },
      select: { id: true },
    })
    if (already) return

    const recipient = recipientOverride ?? (await this.ownerEmail(organizationId))
    if (!recipient) {
      this.logger.warn({ organizationId }, 'monthly report skipped — no recipient resolvable')
      return
    }

    const data = await this.collect(organizationId, organizationName, period)
    const html = composeReportHtml(data)
    const subject = `Your ${period.label} marketing report — ${organizationName}`

    await this.db.$transaction(async (tx) => {
      // Re-check inside the transaction so two pods racing the first tick of
      // the month cannot both create the ledger row.
      const exists = await tx.emailCampaign.findFirst({
        where: { organizationId, name },
        select: { id: true },
      })
      if (exists) return

      const campaign = await tx.emailCampaign.create({
        data: {
          organizationId,
          name,
          subject,
          bodyHtml: html,
          status: 'SCHEDULED',
          scheduledAt: new Date(),
          recipientCount: 1,
        },
      })
      await tx.emailSend.create({
        data: {
          organizationId,
          emailCampaignId: campaign.id,
          toEmail: recipient,
          subject,
          status: 'QUEUED',
        },
      })
    })

    await this.db.notification
      .create({
        data: {
          organizationId,
          level: 'INFO',
          title: `Your ${period.label} report is on its way`,
          body: `The monthly performance report was sent to ${recipient}.`,
          actionUrl: '/app/analytics/reports',
        },
      })
      .catch(() => undefined)

    this.logger.info({ organizationId, period: period.key }, 'monthly report queued')
  }

  /** The organisation OWNER's email — the default recipient. */
  private async ownerEmail(organizationId: string): Promise<string | null> {
    const owner = await this.db.membership.findFirst({
      where: { organizationId, role: 'OWNER', deletedAt: null },
      select: { user: { select: { email: true } } },
    })
    return owner?.user.email ?? null
  }

  /** Gathers the month's numbers. Client-facing: no spend, no ROI, no fees. */
  private async collect(
    organizationId: string,
    organizationName: string,
    period: ReportPeriod,
  ): Promise<ReportData> {
    const createdInMonth = { gte: period.start, lt: period.end }

    const [
      leadsTotal,
      leadsQualified,
      leadsConverted,
      leadsBySource,
      dealsWon,
      activeCampaigns,
      topCampaignMetrics,
      emailAgg,
      socialPublished,
      adAgg,
    ] = await Promise.all([
      this.db.lead.count({ where: { organizationId, createdAt: createdInMonth } }),
      this.db.lead.count({
        where: {
          organizationId,
          createdAt: createdInMonth,
          status: { in: ['QUALIFIED', 'CONVERTED'] },
        },
      }),
      this.db.lead.count({
        where: { organizationId, createdAt: createdInMonth, status: 'CONVERTED' },
      }),
      this.db.lead.groupBy({
        by: ['source'],
        where: { organizationId, createdAt: createdInMonth },
        _count: { _all: true },
      }),
      this.db.deal.aggregate({
        where: { organizationId, status: 'WON', closedAt: createdInMonth },
        _count: { _all: true },
        _sum: { value: true },
      }),
      this.db.campaign.count({ where: { organizationId, status: 'ACTIVE', deletedAt: null } }),
      this.db.metricDaily.groupBy({
        by: ['campaignId'],
        where: { organizationId, date: createdInMonth, campaignId: { not: null } },
        _sum: { leads: true },
        orderBy: { _sum: { leads: 'desc' } },
        take: 5,
      }),
      this.db.emailSend.aggregate({
        where: { organizationId, sentAt: createdInMonth },
        _count: { _all: true },
        _sum: { openCount: true },
      }),
      this.db.socialPost.count({
        where: { organizationId, status: 'PUBLISHED', publishedAt: createdInMonth },
      }),
      this.db.adInsight.aggregate({
        where: { organizationId, date: createdInMonth },
        _sum: { impressions: true, clicks: true, leads: true },
      }),
    ])

    const campaignIds = topCampaignMetrics
      .map((m) => m.campaignId)
      .filter((id): id is string => id !== null)
    const campaignNames =
      campaignIds.length > 0
        ? await this.db.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, name: true },
          })
        : []
    const nameById = new Map(campaignNames.map((c) => [c.id, c.name]))

    return {
      organizationName,
      period,
      leads: {
        total: leadsTotal,
        qualified: leadsQualified,
        converted: leadsConverted,
        bySource: leadsBySource
          .map((row) => ({ source: row.source ?? 'Direct', count: row._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      deals: {
        won: dealsWon._count._all,
        revenue: Number(dealsWon._sum.value ?? 0),
        currency: 'USD',
      },
      campaigns: {
        active: activeCampaigns,
        top: topCampaignMetrics
          .filter((m) => m.campaignId !== null && (m._sum.leads ?? 0) > 0)
          .map((m) => ({
            name: nameById.get(m.campaignId ?? '') ?? 'Untitled campaign',
            leads: m._sum.leads ?? 0,
          })),
      },
      email: { sent: emailAgg._count._all, opens: emailAgg._sum.openCount ?? 0 },
      social: { published: socialPublished },
      ads: {
        impressions: adAgg._sum.impressions ?? 0,
        clicks: adAgg._sum.clicks ?? 0,
        leads: adAgg._sum.leads ?? 0,
      },
    }
  }
}
