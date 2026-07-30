'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'

import { useWorkspace } from '../layout'

interface DashboardKpis {
  activeCampaigns?: number
  leads?: number
  qualifiedLeads?: number
  revenue?: string
  spend?: string
  roiPercent?: number
  conversionRatePercent?: number
  aiSpendUsd?: string
}

function money(v: string | undefined): string {
  if (v === undefined) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

function num(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}

export default function DashboardPage() {
  const ws = useWorkspace()
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
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orgName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'

  return (
    <>
      <PageHeader
        title={`Welcome, ${orgName}`}
        subtitle={`${ws.plan?.name ?? 'No plan'} · ${ws.enabledFeatures.length} modules enabled`}
      />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : kpis === null || Object.keys(kpis).length === 0 ? (
        <EmptyState icon="📊" title="No data yet" hint="Metrics will appear here as your workspace fills up." />
      ) : (
        <div className="grid cols-4" style={{ marginBottom: 22 }}>
          <StatCard label="Active campaigns" value={num(kpis.activeCampaigns)} />
          <StatCard label="Leads" value={num(kpis.leads)} />
          <StatCard label="Qualified leads" value={num(kpis.qualifiedLeads)} />
          <StatCard label="Revenue" value={money(kpis.revenue)} />
          <StatCard label="Spend" value={money(kpis.spend)} />
          <StatCard label="ROI" value={typeof kpis.roiPercent === 'number' ? `${kpis.roiPercent}%` : '—'} />
          <StatCard
            label="Conversion rate"
            value={typeof kpis.conversionRatePercent === 'number' ? `${kpis.conversionRatePercent}%` : '—'}
          />
          <StatCard label="AI spend" value={money(kpis.aiSpendUsd)} />
        </div>
      )}
    </>
  )
}
