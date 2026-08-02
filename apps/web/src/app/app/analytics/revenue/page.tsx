'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { BarChart } from '@/components/charts'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * Revenue analytics — what your campaigns actually earn. The attribution chain
 * runs campaign → lead → completed deal → revenue. GA4 purchase attribution
 * plugs into this same page once the client's property is connected.
 * ──────────────────────────────────────────────────────────────────────────── */

interface RevenueAnalytics {
  summary: { wonRevenueUsd: string; wonDeals: number; pipelineUsd: string; openDeals: number }
  monthly: { month: string; revenueUsd: string }[]
  byCampaign: { campaignId: string; name: string; revenueUsd: string; deals: number }[]
  bySource: { source: string; revenueUsd: string; deals: number }[]
}

const SOURCE_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  FORM: 'Website form',
  EMAIL: 'Email',
  MANUAL: 'Manual',
  DIRECT: 'Direct / untracked',
}

function money(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y ?? 2026, (m ?? 1) - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

export default function RevenueAnalyticsPage() {
  const [data, setData] = useState<RevenueAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<RevenueAnalytics>('/analytics/revenue')
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load revenue analytics'),
      )
  }, [])
  useEffect(load, [load])

  if (error) {
    return (
      <>
        <PageHeader title="Revenue analytics" subtitle="What your campaigns actually earn." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Revenue analytics" subtitle="What your campaigns actually earn." />
        <TableSkeleton cols={4} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Revenue analytics"
        subtitle="Campaign → lead → completed deal: the revenue your marketing produced."
      />

      <div className="stack" style={{ gap: 22 }}>
        <Stagger className="cols-4 grid" interval={0.05}>
          <StaggerItem>
            <StatCard label="Revenue won" value={money(data.summary.wonRevenueUsd)} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Completed deals" value={data.summary.wonDeals.toLocaleString()} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Open pipeline" value={money(data.summary.pipelineUsd)} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Open deals" value={data.summary.openDeals.toLocaleString()} />
          </StaggerItem>
        </Stagger>

        <FadeIn delay={0.12} className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Won revenue by month</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
            Last 90 days
          </div>
          <BarChart
            data={data.monthly.map((m) => ({
              label: monthLabel(m.month),
              value: Number(m.revenueUsd),
            }))}
          />
        </FadeIn>

        <FadeIn
          delay={0.2}
          className="cols-2 split grid"
          style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}
        >
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 4px', fontWeight: 600 }}>Revenue by campaign</div>
            <p className="dim" style={{ padding: '0 18px 10px', fontSize: 12 }}>
              Which campaigns produce paying customers.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Deals</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byCampaign.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="dim" style={{ textAlign: 'center', padding: 24 }}>
                      No campaign-attributed revenue yet.
                    </td>
                  </tr>
                ) : (
                  data.byCampaign.map((c) => (
                    <tr key={c.campaignId}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.deals}</td>
                      <td>{money(c.revenueUsd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 4px', fontWeight: 600 }}>Revenue by source</div>
            <p className="dim" style={{ padding: '0 18px 10px', fontSize: 12 }}>
              Which channels bring customers who complete.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Deals</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.bySource.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="dim" style={{ textAlign: 'center', padding: 24 }}>
                      No revenue yet — it appears when deals complete.
                    </td>
                  </tr>
                ) : (
                  data.bySource.map((s) => (
                    <tr key={s.source}>
                      <td style={{ fontWeight: 600 }}>{SOURCE_LABELS[s.source] ?? s.source}</td>
                      <td>{s.deals}</td>
                      <td>{money(s.revenueUsd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </FadeIn>
      </div>
    </>
  )
}
