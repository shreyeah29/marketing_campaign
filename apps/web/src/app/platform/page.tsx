'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { OrgListItem } from '@/lib/types'
import { Badge, Banner, LoadingScreen, Stat } from '@/components/ui'

export default function OrganizationsPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    platform
      .listOrganizations()
      .then(setOrgs)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/platform/login')
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load organizations')
      })
  }, [router])

  if (error) return <Banner kind="error">{error}</Banner>
  if (!orgs) return <LoadingScreen />

  const active = orgs.filter((o) => o.status === 'ACTIVE').length
  const trial = orgs.filter((o) => o.status === 'TRIAL').length
  const suspended = orgs.filter((o) => o.status === 'SUSPENDED').length

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="page-sub">Every tenant on the platform. Provision, inspect and manage.</p>
        </div>
        <Link href="/platform/organizations/new" className="btn primary">
          ＋ New organization
        </Link>
      </div>

      <div className="cols-4 grid" style={{ marginBottom: 22 }}>
        <Stat label="Total" value={orgs.length} />
        <Stat label="Active" value={active} />
        <Stat label="Trial" value={trial} />
        <Stat label="Suspended" value={suspended} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {orgs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }} className="muted">
            No organizations yet.{' '}
            <Link href="/platform/organizations/new" style={{ color: 'var(--color-primary)' }}>
              Provision the first one →
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Features</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr
                    key={org.id}
                    className="row-link"
                    onClick={() => router.push(`/platform/organizations/${org.id}`)}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{org.name}</div>
                      <div className="dim mono">{org.slug}</div>
                    </td>
                    <td>
                      {org.plan ? (
                        <span className="badge">{org.plan}</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      <Badge status={org.status}>{org.status}</Badge>
                    </td>
                    <td>{org.members}</td>
                    <td>{org.enabledFeatures}</td>
                    <td className="dim">{new Date(org.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
