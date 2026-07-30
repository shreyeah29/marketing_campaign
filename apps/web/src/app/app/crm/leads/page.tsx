'use client'

import { ResourcePage } from '@/components/resource-page'

type Lead = {
  id: string
  status?: string | null
  score?: number | null
  source?: string | null
  medium?: string | null
  value?: string | number | null
  tags?: string[]
}

export default function LeadsPage() {
  return (
    <ResourcePage<Lead>
      title="Leads"
      subtitle="Prospects working through qualification"
      base="/leads"
      emptyIcon="🎯"
      emptyTitle="No leads yet"
      emptyHint="Capture your first lead to get started."
      columns={[
        { key: 'status', header: 'Status', render: (r) => r.status ?? 'NEW' },
        { key: 'score', header: 'Score', render: (r) => r.score ?? 0 },
        { key: 'source', header: 'Source', render: (r) => r.source ?? '—' },
        { key: 'medium', header: 'Medium', render: (r) => r.medium ?? '—' },
      ]}
      fields={[
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'NEW', label: 'New' },
            { value: 'CONTACTED', label: 'Contacted' },
            { value: 'QUALIFIED', label: 'Qualified' },
            { value: 'NURTURING', label: 'Nurturing' },
            { value: 'UNQUALIFIED', label: 'Unqualified' },
            { value: 'CONVERTED', label: 'Converted' },
          ],
        },
        { name: 'score', label: 'Score', type: 'number' },
        { name: 'source', label: 'Source' },
        { name: 'medium', label: 'Medium' },
        { name: 'tags', label: 'Tags', type: 'tags' },
      ]}
    />
  )
}
