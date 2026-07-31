'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/kit'
import { Badge } from '@/components/ui'

interface RoleDef {
  role: string
  permissions: string[]
  assignable: boolean
}

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<RoleDef[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRoles(await api.get<RoleDef[]>('/members/roles'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="What each role can do (read-only reference)" />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !roles || roles.length === 0 ? (
        <EmptyState icon="shield" title="No roles defined" />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {roles.map((r) => (
            <div key={r.role} className="card">
              <div className="spread" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{r.role}</h3>
                <Badge status={r.assignable ? 'ACTIVE' : ''}>
                  {r.assignable ? 'Assignable' : 'System'}
                </Badge>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(r.permissions ?? []).length === 0 ? (
                  <span className="dim">No permissions</span>
                ) : (
                  (r.permissions ?? []).map((p) => (
                    <span key={p} className="badge">
                      {p}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
