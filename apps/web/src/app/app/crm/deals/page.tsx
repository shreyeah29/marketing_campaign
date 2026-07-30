'use client'

import { ResourcePage } from '@/components/resource-page'

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

export default function DealsPage() {
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
        { key: 'value', header: 'Value', render: (r) => `${r.currency ?? 'USD'} ${r.value ?? 0}` },
        { key: 'status', header: 'Status', render: (r) => r.status ?? 'OPEN' },
        { key: 'probability', header: 'Probability', render: (r) => `${r.probability ?? 0}%` },
      ]}
      fields={[
        { name: 'title', label: 'Title', required: true },
        { name: 'pipelineId', label: 'Pipeline ID', required: true, hint: 'The pipeline this deal belongs to.' },
        { name: 'stageId', label: 'Stage ID', required: true, hint: 'The current pipeline stage.' },
        { name: 'value', label: 'Value', type: 'number' },
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
      ]}
    />
  )
}
