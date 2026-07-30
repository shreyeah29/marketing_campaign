'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/kit'
import { Badge } from '@/components/ui'

interface Workspace {
  enabledFeatures: string[]
  plan: { name: string } | null
}

export default function FeaturesPage() {
  const [ws, setWs] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setError(null)
    api
      .get<Workspace>('/me/workspace')
      .then(setWs)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }
  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!ws) return <TableSkeleton cols={2} />

  // Group enabled features by their category prefix (e.g. "crm.contacts" → CRM).
  const groups = new Map<string, string[]>()
  for (const f of ws.enabledFeatures) {
    const cat = f.includes('.') ? f.split('.')[0]! : 'other'
    const list = groups.get(cat) ?? []
    list.push(f)
    groups.set(cat, list)
  }

  return (
    <>
      <PageHeader
        title="Feature Management"
        subtitle={`${ws.enabledFeatures.length} modules enabled on the ${ws.plan?.name ?? 'current'} plan`}
      />
      {ws.enabledFeatures.length === 0 ? (
        <EmptyState icon="🧩" title="No modules enabled" hint="Ask your platform administrator to enable modules." />
      ) : (
        <div className="stack">
          {[...groups.entries()].map(([cat, features]) => (
            <div key={cat} className="card">
              <h3 style={{ textTransform: 'capitalize', marginBottom: 12 }}>{cat}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {features.map((f) => (
                  <Badge key={f} status="ok">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="dim" style={{ fontSize: 12, marginTop: 16 }}>
        Modules are provisioned per organization by the platform operator. To change your plan or enable more
        modules, contact your administrator.
      </p>
    </>
  )
}
