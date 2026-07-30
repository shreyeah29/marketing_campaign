'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'

interface DashboardKpis {
  revenue?: string
  spend?: string
  roiPercent?: number
  conversionRatePercent?: number
}

function money(v: string | undefined): string {
  if (v === undefined) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

export default function RevenuePage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ kpis?: DashboardKpis }>('/analytics/dashboard')
      setKpis(res?.kpis ?? {})
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

  const hasRevenue =
    kpis != null &&
    (kpis.revenue !== undefined ||
      kpis.spend !== undefined ||
      kpis.roiPercent !== undefined ||
      kpis.conversionRatePercent !== undefined)

  const profit =
    kpis?.revenue !== undefined && kpis?.spend !== undefined
      ? Number(kpis.revenue) - Number(kpis.spend)
      : undefined

  return (
    <>
      <PageHeader title="Revenue" subtitle="Revenue, spend and return on investment" />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !hasRevenue ? (
        <EmptyState icon="💰" title="No revenue data yet" hint="Revenue figures appear as campaigns report results." />
      ) : (
        <div className="grid cols-4">
          <StatCard label="Revenue" value={money(kpis?.revenue)} />
          <StatCard label="Spend" value={money(kpis?.spend)} />
          <StatCard label="Net profit" value={profit === undefined ? '—' : money(String(profit))} />
          <StatCard label="ROI" value={typeof kpis?.roiPercent === 'number' ? `${kpis.roiPercent}%` : '—'} />
          <StatCard
            label="Conversion rate"
            value={typeof kpis?.conversionRatePercent === 'number' ? `${kpis.conversionRatePercent}%` : '—'}
          />
        </div>
      )}
    </>
  )
}
