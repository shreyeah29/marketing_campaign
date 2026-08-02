'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, setViewAsToken } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { OrgDetail, OrgStatus } from '@/lib/types'
import { Badge, Banner, LoadingScreen, Spinner, Stat } from '@/components/ui'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

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
        {org.status !== 'DELETED' ? (
          <button
            className="btn"
            disabled={acting}
            onClick={() =>
              act(async () => {
                // Same-tab on purpose: the bridge token lives in sessionStorage,
                // which does not reliably follow into a new tab. Exit view
                // returns here.
                const res = await platform.startViewSession(id)
                setViewAsToken(res.token)
                try {
                  window.sessionStorage.removeItem('vsp:shell:v1')
                } catch {
                  /* ignore */
                }
                router.push('/app')
              }, 'View session started.')
            }
          >
            {acting ? <Spinner /> : 'View as client'}
          </button>
        ) : null}
      </div>

      {notice ? <Banner kind="success">{notice}</Banner> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <SetupTracker setup={org.setup} />

      <Stagger className="cols-4 grid" style={{ marginBottom: 22 }} interval={0.05}>
        <StaggerItem>
          <Stat label="Members" value={org.usage.members} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Leads" value={org.usage.leads} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Campaigns" value={org.usage.campaigns} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Assets generated" value={org.usage.assets} />
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.12} className="cols-2 grid">
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
          <h3 style={{ margin: '20px 0 12px' }}>Monthly service fee (private)</h3>
          <FeeEditor
            orgId={id}
            current={org.monthlyFeeUsd}
            onSaved={() => {
              setNotice('Fee updated.')
              load()
            }}
          />

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
      </FadeIn>

      {/* Enabled modules */}
      <FadeIn delay={0.18} className="card mt">
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
      </FadeIn>
    </>
  )
}

/**
 * The operator's private fee note — what this client pays for the service.
 * Never rendered anywhere a tenant can see; margin = fee minus your AI cost.
 */
function FeeEditor({
  orgId,
  current,
  onSaved,
}: {
  orgId: string
  current: number | null
  onSaved: () => void
}) {
  const [value, setValue] = useState(current !== null ? String(current) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const n = Number(value)
      await platform.setFee(orgId, value.trim() === '' || !Number.isFinite(n) ? null : n)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <input
        className="input"
        style={{ maxWidth: 160 }}
        inputMode="decimal"
        placeholder="e.g. 1500"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
        aria-label="Monthly service fee in USD"
      />
      <button className="btn sm" disabled={busy} onClick={() => void save()}>
        {busy ? <Spinner /> : 'Save'}
      </button>
      <span className="dim" style={{ fontSize: 12 }}>
        USD/month · only you see this
      </span>
    </div>
  )
}

/**
 * Activation checklist — the distance between "provisioned" and "fully live".
 * Collapses to a single green line once every step is done.
 */
function SetupTracker({ setup }: { setup: OrgDetail['setup'] }) {
  const STEPS: { key: keyof OrgDetail['setup']; label: string }[] = [
    { key: 'brandProfile', label: 'Brand profile (logo + vision)' },
    { key: 'metaConnected', label: 'Meta connected' },
    { key: 'socialConnected', label: 'Social account connected' },
    { key: 'firstCampaign', label: 'First campaign generated' },
    { key: 'firstLead', label: 'First lead captured' },
  ]
  const done = STEPS.filter((s) => setup[s.key]).length

  if (done === STEPS.length) {
    return (
      <div className="banner success" style={{ marginBottom: 18 }}>
        Fully onboarded — all {STEPS.length} activation steps complete.
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 18, padding: '14px 18px' }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Onboarding progress</span>
        <span className="badge info">
          {done}/{STEPS.length}
        </span>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {STEPS.map((s) => (
          <span
            key={s.key}
            className={`badge ${setup[s.key] ? 'ok' : ''}`}
            style={setup[s.key] ? {} : { opacity: 0.75 }}
          >
            {setup[s.key] ? '✓ ' : '○ '}
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
