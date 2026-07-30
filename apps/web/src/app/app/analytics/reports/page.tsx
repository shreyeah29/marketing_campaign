'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { DataTable, EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton, type Column } from '@/components/kit'

interface ChannelRow {
  id: string
  channel: string | null
  leads: number
  conversions: number
  clicks: number
  spend: string
  revenue: string
  roiPercent: number
}

function money(v: string | undefined): string {
  const n = Number(v ?? '0')
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

export default function ReportsPage() {
  const [rows, setRows] = useState<ChannelRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<Omit<ChannelRow, 'id'>[]>('/analytics/channels')
      // The endpoint returns no id; synthesise one from the channel for the table.
      setRows((res ?? []).map((r, i) => ({ ...r, id: r.channel ?? `channel-${String(i)}` })))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      leads: acc.leads + (r.leads ?? 0),
      conversions: acc.conversions + (r.conversions ?? 0),
      spend: acc.spend + Number(r.spend ?? '0'),
      revenue: acc.revenue + Number(r.revenue ?? '0'),
    }),
    { leads: 0, conversions: 0, spend: 0, revenue: 0 },
  )

  const columns: Column<ChannelRow>[] = [
    { key: 'channel', header: 'Channel', render: (r) => r.channel ?? '—' },
    { key: 'leads', header: 'Leads', render: (r) => (r.leads ?? 0).toLocaleString() },
    { key: 'conversions', header: 'Conversions', render: (r) => (r.conversions ?? 0).toLocaleString() },
    { key: 'clicks', header: 'Clicks', render: (r) => (r.clicks ?? 0).toLocaleString() },
    { key: 'spend', header: 'Spend', render: (r) => money(r.spend) },
    { key: 'revenue', header: 'Revenue', render: (r) => money(r.revenue) },
    { key: 'roi', header: 'ROI', render: (r) => `${r.roiPercent ?? 0}%` },
  ]

  return (
    <>
      <PageHeader title="Channel Reports" subtitle="Performance grouped by acquisition channel" />

      {loading ? (
        <TableSkeleton cols={7} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon="📈" title="No channel data yet" hint="Metrics appear as campaigns record activity." />
      ) : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 22 }}>
            <StatCard label="Total leads" value={totals.leads.toLocaleString()} />
            <StatCard label="Total conversions" value={totals.conversions.toLocaleString()} />
            <StatCard label="Total spend" value={money(String(totals.spend))} />
            <StatCard label="Total revenue" value={money(String(totals.revenue))} />
          </div>
          <DataTable columns={columns} rows={rows} />
        </>
      )}
    </>
  )
}
