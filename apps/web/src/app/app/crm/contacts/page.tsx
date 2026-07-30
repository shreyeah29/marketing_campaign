'use client'

import { ResourcePage } from '@/components/resource-page'

type Contact = {
  id: string
  firstName: string
  lastName?: string | null
  email?: string | null
  phone?: string | null
  jobTitle?: string | null
  tags?: string[]
}

export default function ContactsPage() {
  return (
    <ResourcePage<Contact>
      title="Contacts"
      subtitle="Everyone in your CRM"
      base="/contacts"
      emptyIcon="👤"
      emptyTitle="No contacts yet"
      emptyHint="Add your first contact to get started."
      columns={[
        { key: 'name', header: 'Name', render: (r) => `${r.firstName} ${r.lastName ?? ''}`.trim() },
        { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
        { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
        { key: 'jobTitle', header: 'Title', render: (r) => r.jobTitle ?? '—' },
      ]}
      fields={[
        { name: 'firstName', label: 'First name', required: true },
        { name: 'lastName', label: 'Last name' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Phone' },
        { name: 'jobTitle', label: 'Job title' },
      ]}
    />
  )
}
