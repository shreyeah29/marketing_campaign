'use client'

import { ResourcePage } from '@/components/resource-page'

type Company = {
  id: string
  name: string
  domain?: string | null
  industry?: string | null
  size?: string | null
  description?: string | null
  tags?: string[]
}

export default function CompaniesPage() {
  return (
    <ResourcePage<Company>
      title="Companies"
      subtitle="Organizations you work with"
      base="/companies"
      emptyIcon="🏢"
      emptyTitle="No companies yet"
      emptyHint="Add your first company to get started."
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'domain', header: 'Domain', render: (r) => r.domain ?? '—' },
        { key: 'industry', header: 'Industry', render: (r) => r.industry ?? '—' },
        { key: 'size', header: 'Size', render: (r) => r.size ?? '—' },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'domain', label: 'Domain', placeholder: 'example.com' },
        { name: 'industry', label: 'Industry' },
        { name: 'size', label: 'Size', placeholder: '1-10, 11-50, …' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'tags', label: 'Tags', type: 'tags' },
      ]}
    />
  )
}
