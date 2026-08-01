'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { OrgDetail, OrgStatus } from '@/lib/types'
import { Badge, Banner, LoadingScreen, Spinner, Stat } from '@/components/ui'

const NEXT_STATUS: Record<OrgStatus, { label: string; status: OrgStatus; danger?: boolean }[]> = {
  ACTIVE: [{ label: 'Suspend', status: 'SUSPENDED' }],
  TRIAL: [
    { label: 'Activate', status: 'ACTIVE' },
    { label: 'Suspend', status: 'SUSPENDED' },
  ],
  SUSPENDED: [{ label: 'Reactivate', status: 'ACTIVE' }],
  DELETED: [],
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const id = params.id

  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(
    search.get('provisioned') ? 'Organization provisioned successfully.' : null,
  )
  const [acting, setActing] = useState(false)

  const load = useCallback(() => {
    platform
      .organizationDetail(id)
      .then(setOrg)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/platform/login')
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load organization')
      })
  }, [id, router])

  useEffect(() => {
    load()
  }, [load])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setActing(true)
    setError(null)
    try {
      await fn()
      setNotice(ok)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  if (error && !org) return <Banner kind="error">{error}</Banner>
  if (!org) return <LoadingScreen />

  return (
    <>
      <div className="topbar">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/platform" className="dim">
              Organizations
            </Link>
            <span className="dim">/</span>
            <h1 className="page-title">{org.name}</h1>
            <Badge status={org.status}>{org.status}</Badge>
          </div>
          <p className="page-sub mono">{org.slug}</p>
        </div>
      </div>

      {notice ? <Banner kind="success">{notice}</Banner> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="cols-4 grid" style={{ marginBottom: 22 }}>
        <Stat label="Members" value={org.usage.members} />
        <Stat label="Leads" value={org.usage.leads} />
        <Stat label="Campaigns" value={org.usage.campaigns} />
        <Stat label="Assets generated" value={org.usage.assets} />
      </div>

      <div className="cols-2 grid">
        {/* Company & brand profile */}
        <div className="card">
          <div className="row" style={{ gap: 12, marginBottom: 14 }}>
            {org.branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.branding.logoUrl}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  objectFit: 'contain',
                  borderRadius: 10,
                  background: '#fff',
                  border: '1px solid var(--border)',
                  padding: 4,
                }}
              />
            ) : null}
            <h3>Company & brand</h3>
          </div>
          <div className="stack" style={{ gap: 8, fontSize: 13 }}>
            <div className="spread">
              <span className="muted">Industry</span>
              <span>{org.industry ?? '—'}</span>
            </div>
            <div className="spread">
              <span className="muted">Registered</span>
              <span>{org.registeredYear ?? '—'}</span>
            </div>
            <div className="spread">
              <span className="muted">Website</span>
              {org.website ? (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {org.website.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            {org.description ? (
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  About
                </div>
                <p className="dim">{org.description}</p>
              </div>
            ) : null}
            {org.profile?.vision ? (
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Vision — fed to every generation
                </div>
                <p className="dim">{org.profile.vision}</p>
              </div>
            ) : null}
            {org.profile?.targetAudience ? (
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Target audience
                </div>
                <p className="dim">{org.profile.targetAudience}</p>
              </div>
            ) : null}
          </div>

          <h3 style={{ margin: '20px 0 12px' }}>Lifecycle</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {NEXT_STATUS[org.status].map((a) => (
              <button
                key={a.status}
                className="btn sm"
                disabled={acting}
                onClick={() =>
                  act(
                    () => platform.setStatus(id, a.status),
                    `Organization ${a.label.toLowerCase()}d.`,
                  )
                }
              >
                {acting ? <Spinner /> : a.label}
              </button>
            ))}
            {org.status !== 'DELETED' && (
              <button
                className="btn sm danger"
                disabled={acting}
                onClick={() => {
                  if (!window.confirm(`Delete ${org.name}? This locks the org out immediately.`))
                    return
                  act(() => platform.setStatus(id, 'DELETED'), 'Organization deleted.')
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* AI usage + limits */}
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>AI usage</h3>
          <div className="spread" style={{ marginBottom: 8 }}>
            <span className="muted">Total AI cost</span>
            <span style={{ fontWeight: 600 }}>${Number(org.usage.aiCostUsd).toFixed(2)}</span>
          </div>
          <div className="spread" style={{ marginBottom: 8 }}>
            <span className="muted">AI calls</span>
            <span style={{ fontWeight: 600 }}>{org.usage.aiCalls}</span>
          </div>
          <h3 style={{ margin: '20px 0 12px' }}>Limits</h3>
          {org.limits.length === 0 ? (
            <span className="dim">No limits configured.</span>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {org.limits.slice(0, 8).map((l) => (
                <div key={l.metric} className="spread">
                  <span className="muted mono">{l.metric}</span>
                  <span>{l.limit === -1 ? 'Unlimited' : l.limit.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Enabled modules */}
      <div className="card mt">
        <div className="spread" style={{ marginBottom: 14 }}>
          <h3>Enabled modules</h3>
          <Badge status="info">{org.features.length}</Badge>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {org.features.map((f) => (
            <span key={f.key} className="badge" title={`source: ${f.source}`}>
              {f.key}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
