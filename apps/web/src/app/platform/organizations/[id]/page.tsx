'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { Catalog, OrgDetail, OrgStatus } from '@/lib/types'
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
  const [catalog, setCatalog] = useState<Catalog | null>(null)
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
    platform
      .catalog()
      .then(setCatalog)
      .catch(() => setCatalog(null))
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
        <Stat label="Contacts" value={org.usage.contacts} />
        <Stat label="Campaigns" value={org.usage.campaigns} />
        <Stat label="Agent runs" value={org.usage.agentRuns} />
      </div>

      <div className="cols-2 grid">
        {/* Subscription + lifecycle */}
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Subscription</h3>
          <div className="spread" style={{ marginBottom: 10 }}>
            <span className="muted">Plan</span>
            <span className="badge">{org.plan?.name ?? '—'}</span>
          </div>
          <div className="field">
            <label>Change plan</label>
            <select
              className="select"
              value={org.plan?.key ?? ''}
              disabled={acting || !catalog}
              onChange={(e) => act(() => platform.changePlan(id, e.target.value), 'Plan changed.')}
            >
              {(catalog?.plans ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
