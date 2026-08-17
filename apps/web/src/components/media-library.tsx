'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * Images & video — the approved shelf, reusable anywhere.
 *
 * Approved work only. Anything generated and not yet judged belongs to the
 * review queue; this screen answers "what may we publish", and a grid that mixed
 * the two could not answer it. Approval is one direction — scheduled and
 * published count, so the shelf does not shrink as work succeeds.
 *
 * Two real sources, and no third invented one:
 *
 *   · campaign assets of kind IMAGE_PROMPT / VIDEO_PROMPT, where `body` is the
 *     generation prompt itself — the actual string sent to the model
 *   · creatives, the template-rendered posters
 *
 * The distinction matters in the detail rail. A campaign asset has a prompt
 * because a model made it. A template poster has none, because no model was
 * involved — the layout and the product photograph made it. The rail says that
 * rather than paraphrasing something into the gap: being able to see exactly
 * what produced an image is half the value of a library, and a plausible
 * summary of a prompt is worse than admitting there wasn't one.
 *
 * Video tiles render the video element itself with `preload="metadata"`, so the
 * browser paints the first frame. That is a real poster frame from the real
 * file — no thumbnail pipeline, no black rectangles, and nothing that can drift
 * out of sync with the video it represents.
 */

/**
 * The statuses that mean a person said yes.
 *
 * Everything downstream of approval counts too: a scheduled or published asset
 * was approved to get there, and dropping it would make the library shrink as
 * work succeeds.
 */
const APPROVED = new Set(['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'])

type Medium = 'image' | 'video' | 'voice'
type Tab = 'all' | Medium

interface Item {
  id: string
  source: 'asset' | 'creative'
  medium: Medium
  title: string
  url: string
  /** The real prompt, or null when nothing generated this from one. */
  prompt: string | null
  campaign: string | null
  status: string
  /** From the creative record; images and video measure their own. */
  aspectRatio: string | null
  tags: string[]
  createdAt: string | null
}

interface RawAsset {
  id: string
  kind: string
  status: string
  title?: string | null
  body: string
  mediaUrl?: string | null
  hashtags?: string[]
  campaignId?: string | null
  createdAt?: string | null
}

interface RawCreative {
  id: string
  status: string
  renderedUrl: string | null
  templateSlug: string
  aspectRatio: string
  createdAt?: string | null
  product: { name: string; brand: string | null } | null
  campaign?: { name: string } | null
}

const TAB_LABEL: Record<Tab, string> = {
  all: 'All',
  image: 'Images',
  video: 'Video',
  voice: 'Voice',
}

function unwrap<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

/** Reduce measured pixels to the nearest common ratio, or null if it is none of them. */
function ratioFromPixels(w: number, h: number): string | null {
  if (!w || !h) return null
  const known: [string, number][] = [
    ['1:1', 1],
    ['4:5', 0.8],
    ['9:16', 0.5625],
    ['16:9', 1.7778],
    ['3:4', 0.75],
  ]
  const actual = w / h
  for (const [label, value] of known) {
    // 2% tolerance: a 1080×1349 export is 4:5 in every sense that matters.
    if (Math.abs(actual - value) < value * 0.02) return label
  }
  return null
}

function seconds(total: number): string {
  if (!Number.isFinite(total)) return ''
  const m = Math.floor(total / 60)
  const s = Math.round(total % 60)
  return `${String(m)}:${String(s).padStart(2, '0')}`
}

export function MediaLibrary() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [ratio, setRatio] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /** Ratios and durations the browser measured from the files themselves. */
  const [measured, setMeasured] = useState<Record<string, { ratio?: string; duration?: string }>>(
    {},
  )

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
          if (a.kind !== 'IMAGE_PROMPT' && a.kind !== 'VIDEO_PROMPT') continue
          // Nothing to show in a library without the media itself.
          if (!a.mediaUrl) continue
          // Approved work only. This used to show every generation at any status,
          // which put rejected artwork and half-judged drafts in the same grid as
          // the finished set — so the library could not be used as the answer to
          // "what may we publish". Unapproved work lives in the review queue,
          // which is where the decision is made.
          if (!APPROVED.has(a.status)) continue
          next.push({
            id: `asset-${a.id}`,
            source: 'asset',
            medium: a.kind === 'VIDEO_PROMPT' ? 'video' : 'image',
            title: a.title?.trim() || 'Untitled',
            url: a.mediaUrl,
            // `body` is the prompt that was sent to the model, verbatim.
            prompt: a.body.trim() || null,
            campaign: (a.campaignId ? names.get(a.campaignId) : null) ?? null,
            status: a.status,
            aspectRatio: null,
            tags: a.hashtags ?? [],
            createdAt: a.createdAt ?? null,
          })
        }
      }

      if (creativesRes.status === 'fulfilled') {
        for (const c of creativesRes.value.data ?? []) {
          if (!c.renderedUrl) continue
          if (!APPROVED.has(c.status)) continue
          next.push({
            id: `creative-${c.id}`,
            source: 'creative',
            medium: 'image',
            title: c.product?.name ?? 'Poster',
            url: c.renderedUrl,
            // Deliberately null. A template poster is composed, not generated —
            // there was no prompt, and inventing a description of one would be
            // the exact paraphrase this rail exists to avoid.
            prompt: null,
            campaign: c.campaign?.name ?? null,
            status: c.status,
            aspectRatio: c.aspectRatio,
            tags: [c.templateSlug],
            createdAt: c.createdAt ?? null,
          })
        }
      }

      next.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      setItems(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the library')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { all: 0, image: 0, video: 0, voice: 0 }
    for (const i of items ?? []) {
      c.all += 1
      c[i.medium] += 1
    }
    return c
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((i) => {
      if (tab !== 'all' && i.medium !== tab) return false
      if (ratio) {
        const known = i.aspectRatio ?? measured[i.id]?.ratio ?? null
        if (known !== ratio) return false
      }
      if (!q) return true
      return (
        i.title.toLowerCase().includes(q) ||
        (i.prompt ?? '').toLowerCase().includes(q) ||
        (i.campaign ?? '').toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [items, tab, query, ratio, measured])

  const selected = useMemo(
    () => visible.find((i) => i.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  )

  function note(id: string, patch: { ratio?: string; duration?: string }) {
    setMeasured((m) => ({ ...m, [id]: { ...m[id], ...patch } }))
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (items === null) {
    return (
      <div className="row" style={{ gap: 8, padding: 24 }}>
        <Spinner />
        <span className="type-secondary">Loading the library…</span>
      </div>
    )
  }

  return (
    <FadeIn style={{ maxWidth: 1460 }}>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
        <div>
          <h1 className="brief-title" style={{ maxWidth: 'none', margin: '0 0 6px' }}>
            Images &amp; video
          </h1>
          <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 14 }}>
            {counts.all === 0
              ? 'Nothing approved yet. Approve work in the review queue and it lands here.'
              : `Approved and ready to use — ${String(counts.image)} ${counts.image === 1 ? 'image' : 'images'}, ${String(counts.video)} video. Reusable in any campaign.`}
          </p>
        </div>
        <div className="row" style={{ marginLeft: 'auto', flexWrap: 'wrap', gap: 8 }}>
          <Link href="/app/products" className="btn">
            <Icon name="plus" size={14} /> Upload a product
          </Link>
          <Link href="/app/creatives" className="btn primary">
            <Icon name="sparkles" size={14} /> Generate
          </Link>
        </div>
      </div>

      {/* ── Tabs, search, ratio ──────────────────────────────────────────── */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 9, margin: '22px 0 16px' }}>
        {(['all', 'image', 'video', 'voice'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="chip"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]} {counts[t]}
          </button>
        ))}
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by prompt, product, campaign"
          aria-label="Search the library"
          style={{ flex: '1 1 200px', maxWidth: 280 }}
        />
        {(['4:5', '9:16', '1:1'] as const).map((r) => (
          <button
            key={r}
            type="button"
            className="chip sm"
            aria-pressed={ratio === r}
            onClick={() => setRatio(ratio === r ? null : r)}
          >
            {r}
          </button>
        ))}
      </div>

      {tab === 'voice' ? (
        <EmptyState
          icon="mic"
          title="Voiceovers are not stored yet"
          hint="Voice generation returns audio to the page that asked for it and nothing keeps a copy, so there is no library to show. Generate one from AI Studio ▸ Voice; saving them here needs the audio to be persisted first."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="image"
          title={counts.all === 0 ? 'Nothing approved yet' : 'Nothing matches those filters'}
          hint={
            counts.all === 0
              ? 'This shelf holds approved work only. Anything generated and not yet judged is in the review queue.'
              : 'Clear the search or the aspect filter to see everything again.'
          }
        />
      ) : (
        <div className="lib-layout">
          <div className="lib-grid">
            {visible.map((item) => {
              const shownRatio = item.aspectRatio ?? measured[item.id]?.ratio ?? null
              const duration = measured[item.id]?.duration
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`lib-tile${item.id === selected?.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="lib-tile__frame">
                    {/* No `crossOrigin` on stored media, deliberately.

                      The storage bucket answers `Access-Control-Allow-Origin: *`.
                      A wildcard and `credentials: include` are mutually exclusive
                      by spec, so asking for credentials made the browser refuse
                      every image on this page while the bucket was public and the
                      files were present. Only the API-origin product preview needs
                      credentials; a bucket URL must never send them. */}
                    {item.medium === 'video' ? (
                      /* The video element is its own poster frame: `metadata`
                         makes the browser paint frame one without downloading
                         the whole file. A real frame from the real video, so it
                         can never disagree with what plays. */
                      <video
                        src={item.url}
                        preload="metadata"
                        muted
                        playsInline
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget
                          note(item.id, {
                            duration: seconds(v.duration),
                            ...(ratioFromPixels(v.videoWidth, v.videoHeight)
                              ? { ratio: ratioFromPixels(v.videoWidth, v.videoHeight) as string }
                              : {}),
                          })
                        }}
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.url}
                        alt={item.title}
                        loading="lazy"
                        onLoad={(e) => {
                          const r = ratioFromPixels(
                            e.currentTarget.naturalWidth,
                            e.currentTarget.naturalHeight,
                          )
                          if (r) note(item.id, { ratio: r })
                        }}
                      />
                    )}
                    <span className="lib-tile__badge">
                      {item.medium === 'video' ? 'VID' : 'IMG'}
                      {shownRatio ? ` ${shownRatio}` : ''}
                    </span>
                    {item.medium === 'video' ? (
                      <>
                        <span className="lib-tile__play">
                          <Icon name="play" size={30} />
                        </span>
                        {duration ? <span className="lib-tile__time">{duration}</span> : null}
                      </>
                    ) : null}
                  </span>
                  <span className="lib-tile__title">{item.title}</span>
                  <span className="lib-tile__meta">
                    {item.campaign ? `${item.campaign} · ` : ''}
                    {item.status.toLowerCase()}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Detail rail ───────────────────────────────────────────────── */}
          {selected ? (
            <aside className="lib-rail">
              <div className="lib-rail__preview">
                {selected.medium === 'video' ? (
                  <video src={selected.url} controls preload="metadata" playsInline />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={selected.url} alt={selected.title} />
                )}
              </div>
              <div style={{ padding: 14 }}>
                <div className="panel-head__title">{selected.title}</div>
                <div className="lib-rail__meta">
                  {selected.medium === 'video' ? 'Video' : 'Image'}
                  {(selected.aspectRatio ?? measured[selected.id]?.ratio)
                    ? ` · ${selected.aspectRatio ?? measured[selected.id]?.ratio}`
                    : ''}
                  {measured[selected.id]?.duration ? ` · ${measured[selected.id]?.duration}` : ''}
                  {` · ${selected.status.toLowerCase()}`}
                </div>

                <div className="field-label" style={{ marginTop: 12 }}>
                  PROMPT
                </div>
                {selected.prompt ? (
                  /* The stored string, verbatim and unabridged. Seeing exactly
                     what produced an image is the point; a tidied version is a
                     different prompt. */
                  <p className="lib-rail__prompt">{selected.prompt}</p>
                ) : (
                  <p className="lib-rail__prompt is-absent">
                    {selected.source === 'creative'
                      ? 'No prompt — this poster was composed from a template and your product photograph, with no model involved.'
                      : 'No prompt was recorded for this asset.'}
                  </p>
                )}

                {selected.tags.length > 0 ? (
                  <>
                    <div className="field-label">TAGS</div>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {selected.tags.map((t) => (
                        <span key={t} className="chip sm" style={{ cursor: 'default' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}

                <Link
                  href={
                    selected.source === 'creative'
                      ? '/app/creatives'
                      : '/app/creatives?status=needs_review'
                  }
                  className="rail-action"
                  data-primary=""
                  style={{ justifyContent: 'center' }}
                >
                  Use in a campaign
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </FadeIn>
  )
}
