'use client'

import { ProviderNotConfigured } from '@/components/kit'
import { ResourcePage } from '@/components/resource-page'
import { Badge } from '@/components/ui'

interface SocialPost {
  id: string
  body?: string
  status?: string
  createdAt?: string
}

export default function SocialPostsPage() {
  return (
    <>
      <ProviderNotConfigured capability="social" />
      <ResourcePage<SocialPost>
        title="Social Posts"
        subtitle="Compose and schedule posts across your connected social accounts."
        base="/social-posts"
        emptyIcon="📣"
        emptyTitle="No posts yet"
        emptyHint="Compose your first social post."
        columns={[
          {
            key: 'content',
            header: 'Content',
            render: (r) => (r.body ? r.body.slice(0, 80) : '—'),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge status={r.status}>{r.status ?? 'DRAFT'}</Badge>,
          },
        ]}
        fields={[
          {
            name: 'body',
            label: 'Content',
            type: 'textarea',
            required: true,
            placeholder: 'What do you want to share?',
          },
          { name: 'scheduledAt', label: 'Scheduled for', type: 'text', placeholder: 'YYYY-MM-DD' },
        ]}
      />
    </>
  )
}
