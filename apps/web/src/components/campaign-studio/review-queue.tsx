'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { EmptyState, useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { AssetCard } from '@/components/asset-card'
import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, statusLabelFromApi } from '@/components/status'
import { Spinner } from '@/components/ui'

import { useCampaign } from './campaign-context'
import { REVIEW_STATUSES } from './constants'
import { approveCampaignAsset } from './approve-asset'
import type { Asset } from './types'

type StatusFilter = 'needs_review' | 'approved' | 'changes' | 'rejected' | 'all'
type SortKey = 'newest' | 'status' | 'platform'

const STATUS_FILTERS: { id: StatusFilter; label: string; match: (s: string) => boolean }[] = [
  {
    id: 'needs_review',
    label: 'Needs review',
    match: (s) => (REVIEW_STATUSES as readonly string[]).includes(s),
  },
  { id: 'approved', label: 'Approved', match: (s) => s === 'APPROVED' },
  {
    id: 'changes',
    label: 'Changes',
    match: (s) => s === 'REJECTED',
  },
  { id: 'rejected', label: 'Rejected', match: (s) => s === 'REJECTED' },
  { id: 'all', label: 'All', match: () => true },
]

/**
 * Review queue (brief Part 3 §9) — 220px filters / fluid grid / drawer via route.
 * Bulk actions call the per-asset approve/reject endpoints (no bulk verb in the contract).
 */
export function ReviewQueue({
  selectedAssetId,
  drawer,
}: {
  selectedAssetId?: string | null
  drawer?: ReactNode
}) {
  const { campaignId, assets, reload } = useCampaign()
  const router = useRouter()
  const toast = useToast()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs_review')
  const [channel, setChannel] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<SortKey>('newest')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const list = assets ?? []

  const counts = useMemo(() => {
    const m: Record<StatusFilter, number> = {
      needs_review: 0,
      approved: 0,
      changes: 0,
      rejected: 0,
      all: list.length,
    }
    for (const a of list) {
      if ((REVIEW_STATUSES as readonly string[]).includes(a.status)) m.needs_review++
      if (a.status === 'APPROVED') m.approved++
      if (a.status === 'REJECTED') {
        m.changes++
        m.rejected++
      }
    }
    return m
  }, [list])

  const channels = useMemo(() => {
    const s = new Set(list.map((a) => a.platform))
    return [...s].sort()
  }, [list])

  const kinds = useMemo(() => {
    const s = new Set(list.map((a) => a.kind))
    return [...s].sort()
  }, [list])

  const filtered = useMemo(() => {
    const sf = STATUS_FILTERS.find((f) => f.id === statusFilter)!
    let rows = list.filter((a) => sf.match(a.status))
    if (channel) rows = rows.filter((a) => a.platform === channel)
    if (kind) rows = rows.filter((a) => a.kind === kind)
    rows = [...rows]
    if (sort === 'status') rows.sort((a, b) => a.status.localeCompare(b.status))
    else if (sort === 'platform') rows.sort((a, b) => a.platform.localeCompare(b.platform))
    // newest: API list order preserved (no createdAt on Asset in contract)
    return rows
  }, [list, statusFilter, channel, kind, sort])

  const open = useCallback(
    (id: string) => {
      router.push(`/app/campaigns/${campaignId}/assets/${id}`)
    },
    [campaignId, router],
  )

  const closeDrawer = useCallback(() => {
    router.push(`/app/campaigns/${campaignId}/assets`)
  }, [campaignId, router])

  const navigateRelative = useCallback(
    (delta: number) => {
      if (!filtered.length) return
      const idx = selectedAssetId ? filtered.findIndex((a) => a.id === selectedAssetId) : -1
      const next = filtered[(idx < 0 ? 0 : idx) + delta]
      if (next) open(next.id)
    },
    [filtered, selectedAssetId, open],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        navigateRelative(1)
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        navigateRelative(-1)
      } else if (e.key === 'Escape' && selectedAssetId) {
        e.preventDefault()
        closeDrawer()
      } else if ((e.key === 'a' || e.key === 'A') && selectedAssetId) {
        e.preventDefault()
        void runOnIds([selectedAssetId], 'approve')
      } else if ((e.key === 'r' || e.key === 'R') && selectedAssetId) {
        e.preventDefault()
        void runOnIds([selectedAssetId], 'reject')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateRelative, selectedAssetId, closeDrawer])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((a) => a.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function runOnIds(ids: string[], action: 'approve' | 'reject', reason?: string) {
    if (!ids.length) return
    setBusy(true)
    let ok = 0
    let fail = 0
    let generated = 0
    for (const id of ids) {
      try {
        if (action === 'approve') {
          const asset = list.find((a) => a.id === id)
          if (!asset) {
            fail++
            continue
          }
          const result = await approveCampaignAsset(asset)
          if (result === 'generated') generated++
        } else {
          await api.post(`/campaign-assets/${id}/reject`, reason ? { reason } : {})
        }
        ok++
      } catch {
        fail++
      }
    }
    setBusy(false)
    clearSelection()
    reload()
    if (fail === 0) {
      toast.push(
        'success',
        generated > 0
          ? `${ok} done · ${generated} creative${generated === 1 ? '' : 's'} generating`
          : `${ok} ${action === 'approve' ? 'approved' : 'rejected'}`,
      )
    } else toast.push('error', `${ok} succeeded, ${fail} failed`)
  }

  async function quickAct(asset: Asset, action: 'approve' | 'reject' | 'regenerate') {
    setBusy(true)
    try {
      if (action === 'approve') {
        const result = await approveCampaignAsset(asset)
        toast.push(
          'success',
          result === 'generated'
            ? 'Creative generating — refresh in a moment'
            : 'Approved',
        )
      } else if (action === 'reject') {
        await api.post(`/campaign-assets/${asset.id}/reject`, {})
        toast.push('success', 'Rejected')
      } else {
        await api.post(`/campaign-assets/${asset.id}/regenerate`, {})
        toast.push('success', 'Regenerated')
      }
      reload()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${action} failed`)
    } finally {
      setBusy(false)
    }
  }

  if (assets === null) {
    return (
      <div className="rq">
        <div className="rq__center">
          <div className="row" style={{ gap: 8, padding: 40 }}>
            <Spinner />
            <span className="type-secondary">Loading assets…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rq">
      <aside className="rq__filters" aria-label="Filters">
        <p className="rq__filters-label type-caption">Status</p>
        <ul className="rq__filter-list">
          {STATUS_FILTERS.filter((f) => f.id !== 'changes').map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`rq__filter${statusFilter === f.id ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(f.id)}
              >
                <span>{f.label}</span>
                <span className="rq__count strat-mono">{counts[f.id]}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="rq__filters-label type-caption">Channel</p>
        <ul className="rq__filter-list">
          <li>
            <button
              type="button"
              className={`rq__filter${channel === null ? 'is-active' : ''}`}
              onClick={() => setChannel(null)}
            >
              All channels
            </button>
          </li>
          {channels.map((p) => (
            <li key={p}>
              <button
                type="button"
                className={`rq__filter${channel === p ? 'is-active' : ''}`}
                onClick={() => setChannel(p)}
              >
                <PlatformIcon platform={p} size={14} />
                <span>{p.charAt(0) + p.slice(1).toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="rq__filters-label type-caption">Content type</p>
        <ul className="rq__filter-list">
          <li>
            <button
              type="button"
              className={`rq__filter${kind === null ? 'is-active' : ''}`}
              onClick={() => setKind(null)}
            >
              All types
            </button>
          </li>
          {kinds.map((k) => (
            <li key={k}>
              <button
                type="button"
                className={`rq__filter${kind === k ? 'is-active' : ''}`}
                onClick={() => setKind(k)}
              >
                {kindLabel(k)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="rq__center">
        <div className="rq__toolbar">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="rq__toggle" role="group" aria-label="View">
              <button
                type="button"
                className={view === 'grid' ? 'is-active' : ''}
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
              >
                <Icon name="grid" size={14} />
              </button>
              <button
                type="button"
                className={view === 'list' ? 'is-active' : ''}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <Icon name="layout" size={14} />
              </button>
            </div>
            <select
              className="input"
              style={{ width: 'auto', minWidth: 120 }}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort"
            >
              <option value="newest">Newest</option>
              <option value="status">Status</option>
              <option value="platform">Channel</option>
            </select>
            <button type="button" className="btn ghost sm" onClick={selectAllVisible}>
              Select all
            </button>
            {selected.size > 0 ? (
              <button type="button" className="btn ghost sm" onClick={clearSelection}>
                Clear
              </button>
            ) : null}
          </div>
          <p className="type-caption">
            {filtered.length} asset{filtered.length === 1 ? '' : 's'}
            <span className="type-secondary"> · J/K navigate · A approve · R reject · Esc</span>
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="check-square"
            title={list.length === 0 ? 'No assets yet' : 'Nothing matches these filters'}
            hint={
              list.length === 0
                ? 'Generate from Create, then come back here to review.'
                : 'Try another status, channel, or content type.'
            }
          />
        ) : (
          <div className={view === 'grid' ? 'rq__grid' : 'rq__list'}>
            {filtered.map((a) => (
              <div key={a.id} className="rq__item">
                <label className="rq__check">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    aria-label={`Select ${kindLabel(a.kind)}`}
                  />
                </label>
                <AssetCard
                  platform={a.platform}
                  kind={a.kind}
                  status={a.status}
                  body={a.caption || a.body}
                  title={a.title}
                  mediaUrl={a.mediaUrl}
                  selected={a.id === selectedAssetId || selected.has(a.id)}
                  onClick={() => open(a.id)}
                  actions={
                    <>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void quickAct(a, 'approve')
                        }}
                        aria-label="Approve"
                      >
                        <Icon name="check" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          open(a.id)
                        }}
                        aria-label="Edit"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void quickAct(a, 'regenerate')
                        }}
                        aria-label="Regenerate"
                      >
                        <Icon name="refresh" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          void quickAct(a, 'reject')
                        }}
                        aria-label="Reject"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </>
                  }
                />
                {view === 'list' ? (
                  <span className="type-caption rq__list-status">
                    {statusLabelFromApi(a.status)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {selected.size > 0 ? (
          <div className="rq__bulk" role="toolbar" aria-label="Bulk actions">
            <span className="strat-mono">{selected.size} selected</span>
            <button
              type="button"
              className="btn primary sm"
              disabled={busy}
              onClick={() => void runOnIds([...selected], 'approve')}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => void runOnIds([...selected], 'reject', 'Request changes')}
            >
              Request changes
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => void runOnIds([...selected], 'reject')}
              style={{ color: 'var(--crimson-600)' }}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => {
                try {
                  sessionStorage.setItem(
                    `vsp:schedule-pick:${campaignId}`,
                    JSON.stringify([...selected]),
                  )
                } catch {
                  /* ignore */
                }
                router.push(`/app/campaigns/${campaignId}/schedule`)
              }}
            >
              Schedule
            </button>
          </div>
        ) : null}
      </div>

      {drawer}
    </div>
  )
}
