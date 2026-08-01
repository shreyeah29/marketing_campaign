'use client'

import { ResourcePage } from '@/components/resource-page'
import { Badge } from '@/components/ui'

type Prompt = {
  id: string
  name: string
  description?: string | null
  category?: string | null
  isShared?: boolean
}

export default function PromptsPage() {
  return (
    <ResourcePage<Prompt>
      title="Prompt Library"
      subtitle="Reusable prompts for your AI agents and copywriter"
      base="/prompts"
      emptyIcon="sparkles"
      emptyTitle="No saved prompts"
      emptyHint="Save prompts you use often so your team can reuse them."
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
        {
          key: 'isShared',
          header: 'Shared',
          render: (r) =>
            r.isShared ? <Badge status="ok">Shared</Badge> : <span className="dim">Private</span>,
          width: '110px',
        },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'category', label: 'Category', placeholder: 'e.g. Outreach, Ads, Support' },
        { name: 'description', label: 'Prompt', type: 'textarea', placeholder: 'The prompt text…' },
        { name: 'isShared', label: 'Share with team', type: 'checkbox' },
      ]}
    />
  )
}
