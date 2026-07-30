'use client'

import { ResourcePage } from '@/components/resource-page'

type ApiKey = { id: string; name: string; prefix?: string | null; createdAt?: string; lastUsedAt?: string | null }

export default function ApiKeysPage() {
  return (
    <ResourcePage<ApiKey>
      title="API Keys"
      subtitle="Programmatic access tokens for this organization"
      base="/api-keys"
      searchable={false}
      createLabel="Create key"
      emptyIcon="🔑"
      emptyTitle="No API keys yet"
      emptyHint="Create a key to access the API programmatically. The full secret is shown once at creation."
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'prefix', header: 'Prefix', render: (r) => <span className="mono">{r.prefix ?? '—'}</span> },
        {
          key: 'createdAt',
          header: 'Created',
          render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
        },
      ]}
      fields={[{ name: 'name', label: 'Key name', required: true, placeholder: 'e.g. Production server' }]}
    />
  )
}
