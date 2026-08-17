'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'
import { Stagger, StaggerItem } from '@/components/motion'
import { Spinner } from '@/components/ui'

/* ────────────────────────────────────────────────────────────────────────────
 * The Creative Library — every AI-generated image/video the system has made,
 * with its approval fate visible. Approved work teaches what to make more of;
 * rejected work teaches what to avoid.
 *
 * The point of keeping rejected work is reuse in both directions: you come here
 * to find the poster that worked and use it again, and to remember the one that
 * didn't so you don't ask for it twice. So a card is not a thumbnail you look
 * at — it opens, and from there the creative can leave the system (download,
 * link) or come back into it (another render from the same concept).
 * ──────────────────────────────────────────────────────────────────────────── */

interface CreativeAsset {
  id: string
  campaignId?: string | null
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  caption?: string | null
  hashtags?: string[]
  mediaUrl?: string | null
  createdAt?: string
}

const FILTERS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'review', label: 'In review', statuses: ['GENERATED', 'NEEDS_REVIEW', 'DRAFT'] },
  { id: 'approved', label: 'Approved', statuses: ['APPROVED'] },
  { id: 'published', label: 'Published', statuses: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] },
  { id: 'rejected', label: 'Rejected', statuses: ['REJECTED'] },
]

type Medium = 'image' | 'video'

const KIND: Record<Medium, string> = { image: 'IMAGE_PROMPT', video: 'VIDEO_PROMPT' }

/**
 * @param type Pins the library to one medium. Omit it and the gallery shows its
 *   own Posters/Videos tabs — the AI Images and AI Video pages pin it because
 *   they are already about one medium.
 */
export function CreativeLibrary({ type }: { type?: Medium }) {
  const router = useRouter()
  const toast = useToast()
  const [assets, setAssets] = useState<CreativeAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [medium, setMedium] = useState<Medium>(type ?? 'image')
  const [open, setOpen] = useState<CreativeAsset | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get<{ data: CreativeAsset[] } | CreativeAsset[]>('/campaign-assets')
      .then((r) => setAssets(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load the library'),
      )
  }, [])

  useEffect(() => load(), [load])

  // Escape closes the lightbox — the first thing anyone tries.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const shown = type ?? medium

  const counts = useMemo(() => {
    const withMedia = (assets ?? []).filter((a) => a.mediaUrl)
    return {
      image: withMedia.filter((a) => a.kind === KIND.image).length,
      video: withMedia.filter((a) => a.kind === KIND.video).length,
    }
  }, [assets])

  const creatives = useMemo(
    () => (assets ?? []).filter((a) => a.kind === KIND[shown] && a.mediaUrl),
    [assets, shown],
  )

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!
  const visible = creatives.filter((a) => !active.statuses || active.statuses.includes(a.status))

  const filterCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of FILTERS) {
      m.set(
        f.id,
        f.statuses === null
          ? creatives.length
          : creatives.filter((a) => f.statuses!.includes(a.status)).length,
      )
    }
    return m
  }, [creatives])

  function download(asset: CreativeAsset) {
    if (!asset.mediaUrl) return
    const a = document.createElement('a')
    a.href = asset.mediaUrl
    a.download = ''
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  function copyLink(asset: CreativeAsset) {
    if (!asset.mediaUrl) return
    void navigator.clipboard
      .writeText(asset.mediaUrl)
      .then(() => toast.push('success', 'Link copied'))
      .catch(() => toast.push('error', 'Could not copy the link'))
  }

  /**
   * Reuse the *concept*, not the file: duplicate produces a fresh draft carrying
   * the same prompt, caption and hashtags, which then renders new artwork. To
   * reuse the artwork itself, download it or copy its link.
   */
  async function makeAnother(asset: CreativeAsset) {
    setBusy(true)
    try {
      const created = await api.post<{ id?: string; campaignId?: string | null }>(
        `/campaign-assets/${asset.id}/duplicate`,
        {},
      )
      toast.push('success', 'Copied into the campaign as a new concept')
      const campaignId = created?.campaignId ?? asset.campaignId
      if (created?.id && campaignId) {
        router.push(`/app/campaigns/${campaignId}/assets/${created.id}`)
      } else {
        setOpen(null)
        load()
      }
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not duplicate this creative')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <p className="dim" style={{ fontSize: 13 }}>
        {error}
      </p>
    )
  }

  if (assets === null) {
    return (
      <div className="cols-3 grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card skeleton" style={{ height: 180 }} />
        ))}
      </div>
    )
  }

  const mediumTabs =
    type === undefined ? (
      <div className="gallery__mediums" role="tablist" aria-label="Creative type">
        {(
          [
            ['image', 'Posters'],
            ['video', 'Videos'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={medium === id}
            className={`gallery__medium${medium === id ? ' is-on' : ''}`}
            onClick={() => {
              setMedium(id)
              setFilter('all')
            }}
          >
            <Icon name={id === 'video' ? 'video' : 'image'} size={14} />
            {label}
            <span className="gallery__medium-count">{counts[id]}</span>
          </button>
        ))}
      </div>
    ) : null

  if (creatives.length === 0) {
    return (
      <>
        {mediumTabs}
        <EmptyState
          icon={shown === 'image' ? 'image' : 'video'}
          title={
            shown === 'image' ? 'No posters in the library yet' : 'No videos in the library yet'
          }
          hint={
            shown === 'image'
              ? 'Posters render themselves inside a campaign and land here the moment they exist — approved or not.'
              : 'Render a video concept inside a campaign and it lands here.'
          }
          action={
            <Link href="/app/create" className="btn primary">
              Open campaigns
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      {mediumTabs}

      <div className="toolbar" style={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip ${filter === f.id ? 'on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} · {filterCounts.get(f.id) ?? 0}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="filter"
          title={`Nothing ${active.label.toLowerCase()}`}
          hint="Try another filter — the counts above show where everything sits."
        />
      ) : (
        <Stagger
          interval={0.04}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((a) => (
            <StaggerItem key={a.id}>
              <button type="button" className="gallery__card" onClick={() => setOpen(a)}>
                {shown === 'video' ? (
                  <video
                    src={a.mediaUrl!}
                    preload="metadata"
                    className="gallery__thumb"
                    style={{ background: '#000' }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.mediaUrl!}
                    alt={a.title ?? a.body.slice(0, 60)}
                    loading="lazy"
                    className="gallery__thumb"
                  />
                )}
                <div className="spread" style={{ marginTop: 10, gap: 8 }}>
                  <StatusPill status={toStatus(a.status)} />
                  <span className="dim" style={{ fontSize: 11 }}>
                    {a.platform}
                  </span>
                </div>
                <p className="gallery__card-title" title={a.body}>
                  {a.title ?? a.body}
                </p>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {open ? (
        <div
          className="gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={open.title ?? 'Creative'}
          onClick={() => setOpen(null)}
        >
          {/* Stop propagation so clicking the panel itself does not dismiss it —
              only the backdrop does. */}
          <div className="gallery__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn gallery__close"
              aria-label="Close"
              onClick={() => setOpen(null)}
            >
              <Icon name="x" size={16} />
            </button>

            <div className="gallery__panel-media">
              {open.kind === KIND.video ? (
                <video src={open.mediaUrl!} controls className="gallery__full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.mediaUrl!} alt={open.title ?? ''} className="gallery__full" />
              )}
            </div>

            <div className="gallery__panel-side">
              <StatusPill status={toStatus(open.status)} />
              <h2 className="type-section" style={{ margin: '10px 0 0' }}>
                {open.title ?? 'Untitled creative'}
              </h2>
              <p
                className="type-caption"
                style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}
              >
                {open.platform}
              </p>

              {open.caption ? (
                <>
                  <p className="type-label" style={{ marginTop: 20 }}>
                    Caption
                  </p>
                  <p className="type-body">{open.caption}</p>
                </>
              ) : null}

              {open.hashtags && open.hashtags.length > 0 ? (
                <>
                  <p className="type-label" style={{ marginTop: 20 }}>
                    Hashtags
                  </p>
                  <ul className="cstudio__tags">
                    {open.hashtags.map((h) => (
                      <li key={h} className="cstudio__tag">
                        #{h.replace(/^#/, '')}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="gallery__actions">
                <button type="button" className="btn" onClick={() => download(open)}>
                  <Icon name="download" size={14} /> Download
                </button>
                <button type="button" className="btn" onClick={() => copyLink(open)}>
                  <Icon name="copy" size={14} /> Copy link
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void makeAnother(open)}
                >
                  {busy ? <Spinner /> : <Icon name="refresh" size={14} />}
                  Make another like this
                </button>
                {open.campaignId ? (
                  <Link
                    href={`/app/campaigns/${open.campaignId}/assets/${open.id}`}
                    className="btn ghost"
                  >
                    <Icon name="external-link" size={14} /> Open in campaign
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
