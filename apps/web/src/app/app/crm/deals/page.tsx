'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ResourcePage, type FormField } from '@/components/resource-page'
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/kit'

type Deal = {
  id: string
  title: string
  value?: string | number | null
  currency?: string | null
  status?: string | null
  probability?: number | null
  pipelineId?: string | null
  stageId?: string | null
  tags?: string[]
}

interface Stage {
  id: string
  name: string
  position: number
  probability: number
}
interface Pipeline {
  id: string
  name: string
  isDefault: boolean
  stages: Stage[]
}

export default function DealsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadPipelines() {
    setError(null)
    api
      .get<Pipeline[] | { data: Pipeline[] }>('/pipelines/options')
      .then((r) => setPipelines(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load pipelines'))
  }
  useEffect(loadPipelines, [])

  // Deals require a pipeline + stage; both are chosen from dropdowns, never typed.
  if (error) return <ErrorStateWrap message={error} onRetry={loadPipelines} />
  if (pipelines === null) return <LoadingWrap />
  if (pipelines.length === 0) return <NoPipelines />

  const fields: FormField[] = [
    { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Acme annual contract' },
    {
      name: 'pipelineId',
      label: 'Pipeline',
      type: 'select',
      required: true,
      placeholder: 'Select a pipeline…',
      options: pipelines.map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name })),
      resetOnChange: ['stageId'],
    },
    {
      name: 'stageId',
      label: 'Stage',
      type: 'select',
      required: true,
      placeholder: 'Choose a pipeline first…',
      options: (form) => {
        const p = pipelines.find((x) => x.id === form['pipelineId'])
        return p ? p.stages.map((s) => ({ value: s.id, label: s.name })) : []
      },
    },
    { name: 'value', label: 'Value', type: 'number', placeholder: '0' },
    { name: 'currency', label: 'Currency', placeholder: 'USD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'OPEN', label: 'Open' },
        { value: 'WON', label: 'Won' },
        { value: 'LOST', label: 'Lost' },
        { value: 'ABANDONED', label: 'Abandoned' },
      ],
    },
    { name: 'probability', label: 'Probability (%)', type: 'number' },
    { name: 'tags', label: 'Tags', type: 'tags' },
  ]

  const pipelineName = (id?: string | null) => pipelines.find((p) => p.id === id)?.name ?? '—'
  const stageName = (pId?: string | null, sId?: string | null) =>
    pipelines.find((p) => p.id === pId)?.stages.find((s) => s.id === sId)?.name ?? '—'

  return (
    <ResourcePage<Deal>
      title="Deals / Opportunities"
      subtitle="Open and closed revenue opportunities"
      base="/deals"
      emptyIcon="💰"
      emptyTitle="No deals yet"
      emptyHint="Create your first deal to start tracking revenue."
      columns={[
        { key: 'title', header: 'Title', render: (r) => r.title },
        { key: 'pipeline', header: 'Pipeline', render: (r) => pipelineName(r.pipelineId) },
        { key: 'stage', header: 'Stage', render: (r) => stageName(r.pipelineId, r.stageId) },
        { key: 'value', header: 'Value', render: (r) => `${r.currency ?? 'USD'} ${r.value ?? 0}` },
        { key: 'status', header: 'Status', render: (r) => r.status ?? 'OPEN' },
      ]}
      fields={fields}
    />
  )
}

function LoadingWrap() {
  return (
    <>
      <PageHeader title="Deals / Opportunities" subtitle="Open and closed revenue opportunities" />
      <TableSkeleton cols={5} />
    </>
  )
}

function ErrorStateWrap({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <>
      <PageHeader title="Deals / Opportunities" subtitle="Open and closed revenue opportunities" />
      <ErrorState message={message} onRetry={onRetry} />
    </>
  )
}

function NoPipelines() {
  return (
    <>
      <PageHeader title="Deals / Opportunities" subtitle="Open and closed revenue opportunities" />
      <EmptyState
        icon="🪜"
        title="No pipelines yet"
        hint="Deals live inside a pipeline stage. A default sales pipeline is set up per workspace — if you don't see one, ask an administrator to add a pipeline first."
      />
    </>
  )
}
