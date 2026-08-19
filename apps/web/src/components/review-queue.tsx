'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, EmptyState, ErrorState, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { Spinner } from '@/components/ui'

/**
 * Review queue — step 5 of six.
 *
 * One screen for everything awaiting a person, drawn from both surfaces that
 * produce reviewable work: campaign assets (Runway artwork, copy, ad sets) and
 * creatives (template-rendered posters). They are separate tables with separate
 * approve endpoints; splitting them across two screens would mean the sidebar
 * badge counts one thing and links to another, which is how a queue stops being
 * trusted.
 *
 * On cost, this screen says only what is true. Approving does not generate
 * anything — it is a status change, and a rejected asset can be reopened. The
 * spend on this screen is **Redo**, which asks the provider for a new
 * generation, so that is where the confirmation lives. Telling someone that
 * approving costs a video minute would be tidy and false; the minute was spent
 * before the asset reached here.
 */

type Kind = 'image' | 'video' | 'copy'
type Source = 'asset' | 'creative'

interface Item {
  id: string
  source: Source
  kind: Kind
  title: string
  meta: string
  campaign: string
  platform: string
  mediaUrl: string | null
  text: string | null
  failed: boolean
  failureReason: string | null
  createdAt: string | null
}

interface RawAsset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  mediaUrl?: string | null
  campaignId?: string | null
  createdAt?: string | null
  /**
   * Why this one failed, written by the API when generation gave up.
   *
   * The column has always existed and nothing ever filled it, so this screen
   * hard-coded null and every failed picture read "Render failed" and stopped
   * there. The reason now travels with the asset.
   */
  failureReason?: string | null
}

interface RawCreative {
  id: string
  status: string
  renderedUrl: string | null
  templateSlug: string
  aspectRatio: string
  failureReason: string | null
  createdAt?: string | null
  product: { name: string; brand: string | null } | null
  campaign?: { name: string } | null
}

const KIND_LABEL: Record<Kind, string> = { image: 'Images', video: 'Video', copy: 'Copy' }

/** Campaign-asset kinds that are reviewable, mapped to the three filter buckets. */
const ASSET_KIND: Record<string, Kind> = {
  IMAGE_PROMPT: 'image',
  VIDEO_PROMPT: 'video',
  POST: 'copy',
  AD_COPY: 'copy',
  AD_HEADLINE: 'copy',
  AD_DESCRIPTION: 'copy',
}

const APPROVABLE_ASSET = new Set(['GENERATED', 'NEEDS_REVIEW'])
const APPROVABLE_CREATIVE = new Set(['READY'])

function unwrap<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

/** "2h", "1d" — relative, and stable enough that it need not tick. */
function ago(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${String(Math.max(1, mins))}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${String(hours)}h`
  return `${String(Math.floor(hours / 24))}d`
}

export function ReviewQueue() {
  const router = useRouter()
  const toast = useToast()

  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmRedo, setConfirmRedo] = useState<Item | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [assetsRes, creativesRes, campsRes] = await Promise.allSettled([
        api.get<RawAsset[] | { data: RawAsset[] }>('/campaign-assets'),
        api.get<{ data: RawCreative[] }>('/creatives'),
        api.get<{ id: string; name: string }[] | { data: { id: string; name: string }[] }>(
          '/campaigns',
        ),
      ])

      const names = new Map<string, string>()
      if (campsRes.status === 'fulfilled') {
        for (const c of unwrap(campsRes.value)) names.set(c.id, c.name)
      }

      const next: Item[] = []

      if (assetsRes.status === 'fulfilled') {
        for (const a of unwrap(assetsRes.value)) {
          const kind = ASSET_KIND[a.kind]
          if (!kind) continue
          const failed = a.status === 'FAILED'
          if (!failed && !APPROVABLE_ASSET.has(a.status)) continue
          // An artwork asset with no artwork is not reviewable — it is still
          // rendering, and showing it here would invite approving a blank.
          if (!failed && kind !== 'copy' && !a.mediaUrl) continue
          next.push({
            id: a.id,
            source: 'asset',
            kind,
            title: a.title?.trim() || 'Untitled',
            meta:
              kind === 'copy'
                ? a.kind.replace(/_/g, ' ').toLowerCase()
                : a.kind === 'VIDEO_PROMPT'
                  ? 'video'
                  : 'image',
            campaign: (a.campaignId ? names.get(a.campaignId) : null) ?? 'Campaign',
            platform: a.platform.toUpperCase(),
            mediaUrl: a.mediaUrl ?? null,
            text: kind === 'copy' ? a.body : null,
            failed,
            failureReason: a.failureReason ?? null,
            createdAt: a.createdAt ?? null,
          })
        }
      }

      if (creativesRes.status === 'fulfilled') {
        for (const c of creativesRes.value.data ?? []) {
          const failed = c.status === 'FAILED'
          if (!failed && !APPROVABLE_CREATIVE.has(c.status)) continue
          next.push({
            id: c.id,
            source: 'creative',
            kind: 'image',
            title: c.product?.name ?? 'Poster',
            meta: `${c.templateSlug} · ${c.aspectRatio}`,
            campaign: c.campaign?.name ?? 'Campaign',
            platform: 'GENERIC',
            mediaUrl: c.renderedUrl,
            text: null,
            failed,
            failureReason: c.failureReason,
            createdAt: c.createdAt ?? null,
          })
        }
      }

      // Oldest first: the queue is a backlog, and the thing waiting longest is
      // the thing most likely to be holding up a schedule.
      /**
       * Pictures first, then video, then copy — and oldest first inside each.
       *
       * A queue of ten where eight are captions buries the two things that
       * actually need looking at, because a caption can be judged from the card
       * and a poster cannot be judged at all until it is seen. Failures come
       * first of all: they are the only rows where waiting changes nothing.
       */
      const rank: Record<Kind, number> = { image: 0, video: 1, copy: 2 }
      next.sort((a, b) => {
        if (a.failed !== b.failed) return a.failed ? -1 : 1
        if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind]
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
      })
      setItems(next)
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the review queue')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { all: 0, image: 0, video: 0, copy: 0 }
    for (const i of items ?? []) {
      if (i.failed) continue
      c.all += 1
      c[i.kind] += 1
    }
    return c
  }, [items])

  const visible = useMemo(
    () => (items ?? []).filter((i) => filter === 'all' || i.kind === filter),
    [items, filter],
  )
  const pending = visible.filter((i) => !i.failed)
  const campaignCount = new Set(pending.map((i) => i.campaign)).size

  async function approveOne(item: Item) {
    const path = item.source === 'asset' ? '/campaign-assets' : '/creatives'
    setBusy(true)
    try {
      await api.post(`${path}/${item.id}/approve`, {})
      await load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not approve that')
    } finally {
      setBusy(false)
    }
  }

  /** The selection, or everything pending when nothing is ticked. */
  function targets(): Item[] {
    if (selected.size === 0) return pending
    return pending.filter((i) => selected.has(i.id))
  }

  async function approveAll() {
    const list = targets()
    setConfirmAll(false)
    setBusy(true)
    let ok = 0
    try {
      // Sequential: a burst of approvals is a burst of `asset.approved` workflow
      // events, and a workflow that publishes should not be handed forty at once.
      for (const item of list) {
        const path = item.source === 'asset' ? '/campaign-assets' : '/creatives'
        try {
          await api.post(`${path}/${item.id}/approve`, {})
          ok += 1
        } catch {
          // Counted by omission; the toast reports the shortfall.
        }
      }
      await load()
      if (ok === list.length) toast.push('success', `${String(ok)} approved`)
      else toast.push('error', `${String(ok)} of ${String(list.length)} approved`)
    } finally {
      setBusy(false)
    }
  }

  /** Redo is the spend on this screen: it asks the provider for a new render. */
  async function redo(item: Item) {
    setConfirmRedo(null)
    setBusy(true)
    try {
      if (item.source === 'asset') {
        await api.post(`/campaign-assets/${item.id}/generate-media`, { variants: 1, force: true })
      } else {
        await api.post(`/creatives/${item.id}/reject`, { reason: 'Redo requested from review' })
      }
      await load()
      toast.push('success', 'Regeneration started')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not start a redo')
    } finally {
      setBusy(false)
    }
  }

  async function drop(item: Item) {
    const path = item.source === 'asset' ? '/campaign-assets' : '/creatives'
    setBusy(true)
    try {
      await api.post(`${path}/${item.id}/reject`, { reason: 'Dropped from review' })
      await load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not drop that')
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Exactly what Approve is about to do, itemised, before it runs. */
  const confirmMessage = useMemo(() => {
    const list = targets()
    const byKind = new Map<Kind, number>()
    for (const i of list) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1)
    const parts = [...byKind.entries()].map(
      ([k, n]) => `${String(n)} ${KIND_LABEL[k].toLowerCase()}`,
    )
    const camps = new Set(list.map((i) => i.campaign))
    return [
      `About to approve ${String(list.length)} ${list.length === 1 ? 'item' : 'items'}: ${parts.join(', ')}.`,
      `Across ${String(camps.size)} ${camps.size === 1 ? 'campaign' : 'campaigns'}: ${[...camps].join(', ')}.`,
      '',
      'Approving generates nothing and spends nothing — it marks each item ready to schedule. You can reopen anything you change your mind about.',
    ].join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selected, filter])

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (items === null) {
    return (
      <div className="row" style={{ gap: 8, padding: 24 }}>
        <Spinner />
        <span className="type-secondary">Loading the queue…</span>
      </div>
    )
  }

  return (
    <FadeIn style={{ maxWidth: 1400 }}>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
        <div>
          <h1 className="brief-title" style={{ maxWidth: 'none', margin: '0 0 6px' }}>
            Review queue
          </h1>
          <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 14 }}>
            {counts.all === 0
              ? 'Nothing is waiting on you.'
              : `${String(counts.all)} ${counts.all === 1 ? 'asset' : 'assets'} across ${String(campaignCount || 1)} ${campaignCount === 1 ? 'campaign' : 'campaigns'}. Nothing publishes until it clears this screen.`}
          </p>
        </div>
        {pending.length > 0 ? (
          <div className="row" style={{ marginLeft: 'auto', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                setSelected(
                  selected.size === pending.length ? new Set() : new Set(pending.map((i) => i.id)),
                )
              }
            >
              {selected.size === pending.length ? 'Clear selection' : 'Select all'}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => setConfirmAll(true)}
            >
              {busy ? <Spinner /> : <Icon name="check" size={14} />}
              Approve {selected.size > 0 ? selected.size : pending.length}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Kind filter ─────────────────────────────────────────────────── */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 9, margin: '22px 0 16px' }}>
        {(['all', 'image', 'video', 'copy'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
          >
            {k === 'all' ? 'All' : KIND_LABEL[k]} {counts[k]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-muted)' }}>
          Oldest first
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Nothing is waiting on you"
          hint="Everything generated has been judged. New work lands here as it finishes rendering."
        />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}
        >
          {visible.map((item) => (
            <div
              key={`${item.source}-${item.id}`}
              className="review-card"
              {...(item.failed ? { 'data-failed': '' } : {})}
              {...(selected.has(item.id) ? { 'data-selected': '' } : {})}
            >
              <div className="review-card__head">
                {item.failed ? (
                  <Icon name="alert-triangle" size={14} />
                ) : (
                  <PlatformIcon platform={item.platform} size={14} />
                )}
                {item.failed ? 'Failed twice' : item.campaign}
                <span className="review-card__age">{ago(item.createdAt)}</span>
              </div>

              <button
                type="button"
                className="review-card__preview"
                aria-pressed={selected.has(item.id)}
                aria-label={`Select ${item.title}`}
                disabled={item.failed}
                onClick={() => toggle(item.id)}
              >
                {item.failed ? (
                  <Icon name="image" size={30} style={{ color: 'var(--text-muted)' }} />
                ) : item.mediaUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.mediaUrl} alt={item.title} loading="lazy" />
                    {item.kind === 'video' ? (
                      <span className="review-card__play">
                        <Icon name="play" size={32} />
                      </span>
                    ) : null}
                  </>
                ) : (
                  <p className="review-card__text">{item.text ?? 'No content'}</p>
                )}
              </button>

              <div className="review-card__body">
                <div className="review-card__title">{item.title}</div>
                <div className="review-card__meta">
                  {item.failed
                    ? `Render failed${item.failureReason ? ` · ${item.failureReason}` : ''}`
                    : item.meta}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {item.failed ? (
                    <>
                      <button
                        type="button"
                        className="btn danger sm"
                        style={{ flex: 1 }}
                        disabled={busy}
                        onClick={() => setConfirmRedo(item)}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busy}
                        onClick={() => void drop(item)}
                      >
                        Drop
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn primary sm"
                        style={{ flex: 1 }}
                        disabled={busy}
                        onClick={() => void approveOne(item)}
                      >
                        Approve
                      </button>
                      {item.kind === 'copy' ? (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busy}
                          onClick={() => router.push('/app/content')}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busy}
                          onClick={() => setConfirmRedo(item)}
                        >
                          Redo
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmAll}
        title={`Approve ${String(targets().length)} items?`}
        message={confirmMessage}
        confirmLabel={`Approve ${String(targets().length)}`}
        onConfirm={() => void approveAll()}
        onCancel={() => setConfirmAll(false)}
      />

      <ConfirmDialog
        open={confirmRedo !== null}
        danger
        title={confirmRedo?.failed ? 'Retry this render?' : 'Redo this asset?'}
        message={
          confirmRedo
            ? [
                `“${confirmRedo.title}” will be generated again.`,
                '',
                confirmRedo.kind === 'video'
                  ? 'This asks the provider for a new video, which spends a video minute from your plan and takes one to three minutes. The current version is replaced and cannot be recovered.'
                  : confirmRedo.source === 'creative'
                    ? 'Re-rendering a template poster costs nothing — no model is involved. The current version is replaced.'
                    : 'This asks the provider for a new image, which spends a generation from your plan. The current version is replaced and cannot be recovered.',
              ].join('\n')
            : ''
        }
        confirmLabel={confirmRedo?.failed ? 'Retry' : 'Redo'}
        onConfirm={() => confirmRedo && void redo(confirmRedo)}
        onCancel={() => setConfirmRedo(null)}
      />
    </FadeIn>
  )
}
