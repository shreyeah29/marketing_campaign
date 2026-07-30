'use client'

import { ResourcePage } from '@/components/resource-page'
import { Badge } from '@/components/ui'

interface Workflow {
  id: string
  name: string
  status?: string
  createdAt?: string
}

export default function WorkflowsPage() {
  return (
    <ResourcePage<Workflow>
      title="Workflows"
      subtitle="Automate work with triggers, schedules and webhooks."
      base="/workflows"
      emptyIcon="🔀"
      emptyTitle="No workflows yet"
      emptyHint="Create your first automation workflow."
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        {
          key: 'status',
          header: 'Status',
          render: (r) => <Badge status={r.status}>{r.status ?? 'DRAFT'}</Badge>,
        },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true, placeholder: 'Welcome new leads' },
        { name: 'description', label: 'Description', type: 'textarea', placeholder: 'What this workflow does' },
        {
          name: 'triggerType',
          label: 'Trigger',
          type: 'select',
          required: true,
          options: [
            { value: 'manual', label: 'Manual' },
            { value: 'schedule', label: 'Schedule' },
            { value: 'webhook', label: 'Webhook' },
            { value: 'event', label: 'Event' },
          ],
        },
      ]}
    />
  )
}
