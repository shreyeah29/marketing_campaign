'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { LineChart } from '@/components/charts'

interface DashboardKpis {
  revenue?: string
  spend?: string
  roiPercent?: number
}

interface Overview {
  deals: number
  openDeals: number
  wonDeals: number
  aiSpendUsd: string
}

interface TimeseriesPoint {
  date: string
  leads: number
  deals: number
  revenue: string
}

function money(v: string | number | undefined): string {
  if (v === undefined) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function RevenuePage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [dash, ov, ts] = await Promise.all([
        api.get<{ kpis?: DashboardKpis }>('/analytics/dashboard'),
        api.get<Overview>('/analytics/overview'),
        api.get<{ days: TimeseriesPoint[] }>('/analytics/timeseries?days=30'),
      ])
      setKpis(dash?.kpis ?? {})
      setOverview(ov)
      setSeries(ts?.days ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load revenue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const profit =
    kpis?.revenue !== undefined && kpis?.spend !== undefined
      ? Number(kpis.revenue) - Number(kpis.spend)
      : undefined

  const dealRevenue = series.reduce((s, p) => s + Number(p.revenue), 0)
  const revenueLine = series.map((p) => ({ label: shortDate(p.date), value: Number(p.revenue) }))

  return (
    <>
      <PageHeader title="Revenue" subtitle="Revenue trend, closed deals and AI spend" />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          <div className="grid cols-4">
            <StatCard label="Revenue (metrics)" value={money(kpis?.revenue)} />
            <StatCard label="Spend" value={money(kpis?.spend)} />
            <StatCard label="Net profit" value={profit === undefined ? '—' : money(profit)} />
            <StatCard
              label="ROI"
              value={typeof kpis?.roiPercent === 'number' ? `${kpis.roiPercent}%` : '—'}
            />
            <StatCard label="Won deals" value={(overview?.wonDeals ?? 0).toLocaleString()} />
            <StatCard label="Open deals" value={(overview?.openDeals ?? 0).toLocaleString()} />
            <StatCard label="Deal revenue (30d)" value={money(dealRevenue)} />
            <StatCard label="AI spend" value={money(overview?.aiSpendUsd)} />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Deal revenue</div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
              Value of deals created, last 30 days
            </div>
            <LineChart
              data={revenueLine}
              color="var(--color-accent)"
              valueFormat={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
            />
          </div>
        </div>
      )}
    </>
  )
}
