import { Inject, Injectable } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Client-facing campaign analytics: the "how are my ads doing, and who is seeing
 * them" numbers. Everything is tenant-scoped (RLS), so a client sees only their
 * own reach, leads and audience.
 *
 * No cost. Ads run on the client's own ad account but are funded by us, so spend
 * is our commercial position rather than theirs — and a client-facing service is
 * the wrong place to compute a number nobody in this plane may see. The rows
 * still carry `spend`; it is aggregated by the operator plane, and by the
 * allowance accumulator, neither of which returns it here.
 *
 * Efficiency is expressed as leads per 1,000 impressions rather than cost per
 * lead. It ranks the same ad sets in the same order — the denominator is the only
 * difference — while being a number a client is allowed to act on.
 */

export interface DateRange {
  readonly from?: string
  readonly to?: string
}

interface Bucket {
  value: string
  reach: number
  impressions: number
  clicks: number
  leads: number
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(String(v))
  return Number.isFinite(n) ? n : 0
}

const DAY = 86_400_000

@Injectable()
export class AdAnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  /** Resolve a from/to range, defaulting to the last 30 days. */
  private range(input: DateRange): { gte: Date; lte: Date } {
    const to = input.to ? new Date(input.to) : new Date()
    const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * DAY)
    return { gte: from, lte: to }
  }

  /** Headline totals: reach, impressions, clicks, leads, CTR, and leads per 1k. */
  async summary(_principal: Principal, input: DateRange): Promise<Record<string, number>> {
    const { gte, lte } = this.range(input)
    return withTenantTransaction(this.db, async (tx) => {
      const agg = await tx.adInsight.aggregate({
        where: { date: { gte, lte } },
        _sum: { impressions: true, reach: true, clicks: true, leads: true },
      })
      const activeCampaigns = await tx.adCampaign.count({
        where: { deletedAt: null, deliveryStatus: { in: ['ACTIVE', 'PENDING_META_REVIEW'] } },
      })
      const impressions = toNum(agg._sum.impressions)
      const clicks = toNum(agg._sum.clicks)
      const leads = toNum(agg._sum.leads)
      return {
        impressions,
        reach: toNum(agg._sum.reach),
        clicks,
        leads,
        activeCampaigns,
        ctr: impressions > 0 ? round(clicks / impressions) : 0,
        // Per 1,000 rather than per impression: leads/impressions on a real
        // campaign is 0.0031, which reads as zero at any sane precision.
        leadsPer1kImpressions: impressions > 0 ? round((leads / impressions) * 1000) : 0,
      }
    })
  }

  /** Audience by age and gender — the "who is seeing your ads" breakdown. */
  async demographics(
    _principal: Principal,
    input: DateRange,
  ): Promise<{ age: Bucket[]; gender: Bucket[] }> {
    const { gte, lte } = this.range(input)
    const [age, gender] = await Promise.all([
      this.buckets('AGE', gte, lte),
      this.buckets('GENDER', gte, lte),
    ])
    return { age, gender }
  }

  /** Audience by region — where the people reached are located. */
  async geography(_principal: Principal, input: DateRange): Promise<Bucket[]> {
    const { gte, lte } = this.range(input)
    const buckets = await this.buckets('REGION', gte, lte)
    return buckets.sort((a, b) => b.reach - a.reach).slice(0, 12)
  }

  /** Daily ad performance for the trend charts. */
  async timeseries(
    _principal: Principal,
    input: DateRange,
  ): Promise<{ date: string; impressions: number; clicks: number; leads: number }[]> {
    const { gte, lte } = this.range(input)
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.adInsight.groupBy({
        by: ['date'],
        where: { date: { gte, lte } },
        _sum: { impressions: true, clicks: true, leads: true },
        orderBy: { date: 'asc' },
      }),
    )
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      impressions: toNum(r._sum.impressions),
      clicks: toNum(r._sum.clicks),
      leads: toNum(r._sum.leads),
    }))
  }

  private async buckets(
    dimension: 'AGE' | 'GENDER' | 'REGION',
    gte: Date,
    lte: Date,
  ): Promise<Bucket[]> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.adInsightBreakdown.groupBy({
        by: ['value'],
        where: { dimension: dimension as never, date: { gte, lte } },
        _sum: { reach: true, impressions: true, clicks: true, leads: true },
      }),
    )
    return rows.map((r) => ({
      value: r.value,
      reach: toNum(r._sum.reach),
      impressions: toNum(r._sum.impressions),
      clicks: toNum(r._sum.clicks),
      leads: toNum(r._sum.leads),
    }))
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
