'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip } from '@/components/status'

/* ────────────────────────────────────────────────────────────────────────────
 * Meta connection card — the client's "Connect" button.
 *
 * Connect → Meta OAuth (redirects back here with ?code&state) → exchange →
 * pick which ad account / Page to use. The token itself never touches the
 * browser; the API stores it encrypted.
 * ──────────────────────────────────────────────────────────────────────────── */

interface AssetOption {
  id: string
  name: string
}

interface MetaConnectionView {
  status: string
  adAccountId: string | null
  pageId: string | null
  igUserId: string | null
  wabaId: string | null
  connectedAt: string | null
  available?: { adAccounts: AssetOption[]; pages: AssetOption[] }
}

export function MetaConnectCard() {
  const toast = useToast()
  const [view, setView] = useState<MetaConnectionView | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [adAccountId, setAdAccountId] = useState('')
  const [pageId, setPageId] = useState('')

  const load = useCallback(() => {
    api
      .get<MetaConnectionView | null>('/meta/connection')
      .then(setView)
      .catch(() => setView(null))
  }, [])

  // Returning from Meta: the URL carries ?code&state — finish the handshake.
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
          setView(v)
          toast.push('success', 'Meta connected — now choose your ad account and page')
        })
        .catch((e: unknown) => {
          toast.push('error', e instanceof ApiError ? e.message : 'Meta connection failed')
          load()
        })
        .finally(() => setBusy(false))
    } else {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const { url } = await api.get<{ url: string }>('/meta/oauth/url')
      window.location.href = url
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not start Meta connect')
      setBusy(false)
    }
  }

  async function saveAssets() {
    setBusy(true)
    try {
      await api.put('/meta/connection/assets', {
        ...(adAccountId ? { adAccountId } : {}),
        ...(pageId ? { pageId } : {}),
      })
      toast.push('success', 'Meta assets saved — ads and insights are live')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save selection')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Meta? Ads, lead capture and insights will stop.')) return
    setBusy(true)
    try {
      await api.del('/meta/connection')
      toast.push('success', 'Meta disconnected')
      setView(null)
    } finally {
      setBusy(false)
    }
  }

  const conn = view !== 'loading' && view !== null ? view : null
  const connected = conn?.status === 'CONNECTED'
  const needsAssets = connected && !conn.adAccountId

  return (
    <div className="card mt">
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <PlatformIcon platform="FACEBOOK" size={20} />
          <h3>Meta — Facebook & Instagram</h3>
        </div>
        {view === 'loading' ? (
          <Spinner />
        ) : connected ? (
          <Chip>Connected</Chip>
        ) : (
          <Chip>Not connected</Chip>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Connect your Facebook account to publish ads, capture leads automatically, and see reach,
        clicks and audience insights for every post and ad.
      </p>

      {view === 'loading' ? null : !connected ? (
        <button className="btn primary" disabled={busy} onClick={() => void connect()}>
          {busy ? <Spinner /> : 'Connect Meta'}
        </button>
      ) : (
        <>
          {conn?.available && (needsAssets || conn.available.adAccounts.length > 0) ? (
            <div className="cols-2 split grid" style={{ gap: 14, marginBottom: 14 }}>
              <Field label="Ad account">
                <select
                  className="select"
                  value={adAccountId || (conn?.adAccountId ?? '')}
                  onChange={(e) => setAdAccountId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {conn.available.adAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Facebook Page">
                <select
                  className="select"
                  value={pageId || (conn?.pageId ?? '')}
                  onChange={(e) => setPageId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {conn.available.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6, fontSize: 13, marginBottom: 14 }}>
              <div className="spread">
                <span className="muted">Ad account</span>
                <span className="mono">{conn?.adAccountId ?? '—'}</span>
              </div>
              <div className="spread">
                <span className="muted">Page</span>
                <span className="mono">{conn?.pageId ?? '—'}</span>
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            {conn?.available ? (
              <button className="btn primary" disabled={busy} onClick={() => void saveAssets()}>
                {busy ? <Spinner /> : 'Save selection'}
              </button>
            ) : null}
            <button className="btn danger sm" disabled={busy} onClick={() => void disconnect()}>
              <Icon name="x" size={13} /> Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
