import { Controller, Get, Inject, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import type { Paginated } from '@vsp/contracts'
import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Analytics — computed from real rows, never fabricated.
 *
 * This is a deliberate break from the previous implementation, whose dashboard
 * returned hardcoded revenue and funnel numbers. Every figure here is an
 * aggregate over `metric_daily` and the CRM tables. When there is no data the
 * response is honest zeros, not invented growth — a fake trend is worse than an
 * empty chart, because someone makes a budget decision on it.
 */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Headline KPIs computed from real data' })
  async dashboard(): Promise<unknown> {
    const [activeCampaigns, leadCount, qualifiedCount, metricTotals, aiSpend] =
      await withTenantTransaction(this.db, (tx) =>
        Promise.all([
          tx.campaign.count({ where: { status: 'ACTIVE', deletedAt: null } }),
          tx.lead.count({ where: { deletedAt: null } }),
          tx.lead.count({ where: { status: 'QUALIFIED', deletedAt: null } }),
          tx.metricDaily.aggregate({
            _sum: { spend: true, revenue: true, leads: true, conversions: true, clicks: true },
          }),
          tx.aiUsage.aggregate({ _sum: { costUsd: true } }),
        ]),
      )

    const revenue = metricTotals._sum.revenue?.toString() ?? '0'
    const spend = metricTotals._sum.spend?.toString() ?? '0'
    const conversions = metricTotals._sum.conversions ?? 0
    const clicks = metricTotals._sum.clicks ?? 0

    // ROI computed only when there was spend. Dividing by zero spend would give
    // Infinity, which a chart renders as a nonsense spike.
    const roi =
      Number(spend) > 0 ? Math.round(((Number(revenue) - Number(spend)) / Number(spend)) * 100) : 0
    const conversionRate =
      clicks > 0 ? Math.round((conversions / clicks) * 1000) / 10 : 0

    return {
      kpis: {
        activeCampaigns,
        leads: leadCount,
        qualifiedLeads: qualifiedCount,
        revenue,
        spend,
        roiPercent: roi,
        conversionRatePercent: conversionRate,
        aiSpendUsd: aiSpend._sum.costUsd?.toString() ?? '0',
      },
    }
  }

  @Get('channels')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Performance grouped by channel' })
  async channels(): Promise<unknown[]> {
    const grouped = await withTenantTransaction(this.db, (tx) =>
      tx.metricDaily.groupBy({
        by: ['channel'],
        _sum: { leads: true, conversions: true, spend: true, revenue: true, clicks: true },
        where: { channel: { not: null } },
      }),
    )

    return grouped.map((row) => {
      const spend = row._sum.spend?.toString() ?? '0'
      const revenue = row._sum.revenue?.toString() ?? '0'
      return {
        channel: row.channel,
        leads: row._sum.leads ?? 0,
        conversions: row._sum.conversions ?? 0,
        clicks: row._sum.clicks ?? 0,
        spend,
        revenue,
        roiPercent:
          Number(spend) > 0
            ? Math.round(((Number(revenue) - Number(spend)) / Number(spend)) * 100)
            : 0,
      }
    })
  }

  @Get('ai-usage')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'AI cost and token usage' })
  async aiUsage(): Promise<unknown> {
    const [byProvider, totals] = await withTenantTransaction(this.db, (tx) =>
      Promise.all([
        tx.aiUsage.groupBy({
          by: ['provider'],
          _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        }),
        tx.aiUsage.aggregate({
          _sum: { costUsd: true, inputTokens: true, outputTokens: true },
          _count: true,
        }),
      ]),
    )

    return {
      totalCostUsd: totals._sum.costUsd?.toString() ?? '0',
      totalCalls: totals._count,
      totalInputTokens: totals._sum.inputTokens ?? 0,
      totalOutputTokens: totals._sum.outputTokens ?? 0,
      byProvider: byProvider.map((p) => ({
        provider: p.provider,
        costUsd: p._sum.costUsd?.toString() ?? '0',
        inputTokens: p._sum.inputTokens ?? 0,
        outputTokens: p._sum.outputTokens ?? 0,
      })),
    }
  }

  @Get('overview')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Consolidated headline counts for the dashboard' })
  async overview(): Promise<unknown> {
    const [
      contacts,
      leads,
      qualifiedLeads,
      deals,
      openDeals,
      wonDeals,
      campaigns,
      activeCampaigns,
      assetsGenerated,
      assetsApproved,
      workflowRuns,
      emailAgg,
      aiSpend,
    ] = await withTenantTransaction(this.db, (tx) =>
      Promise.all([
        tx.contact.count({ where: { deletedAt: null } }),
        tx.lead.count({ where: { deletedAt: null } }),
        tx.lead.count({ where: { status: 'QUALIFIED', deletedAt: null } }),
        tx.deal.count({ where: { deletedAt: null } }),
        tx.deal.count({ where: { status: 'OPEN', deletedAt: null } }),
        tx.deal.count({ where: { status: 'WON', deletedAt: null } }),
        tx.campaign.count({ where: { deletedAt: null } }),
        tx.campaign.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        tx.campaignAsset.count({ where: { status: 'GENERATED', deletedAt: null } }),
        tx.campaignAsset.count({ where: { status: 'APPROVED', deletedAt: null } }),
        tx.workflowRun.count(),
        tx.emailCampaign.aggregate({ _sum: { sentCount: true }, where: { deletedAt: null } }),
        tx.aiUsage.aggregate({ _sum: { costUsd: true } }),
      ]),
    )

    return {
      contacts,
      leads,
      qualifiedLeads,
      deals,
      openDeals,
      wonDeals,
      campaigns,
      activeCampaigns,
      assetsGenerated,
      assetsApproved,
      workflowRuns,
      emailsSent: emailAgg._sum.sentCount ?? 0,
      aiSpendUsd: aiSpend._sum.costUsd?.toString() ?? '0',
    }
  }

  @Get('leads-funnel')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Lead counts grouped by status, in funnel order' })
  async leadsFunnel(): Promise<{ stage: string; count: number }[]> {
    // The canonical funnel order. Every stage is emitted even when empty so the
    // chart shows a complete funnel, not just the stages that happen to have rows.
    const ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'UNQUALIFIED', 'CONVERTED'] as const

    const grouped = await withTenantTransaction(this.db, (tx) =>
      tx.lead.groupBy({ by: ['status'], _count: { _all: true }, where: { deletedAt: null } }),
    )

    const counts = new Map(grouped.map((g) => [g.status, g._count._all]))
    return ORDER.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }))
  }

  @Get('timeseries')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Daily leads, deals and revenue for the last N days' })
  async timeseries(
    @Query('days') daysRaw: string | undefined,
  ): Promise<{ days: { date: string; leads: number; deals: number; revenue: string }[] }> {
    const parsed = Number(daysRaw)
    // Default 30, cap at 90, floor at 1. A hostile ?days=99999 can't force an
    // unbounded scan.
    const days = Number.isFinite(parsed) ? Math.min(90, Math.max(1, Math.trunc(parsed))) : 30

    // Build the inclusive [start, today] window in UTC so day bucketing lines up
    // with the 'YYYY-MM-DD' keys regardless of server timezone.
    const today = new Date()
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
    start.setUTCDate(start.getUTCDate() - (days - 1))

    const [leadRows, dealRows] = await withTenantTransaction(this.db, (tx) =>
      Promise.all([
        tx.lead.findMany({
          where: { deletedAt: null, createdAt: { gte: start } },
          select: { createdAt: true },
        }),
        tx.deal.findMany({
          where: { deletedAt: null, createdAt: { gte: start } },
          select: { createdAt: true, value: true },
        }),
      ]),
    )

    const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

    // Seed every day in the range with zeros, then fold the rows in.
    const buckets = new Map<string, { leads: number; deals: number; revenue: number }>()
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + i)
      buckets.set(dayKey(d), { leads: 0, deals: 0, revenue: 0 })
    }

    for (const row of leadRows) {
      const b = buckets.get(dayKey(row.createdAt))
      if (b) b.leads += 1
    }
    for (const row of dealRows) {
      const b = buckets.get(dayKey(row.createdAt))
      if (b) {
        b.deals += 1
        b.revenue += Number(row.value)
      }
    }

    return {
      days: Array.from(buckets.entries()).map(([date, v]) => ({
        date,
        leads: v.leads,
        deals: v.deals,
        revenue: v.revenue.toFixed(2),
      })),
    }
  }

  @Get('channel-performance')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Email engagement and social asset volume by platform' })
  async channelPerformance(): Promise<unknown> {
    const [email, assetsByPlatform] = await withTenantTransaction(this.db, (tx) =>
      Promise.all([
        tx.emailCampaign.aggregate({
          _sum: { sentCount: true, openCount: true, clickCount: true },
          where: { deletedAt: null },
        }),
        tx.campaignAsset.groupBy({
          by: ['platform'],
          _count: { _all: true },
          where: { deletedAt: null },
        }),
      ]),
    )

    return {
      email: {
        sent: email._sum.sentCount ?? 0,
        opened: email._sum.openCount ?? 0,
        clicked: email._sum.clickCount ?? 0,
      },
      social: assetsByPlatform
        .map((row) => ({ platform: row.platform, assets: row._count._all }))
        .sort((a, b) => b.assets - a.assets),
    }
  }
}

/**
 * Audit log — read-only, append-only.
 *
 * The trail is written by every mutating operation across the app and can never
 * be edited (a database trigger rejects UPDATE) or deleted by the application
 * (the role lacks the privilege). Reading it requires the dedicated `audit:read`
 * permission, so a regular member cannot browse who changed what.
 */
@ApiTags('Audit')
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'List audit entries, newest first' })
  async list(
    @Query('resourceType') resourceType: string | undefined,
    @Query() query: unknown,
  ): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.auditLog.findMany({
        where: {
          ...(resourceType === undefined ? {} : { resourceType }),
          ...keysetWhere(cursor),
        },
        orderBy: KEYSET_ORDER,
        take: limit + 1,
      }),
    )
    return toPage(rows, limit, (a) => ({
      id: a.id,
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      actorType: a.actorType,
      userId: a.userId,
      agentId: a.agentId,
      createdAt: a.createdAt.toISOString(),
    }))
  }
}
