'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { DataTable, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/kit'

interface UsageRow {
  id: string
  provider?: string | null
  model?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: string | number | null
  createdAt?: string
}

export default function AiHistoryPage() {
  const [rows, setRows] = useState<UsageRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setError(null)
    api
      .get<UsageRow[] | { data: UsageRow[] }>('/ai/history')
      .then((r) => setRows(Array.isArray(r) ? r : r.data))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }
  useEffect(load, [])

  return (
    <>
      <PageHeader title="AI History" subtitle="Every AI request, its model, tokens and cost" />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows === null ? (
        <TableSkeleton cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🧾" title="No AI usage yet" hint="Runs from AI Chat and the Copywriter appear here." />
      ) : (
        <DataTable<UsageRow>
          columns={[
            { key: 'model', header: 'Model', render: (r) => r.model ?? r.provider ?? '—' },
            { key: 'in', header: 'Input tokens', render: (r) => r.inputTokens ?? 0 },
            { key: 'out', header: 'Output tokens', render: (r) => r.outputTokens ?? 0 },
            { key: 'cost', header: 'Cost', render: (r) => `$${Number(r.costUsd ?? 0).toFixed(4)}` },
            {
              key: 'when',
              header: 'When',
              render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'),
            },
          ]}
          rows={rows}
        />
      )}
    </>
  )
}
