'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { OrgListItem } from '@/lib/types'
import { Badge, Banner, LoadingScreen, Stat } from '@/components/ui'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

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

      <Stagger className="cols-4 grid" style={{ marginBottom: 22 }} interval={0.05}>
        <StaggerItem>
          <Stat label="Total" value={orgs.length} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Active" value={active} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Trial" value={trial} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Suspended" value={suspended} />
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.12} className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  <th>Industry</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Modules</th>
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
                      <div className="row" style={{ gap: 10 }}>
                        {org.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={org.logoUrl}
                            alt=""
                            style={{
                              width: 26,
                              height: 26,
                              objectFit: 'contain',
                              borderRadius: 7,
                              background: '#fff',
                              border: '1px solid var(--border)',
                            }}
                          />
                        ) : (
                          <span className="avatar">{org.name.charAt(0).toUpperCase()}</span>
                        )}
                        <span>
                          <div style={{ fontWeight: 600 }}>{org.name}</div>
                          <div className="dim mono">{org.slug}</div>
                        </span>
                      </div>
                    </td>
                    <td className="dim">{org.industry ?? '—'}</td>
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
      </FadeIn>
    </>
  )
}
