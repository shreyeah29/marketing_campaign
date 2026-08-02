'use client'

import { ResourcePage } from '@/components/resource-page'
import { StatusPill, toStatus } from '@/components/status'

interface EmailCampaign {
  id: string
  name: string
  status?: string
  createdAt?: string
}

export default function EmailCampaignsPage() {
  return (
    <>
      <ResourcePage<EmailCampaign>
        title="Email Campaigns"
        subtitle="Draft, schedule and send email campaigns to your audience."
        base="/email-campaigns"
        emptyIcon="mail"
        emptyTitle="No campaigns yet"
        emptyHint="Create your first email campaign to get started."
        columns={[
          { key: 'name', header: 'Name', render: (r) => r.name },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusPill status={toStatus(r.status ?? 'DRAFT')} />,
          },
          {
            key: 'createdAt',
            header: 'Created',
            render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
          },
        ]}
        fields={[
          { name: 'name', label: 'Name', required: true, placeholder: 'Spring newsletter' },
          { name: 'subject', label: 'Subject', required: true, placeholder: 'What is inside' },
          { name: 'preheader', label: 'Preview text', placeholder: 'Shown after the subject' },
          { name: 'fromName', label: 'From name', placeholder: 'Acme Marketing' },
        ]}
      />
    </>
  )
}
