'use client'

import { ResourcePage } from '@/components/resource-page'

type Task = {
  id: string
  title: string
  description?: string | null
  status?: string | null
  priority?: string | null
  dueAt?: string | null
}

export default function TasksPage() {
  return (
    <ResourcePage<Task>
      title="Tasks"
      subtitle="Follow-ups and to-dos"
      base="/tasks"
      emptyIcon="check-square"
      emptyTitle="No tasks yet"
      emptyHint="Add your first task to stay on top of your work."
      columns={[
        { key: 'title', header: 'Title', render: (r) => r.title },
        { key: 'status', header: 'Status', render: (r) => r.status ?? 'TODO' },
        { key: 'priority', header: 'Priority', render: (r) => r.priority ?? 'MEDIUM' },
        {
          key: 'dueAt',
          header: 'Due',
          render: (r) => (r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '—'),
        },
      ]}
      fields={[
        { name: 'title', label: 'Title', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'TODO', label: 'To do' },
            { value: 'IN_PROGRESS', label: 'In progress' },
            { value: 'BLOCKED', label: 'Blocked' },
            { value: 'DONE', label: 'Done' },
            { value: 'CANCELED', label: 'Canceled' },
          ],
        },
        {
          name: 'priority',
          label: 'Priority',
          type: 'select',
          options: [
            { value: 'LOW', label: 'Low' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HIGH', label: 'High' },
            { value: 'URGENT', label: 'Urgent' },
          ],
        },
      ]}
    />
  )
}
