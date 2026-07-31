'use client'

import { ResourcePage } from '@/components/resource-page'

type Pipeline = {
  id: string
  name: string
  isDefault?: boolean
  position?: number
}

export default function PipelinesPage() {
  return (
    <ResourcePage<Pipeline>
      title="Pipelines"
      subtitle="Your deal pipelines and stages"
      base="/pipelines"
      readOnly
      emptyIcon="bar-chart"
      emptyTitle="No pipelines yet"
      columns={[
        { key: 'name', header: 'Name', render: (r) => r.name },
        { key: 'isDefault', header: 'Default', render: (r) => (r.isDefault ? 'Yes' : '—') },
        { key: 'position', header: 'Position', render: (r) => r.position ?? 0 },
      ]}
    />
  )
}
