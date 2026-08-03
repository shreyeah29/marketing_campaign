'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, Drawer, EmptyState, PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { Field, Spinner } from '@/components/ui'
import { StatusPill, StatusRail, statusLabelFromApi } from '@/components/status'

interface SocialAccount {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
}

interface MetaConnectionView {
  status: string
  adAccountId: string | null
  pageId: string | null
  igUserId: string | null
  connectedAt: string | null
}

type PlatformKey =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'LINKEDIN'
  | 'X'
  | 'GOOGLE_ADS'
  | 'GOOGLE_ANALYTICS'
  | 'EMAIL'
  | 'WEBSITE'

const PLATFORMS: {
  key: PlatformKey
  label: string
  hint: string
  meta?: boolean
  manual?: boolean
  unavailable?: boolean
}[] = [
  {
    key: 'INSTAGRAM',
    label: 'Instagram',
    hint: 'Publish posts, Stories and Reels and see how they perform.',
    meta: true,
  },
  {
    key: 'FACEBOOK',
    label: 'Facebook',
    hint: 'Run Page posts and ads and capture leads automatically.',
    meta: true,
  },
  {
    key: 'LINKEDIN',
    label: 'LinkedIn',
    hint: 'Schedule professional posts and track engagement.',
    manual: true,
  },
  { key: 'X', label: 'X', hint: 'Post and schedule to your profile.', manual: true },
  {
    key: 'GOOGLE_ADS',
    label: 'Google Ads',
    hint: 'Would sync spend, clicks and conversions from search and display ads.',
    unavailable: true,
  },
  {
    key: 'GOOGLE_ANALYTICS',
    label: 'Google Analytics',
    hint: 'Would bring site traffic and conversion data into your reports.',
    unavailable: true,
  },
  {
    key: 'EMAIL',
    label: 'Email',
    hint: 'Send campaigns and track opens and clicks.',
    manual: true,
  },
  {
    key: 'WEBSITE',
    label: 'Website',
    hint: 'Connect your site for landing pages and form submissions.',
    manual: true,
  },
]

const META_BAD = new Set(['EXPIRED', 'ERROR', 'TOKEN_EXPIRED'])

function formatSynced(at: string | null | undefined): string | null {
  if (!at) return null
  try {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export default function ConnectionsPage() {
  const toast = useToast()
  const [meta, setMeta] = useState<MetaConnectionView | null | 'loading'>('loading')
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [connectPlatform, setConnectPlatform] = useState<PlatformKey | null>(null)
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const [unavailableMsg, setUnavailableMsg] = useState<string | null>(null)

  const loadSocial = useCallback(() => {
    api
      .get<SocialAccount[]>('/social/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  const loadMeta = useCallback(() => {
    api
      .get<MetaConnectionView | null>('/meta/connection')
      .then(setMeta)
      .catch(() => setMeta(null))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (code && state) {
      setBusy(true)
      window.history.replaceState({}, '', window.location.pathname)
      api
        .post<MetaConnectionView>('/meta/oauth/exchange', { code, state })
        .then((v) => {
          setMeta(v)
          toast.push('success', 'Facebook and Instagram connected')
        })
        .catch((e: unknown) => {
          toast.push('error', e instanceof ApiError ? e.message : 'Connection failed')
          loadMeta()
        })
        .finally(() => setBusy(false))
    } else {
      loadMeta()
    }
    loadSocial()
  }, [loadMeta, loadSocial, toast])

  async function connectMeta() {
    setBusy(true)
    try {
      const { url } = await api.get<{ url: string }>('/meta/oauth/url')
      const popup = window.open(url, 'meta_oauth', 'width=600,height=720')
      if (!popup) {
        window.location.href = url
        return
      }
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll)
          loadMeta()
          loadSocial()
          setBusy(false)
        }
      }, 400)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not start connect')
      setBusy(false)
    }
  }

  async function submitManual() {
    if (!connectPlatform || handle.trim().length === 0) return
    setBusy(true)
    try {
      await api.post('/social/accounts/connect', {
        platform: connectPlatform,
        handle: handle.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      })
      toast.push('success', 'Account connected')
      setConnectPlatform(null)
      setHandle('')
      setDisplayName('')
      loadSocial()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  async function disconnectSocial(id: string) {
    setBusy(true)
    try {
      await api.del(`/social/accounts/${id}`)
      toast.push('success', 'Account disconnected')
      loadSocial()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Disconnect failed')
    } finally {
      setBusy(false)
      setDisconnectId(null)
    }
  }

  async function disconnectMeta() {
    if (!window.confirm('Disconnect Facebook and Instagram? Scheduled posts will stop.')) return
    setBusy(true)
    try {
      await api.del('/meta/connection')
      toast.push('success', 'Meta disconnected')
      setMeta(null)
    } finally {
      setBusy(false)
    }
  }

  function metaStateFor(platform: 'INSTAGRAM' | 'FACEBOOK'): {
    connected: boolean
    expired: boolean
    name: string | null
    synced: string | null
  } {
    if (meta === 'loading' || !meta)
      return { connected: false, expired: false, name: null, synced: null }
    const expired = META_BAD.has(meta.status.toUpperCase())
    const connected =
      !expired &&
      meta.status.toUpperCase() === 'CONNECTED' &&
      (platform === 'INSTAGRAM' ? Boolean(meta.igUserId) : Boolean(meta.pageId))
    return {
      connected,
      expired,
      name: platform === 'INSTAGRAM' ? 'Instagram via Meta' : 'Facebook Page via Meta',
      synced: formatSynced(meta.connectedAt),
    }
  }

  function socialFor(platform: PlatformKey): SocialAccount | undefined {
    return accounts?.find((a) => a.platform.toUpperCase() === platform)
  }

  function renderCard(def: (typeof PLATFORMS)[number]) {
    const { key, label, hint, meta: isMeta, manual, unavailable } = def

    if (unavailable) {
      return (
        <div key={key} className="conn-card conn-card--dim">
          <div className="conn-card__head">
            <span className="conn-card__icon-wrap is-dim">
              <PlatformIcon platform={key} size={22} />
            </span>
            <h3>{label}</h3>
          </div>
          <p className="muted conn-card__hint">{hint}</p>
          <button
            type="button"
            className="btn sm"
            disabled
            onClick={() => setUnavailableMsg('Not available yet in this workspace.')}
          >
            Connect
          </button>
        </div>
      )
    }

    if (isMeta) {
      const m = metaStateFor(key as 'INSTAGRAM' | 'FACEBOOK')
      const statusKind = m.expired ? 'failed' : m.connected ? 'live' : 'draft'
      const railStatus = m.expired ? 'failed' : 'draft'

      return (
        <StatusRail key={key} status={railStatus} className="conn-card">
          <div className="conn-card__head">
            <span className={`conn-card__icon-wrap${m.connected ? '' : ' is-dim'}`}>
              <PlatformIcon platform={key} size={22} />
            </span>
            <div>
              <h3>{label}</h3>
              {m.connected ? <span className="conn-card__account">{m.name}</span> : null}
            </div>
            <StatusPill status={statusKind} />
          </div>
          <p className="muted conn-card__hint">
            {m.expired ? 'Scheduled posts to this account will fail until reconnected.' : hint}
          </p>
          {m.synced ? <div className="mono conn-card__sync">Last synced · {m.synced}</div> : null}
          <div className="conn-card__actions">
            {m.connected ? (
              <button
                type="button"
                className="btn ghost sm"
                disabled={busy}
                onClick={() => void disconnectMeta()}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="btn primary sm"
                disabled={busy || meta === 'loading'}
                onClick={() => void connectMeta()}
              >
                {busy ? <Spinner /> : m.expired ? 'Reconnect' : 'Connect'}
              </button>
            )}
          </div>
        </StatusRail>
      )
    }

    const acct = socialFor(key)
    const expired = acct ? META_BAD.has(acct.status.toUpperCase()) : false
    const connected = acct?.status.toUpperCase() === 'CONNECTED'
    const statusKind = expired ? 'failed' : connected ? 'live' : 'draft'
    const railStatus = expired ? 'failed' : 'draft'
    const accountLabel = acct?.displayName ?? acct?.handle ?? null

    return (
      <StatusRail key={key} status={railStatus} className="conn-card">
        <div className="conn-card__head">
          <span className={`conn-card__icon-wrap${connected ? '' : ' is-dim'}`}>
            <PlatformIcon platform={key} size={22} />
          </span>
          <div>
            <h3>{label}</h3>
            {accountLabel ? <span className="conn-card__account">{accountLabel}</span> : null}
          </div>
          {acct ? <StatusPill status={statusKind} /> : null}
        </div>
        <p className="muted conn-card__hint">
          {expired ? 'Scheduled posts to this account will fail until reconnected.' : hint}
        </p>
        {manual && connected ? (
          <p className="dim conn-card__perm" style={{ fontSize: 12 }}>
            Post and schedule · {statusLabelFromApi(acct?.status)}
          </p>
        ) : null}
        <div className="conn-card__actions">
          {connected && acct ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => setDisconnectId(acct.id)}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn primary sm"
              disabled={busy || accounts === null}
              onClick={() => {
                setConnectPlatform(key)
                setHandle('')
                setDisplayName('')
              }}
            >
              {expired ? 'Reconnect' : 'Connect'}
            </button>
          )}
        </div>
      </StatusRail>
    )
  }

  return (
    <FadeIn>
      <PageHeader
        title="Connections"
        subtitle="Connect the channels this workspace publishes to and measures."
      />

      {accounts === null || meta === 'loading' ? (
        <div className="state" style={{ minHeight: 200 }}>
          <Spinner />
        </div>
      ) : (
        <div className="conn-grid">{PLATFORMS.map(renderCard)}</div>
      )}

      {connectPlatform ? (
        <Drawer
          open
          title={`Connect ${PLATFORMS.find((p) => p.key === connectPlatform)?.label ?? connectPlatform}`}
          onClose={() => setConnectPlatform(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConnectPlatform(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || handle.trim().length === 0}
                onClick={() => void submitManual()}
              >
                {busy ? <Spinner /> : 'Connect'}
              </button>
            </>
          }
        >
          <div className="banner info" style={{ marginBottom: 14 }}>
            Enter your account handle — this links your profile for scheduling and previews. Full
            sign-in for {PLATFORMS.find((p) => p.key === connectPlatform)?.label} is not available
            in this workspace yet.
          </div>
          <Field label="Handle" hint="Your @username or page URL slug">
            <input
              className="input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourbrand"
            />
          </Field>
          <Field label="Display name" hint="Optional — shown in the calendar and publish flow">
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your brand name"
            />
          </Field>
        </Drawer>
      ) : null}

      <ConfirmDialog
        open={disconnectId !== null}
        title="Disconnect account?"
        message="Scheduled posts targeting this account will no longer publish to it."
        confirmLabel="Disconnect"
        danger
        onConfirm={() => disconnectId && void disconnectSocial(disconnectId)}
        onCancel={() => setDisconnectId(null)}
      />

      {unavailableMsg ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setUnavailableMsg(null)}>
          <div
            className="modal cal-publish"
            role="dialog"
            aria-labelledby="conn-unavail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <EmptyState
              icon="plug"
              title="Not available yet"
              hint={unavailableMsg}
              action={
                <button type="button" className="btn" onClick={() => setUnavailableMsg(null)}>
                  Close
                </button>
              }
            />
          </div>
        </div>
      ) : null}
    </FadeIn>
  )
}
