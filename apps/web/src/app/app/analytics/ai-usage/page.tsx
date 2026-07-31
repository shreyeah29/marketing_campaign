'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { DataTable, EmptyState, ErrorState, PageHeader, StatCard, TableSkeleton, type Column } from '@/components/kit'

interface ProviderUsage {
  id: string
  provider: string | null
  costUsd: string
  inputTokens: number
  outputTokens: number
}

interface AiUsage {
  totalCostUsd?: string
  totalCalls?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  byProvider?: Omit<ProviderUsage, 'id'>[]
}

function money(v: string | undefined): string {
  const n = Number(v ?? '0')
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'
}

export default function AiUsagePage() {
  const [data, setData] = useState<AiUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<AiUsage>('/analytics/ai-usage'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load AI usage')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows: ProviderUsage[] = (data?.byProvider ?? []).map((p, i) => ({
    ...p,
    id: p.provider ?? `provider-${String(i)}`,
  }))

  const columns: Column<ProviderUsage>[] = [
    { key: 'provider', header: 'Provider', render: (r) => r.provider ?? '—' },
    { key: 'cost', header: 'Cost', render: (r) => money(r.costUsd) },
    { key: 'input', header: 'Input tokens', render: (r) => (r.inputTokens ?? 0).toLocaleString() },
    { key: 'output', header: 'Output tokens', render: (r) => (r.outputTokens ?? 0).toLocaleString() },
  ]

  return (
    <>
      <PageHeader title="AI Usage" subtitle="Cost and token consumption across providers" />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <EmptyState icon="bot" title="No AI usage yet" hint="Usage appears once agents start running." />
      ) : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 22 }}>
            <StatCard label="Total cost" value={money(data.totalCostUsd)} />
            <StatCard label="Total calls" value={(data.totalCalls ?? 0).toLocaleString()} />
            <StatCard label="Input tokens" value={(data.totalInputTokens ?? 0).toLocaleString()} />
            <StatCard label="Output tokens" value={(data.totalOutputTokens ?? 0).toLocaleString()} />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon="bot" title="No provider breakdown yet" hint="Per-provider usage appears as agents run." />
          ) : (
            <DataTable columns={columns} rows={rows} />
          )}
        </>
      )}
    </>
  )
}
