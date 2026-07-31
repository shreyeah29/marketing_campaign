'use client'

import { ResourcePage } from '@/components/resource-page'

type Note = { id: string; body: string; contactId?: string | null; createdAt?: string }

export default function NotesPage() {
  return (
    <ResourcePage<Note>
      title="Notes"
      subtitle="Freeform notes across your CRM"
      base="/notes"
      emptyIcon="file-text"
      emptyTitle="No notes yet"
      emptyHint="Capture a thought, a call summary, or context on a contact."
      columns={[
        { key: 'body', header: 'Note', render: (r) => (r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body) },
        {
          key: 'createdAt',
          header: 'Created',
          render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
          width: '140px',
        },
      ]}
      fields={[{ name: 'body', label: 'Note', type: 'textarea', required: true }]}
    />
  )
}
