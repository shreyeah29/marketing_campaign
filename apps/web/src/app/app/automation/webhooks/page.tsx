'use client'

import { ResourcePage } from '@/components/resource-page'
import { Badge } from '@/components/ui'

interface Webhook {
  id: string
  url: string
  events?: string[]
  isActive?: boolean
  createdAt?: string
}

export default function WebhooksPage() {
  return (
    <ResourcePage<Webhook>
      title="Webhooks"
      subtitle="Deliver platform events to your own endpoints."
      base="/webhooks"
      toForm={(r) => ({ url: r.url, event: r.events?.[0] ?? '', secret: '' })}
      emptyIcon="🪝"
      emptyTitle="No webhooks yet"
      emptyHint="Add a webhook to receive event deliveries."
      columns={[
        { key: 'url', header: 'URL', render: (r) => r.url },
        {
          key: 'event',
          header: 'Events',
          render: (r) => (r.events && r.events.length > 0 ? r.events.join(', ') : '—'),
        },
        {
          key: 'status',
          header: 'Status',
          render: (r) => (
            <Badge status={r.isActive ? 'ACTIVE' : 'PAUSED'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
          ),
        },
      ]}
      fields={[
        { name: 'url', label: 'Endpoint URL', required: true, placeholder: 'https://example.com/hooks' },
        { name: 'event', label: 'Event', placeholder: 'crm.lead.created.v1' },
        { name: 'secret', label: 'Signing secret', required: true, placeholder: 'A shared secret' },
      ]}
    />
  )
}
