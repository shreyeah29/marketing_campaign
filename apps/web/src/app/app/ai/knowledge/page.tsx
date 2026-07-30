'use client'

import { ResourcePage } from '@/components/resource-page'

type KnowledgeBase = {
  id: string
  name: string
  description?: string | null
  embeddingModel?: string | null
  documentCount?: number | null
  chunkCount?: number | null
}

export default function KnowledgePage() {
  return (
    <ResourcePage<KnowledgeBase>
      title="Knowledge Bases"
      subtitle="RAG corpora your agents can retrieve from"
      base="/knowledge-bases"
      emptyIcon="📚"
      emptyTitle="No knowledge bases yet"
      emptyHint="Create a knowledge base to give your agents grounded context."
      createLabel="New knowledge base"
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
        { key: 'embeddingModel', header: 'Embedding model', render: (r) => r.embeddingModel ?? '—' },
        { key: 'documentCount', header: 'Documents', render: (r) => r.documentCount ?? 0 },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        {
          name: 'embeddingModel',
          label: 'Embedding model',
          placeholder: 'text-embedding-3-small',
          hint: 'Leave blank to use the default embedding model.',
        },
      ]}
    />
  )
}
