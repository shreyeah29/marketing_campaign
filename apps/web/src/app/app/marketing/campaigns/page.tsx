'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

interface Asset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  caption?: string | null
  hashtags?: string[]
  cta?: string | null
  scheduledFor?: string | null
  comments?: { id: string; body: string; event?: string | null; createdAt: string }[]
}

const COLUMNS: { key: string; label: string; tint: string }[] = [
  { key: 'GENERATED', label: 'Generated', tint: 'info' },
  { key: 'NEEDS_REVIEW', label: 'Needs review', tint: 'warn' },
  { key: 'APPROVED', label: 'Approved', tint: 'ok' },
  { key: 'SCHEDULED', label: 'Scheduled', tint: 'info' },
  { key: 'PUBLISHED', label: 'Published', tint: 'ok' },
  { key: 'REJECTED', label: 'Rejected', tint: 'danger' },
]

const PLATFORM_ICON: Record<string, string> = {
  INSTAGRAM: '📸', FACEBOOK: '👍', LINKEDIN: '💼', X: '𝕏', GOOGLE: '🔍', YOUTUBE: '▶️', TIKTOK: '🎵', GENERIC: '✳️',
}

export default function CampaignsReviewPage() {
  const toast = useToast()
  const [columns, setColumns] = useState<Record<string, Asset[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [active, setActive] = useState<Asset | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<{ columns: Record<string, Asset[]> }>('/campaign-assets/board')
      .then((r) => setColumns(r.columns))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [])
  useEffect(load, [load])

  async function generate() {
    if (brief.trim().length < 4) return
    setGenerating(true)
    try {
      const res = await api.post<{ assetCount: number }>('/campaign-assets/generate', { brief })
      toast.push('success', `Generated ${res.assetCount} assets — review them below`)
      setBrief('')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const total = columns ? Object.values(columns).reduce((n, c) => n + c.length, 0) : 0

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Generate campaigns with AI, then review, approve and schedule every asset"
      />

      {/* Generate bar */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="toolbar">
          <input
            className="input grow"
            placeholder="Describe your campaign — e.g. “Launch our new eco-friendly water bottle”"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void generate()}
            style={{ minWidth: 320 }}
          />
          <button className="btn primary" onClick={() => void generate()} disabled={generating || brief.trim().length < 4}>
            {generating ? <Spinner /> : <><Icon name="sparkles" size={15} /> Generate campaign</>}
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !columns ? (
        <TableSkeleton cols={6} />
      ) : total === 0 ? (
        <EmptyState
          icon="megaphone"
          title="No campaign assets yet"
          hint="Describe a campaign above and AI will draft posts, captions and ad copy for you to review."
        />
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {COLUMNS.map((col) => {
            const items = columns[col.key] ?? []
            return (
              <div key={col.key} style={{ minWidth: 260, flex: '0 0 260px' }}>
                <div className="spread" style={{ marginBottom: 8, padding: '0 2px' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{col.label}</span>
                  <Badge status={col.tint}>{items.length}</Badge>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {items.map((a) => (
                    <button
                      key={a.id}
                      className="card"
                      style={{ textAlign: 'left', cursor: 'pointer', padding: 12 }}
                      onClick={() => setActive(a)}
                    >
                      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                        <span>{PLATFORM_ICON[a.platform] ?? '✳️'}</span>
                        <span className="dim" style={{ fontSize: 11 }}>
                          {a.platform} · {a.kind}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                        {a.body.length > 120 ? `${a.body.slice(0, 120)}…` : a.body || '(empty)'}
                      </div>
                    </button>
                  ))}
                  {items.length === 0 ? (
                    <div className="dim" style={{ fontSize: 12, padding: 8, textAlign: 'center' }}>
                      —
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active ? (
        <AssetDrawer
          asset={active}
          onClose={() => setActive(null)}
          onChanged={() => {
            setActive(null)
            load()
          }}
        />
      ) : null}
    </>
  )
}

function AssetDrawer({ asset, onClose, onChanged }: { asset: Asset; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [full, setFull] = useState<Asset | null>(null)
  const [body, setBody] = useState(asset.body)
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [cta, setCta] = useState(asset.cta ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    api.get<Asset>(`/campaign-assets/${asset.id}`).then(setFull).catch(() => setFull(asset))
  }, [asset])

  async function act(label: string, fn: () => Promise<unknown>, close = true) {
    setBusy(label)
    try {
      await fn()
      toast.push('success', `${label} done`)
      if (close) onChanged()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  const status = full?.status ?? asset.status
  const canApprove = ['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT'].includes(status)
  const canSchedule = status === 'APPROVED' || status === 'SCHEDULED'

  return (
    <Drawer
      open
      title={`${asset.platform} · ${asset.kind}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => void act('Save', () => api.patch(`/campaign-assets/${asset.id}`, { body, caption, cta }), false)}
          >
            {busy === 'Save' ? <Spinner /> : 'Save edits'}
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge status={status === 'APPROVED' || status === 'PUBLISHED' ? 'ok' : status === 'REJECTED' ? 'danger' : 'info'}>
          {status}
        </Badge>
        {full?.scheduledFor ? <span className="dim" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={12} /> {new Date(full.scheduledFor).toLocaleString()}</span> : null}
      </div>

      <Field label="Body">
        <textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Caption">
        <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </Field>
      <Field label="Call to action">
        <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
      </Field>
      {full?.hashtags && full.hashtags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {full.hashtags.map((h) => (
            <span key={h} className="badge">#{h.replace(/^#/, '')}</span>
          ))}
        </div>
      ) : null}

      {/* Lifecycle actions */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {canApprove ? (
          <button className="btn primary sm" disabled={busy !== null} onClick={() => void act('Approve', () => api.post(`/campaign-assets/${asset.id}/approve`))}>
            <Icon name="check" size={15} /> Approve
          </button>
        ) : null}
        <button className="btn danger sm" disabled={busy !== null} onClick={() => void act('Reject', () => api.post(`/campaign-assets/${asset.id}/reject`, {}))}>
          <Icon name="x" size={15} /> Reject
        </button>
        {canSchedule ? (
          <button
            className="btn sm"
            disabled={busy !== null}
            onClick={() => {
              const when = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
              void act('Schedule', () => api.post(`/campaign-assets/${asset.id}/schedule`, { scheduledFor: when }))
            }}
          >
            <Icon name="clock" size={15} /> Schedule (24h)
          </button>
        ) : null}
        <button className="btn sm" disabled={busy !== null} onClick={() => void act('Regenerate', () => api.post(`/campaign-assets/${asset.id}/regenerate`, {}))}>
          {busy === 'Regenerate' ? <Spinner /> : <><Icon name="refresh" size={15} /> Regenerate</>}
        </button>
        <button className="btn ghost sm" disabled={busy !== null} onClick={() => void act('Duplicate', () => api.post(`/campaign-assets/${asset.id}/duplicate`, {}))}>
          <Icon name="copy" size={15} /> Duplicate
        </button>
        <button className="btn ghost sm" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>

      {/* Approval timeline */}
      <h3 style={{ fontSize: 13, margin: '8px 0' }}>Timeline</h3>
      <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
        {(full?.comments ?? []).map((c) => (
          <div key={c.id} className="card" style={{ padding: '8px 10px' }}>
            <div className="dim" style={{ fontSize: 11 }}>
              {c.event ? `[${c.event}] ` : ''}
              {new Date(c.createdAt).toLocaleString()}
            </div>
            <div style={{ fontSize: 13 }}>{c.body}</div>
          </div>
        ))}
        {(full?.comments ?? []).length === 0 ? <div className="dim" style={{ fontSize: 12 }}>No activity yet.</div> : null}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
        <button
          className="btn sm"
          disabled={comment.trim().length === 0}
          onClick={() =>
            void act('Comment', async () => {
              await api.post(`/campaign-assets/${asset.id}/comments`, { body: comment })
              setComment('')
              const fresh = await api.get<Asset>(`/campaign-assets/${asset.id}`)
              setFull(fresh)
            }, false)
          }
        >
          Post
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete asset?"
        message="This removes the asset from the campaign."
        confirmLabel="Delete"
        danger
        onConfirm={() => void act('Delete', () => api.del(`/campaign-assets/${asset.id}`))}
        onCancel={() => setConfirmDelete(false)}
      />
    </Drawer>
  )
}
