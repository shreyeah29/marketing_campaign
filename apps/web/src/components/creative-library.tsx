'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState } from '@/components/kit'
import { Badge } from '@/components/ui'
import { Stagger, StaggerItem } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * The Creative Library — every AI-generated image/video the system has made,
 * with its approval fate visible. Approved work teaches what to make more of;
 * rejected work teaches what to avoid.
 * ──────────────────────────────────────────────────────────────────────────── */

interface CreativeAsset {
  id: string
  campaignId?: string | null
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
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

function statusTint(s: string): string {
  if (s === 'APPROVED' || s === 'PUBLISHED') return 'ok'
  if (s === 'REJECTED' || s === 'FAILED') return 'danger'
  if (s === 'SCHEDULED' || s === 'PUBLISHING') return 'info'
  return 'warn'
}

export function CreativeLibrary({ type }: { type: 'image' | 'video' }) {
  const [assets, setAssets] = useState<CreativeAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')

  const kind = type === 'image' ? 'IMAGE_PROMPT' : 'VIDEO_PROMPT'

  useEffect(() => {
    api
      .get<{ data: CreativeAsset[] } | CreativeAsset[]>('/campaign-assets')
      .then((r) => setAssets(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load the library'),
      )
  }, [])

  const creatives = useMemo(
    () => (assets ?? []).filter((a) => a.kind === kind && a.mediaUrl),
    [assets, kind],
  )

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!
  const visible = creatives.filter((a) => !active.statuses || active.statuses.includes(a.status))

  const counts = useMemo(() => {
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

  if (creatives.length === 0) {
    return (
      <EmptyState
        icon={type === 'image' ? 'image' : 'video'}
        title={`No ${type}s in the library yet`}
        hint={`Approve a ${type} concept inside a campaign and the generated creative lands here automatically.`}
        action={
          <Link href="/app/marketing/campaigns" className="btn primary">
            Open campaigns
          </Link>
        }
      />
    )
  }

  return (
    <>
      <div className="toolbar" style={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip ${filter === f.id ? 'on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} · {counts.get(f.id) ?? 0}
          </button>
        ))}
      </div>

      <Stagger
        interval={0.04}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {visible.map((a) => (
          <StaggerItem key={a.id} className="card" style={{ padding: 10, overflow: 'hidden' }}>
            {type === 'video' ? (
              <video
                src={a.mediaUrl!}
                controls
                preload="metadata"
                style={{
                  width: '100%',
                  aspectRatio: '16 / 10',
                  objectFit: 'cover',
                  borderRadius: 10,
                  background: '#000',
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.mediaUrl!}
                alt={a.title ?? a.body.slice(0, 60)}
                loading="lazy"
                style={{
                  width: '100%',
                  aspectRatio: '16 / 10',
                  objectFit: 'cover',
                  borderRadius: 10,
                  background: 'var(--bg-subtle)',
                }}
              />
            )}
            <div className="spread" style={{ marginTop: 10, gap: 8 }}>
              <Badge status={statusTint(a.status)}>{a.status}</Badge>
              <span className="dim" style={{ fontSize: 11 }}>
                {a.platform}
              </span>
            </div>
            <p
              className="dim"
              style={{
                fontSize: 12,
                marginTop: 6,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              title={a.body}
            >
              {a.title ?? a.body}
            </p>
          </StaggerItem>
        ))}
      </Stagger>
    </>
  )
}
