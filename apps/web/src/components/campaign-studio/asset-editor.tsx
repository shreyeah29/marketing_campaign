'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip, kindLabel, StatusPill, toStatus } from '@/components/status'

import type { Asset } from './types'

// ── Asset editor panel ───────────────────────────────────────────────────────
export function AssetEditor({
  asset,
  onBack,
  onChanged,
}: {
  asset: Asset
  onBack: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [body, setBody] = useState(asset.body)
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [cta, setCta] = useState(asset.cta ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const status = asset.status

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

  async function regenerate() {
    setBusy('Regenerate')
    try {
      const res = await api.post<{ body?: string }>(`/campaign-assets/${asset.id}/regenerate`, {})
      if (res.body) setBody(res.body)
      toast.push('success', 'Regenerated')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(null)
    }
  }

  const isConcept = asset.kind === 'IMAGE_PROMPT' || asset.kind === 'VIDEO_PROMPT'
  const canApprove = ['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT'].includes(status)
  const canPublish = status === 'APPROVED'
  const [publishOpen, setPublishOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  /**
   * Gate 1 for concepts: approving an image/video *concept* immediately turns it
   * into a real creative (Runway), which comes back as NEEDS_REVIEW — Gate 2.
   * For everything else, approve is the final approval.
   */
  async function approve() {
    if (isConcept && !asset.mediaUrl) {
      setBusy('Generate')
      try {
        await api.post(`/campaign-assets/${asset.id}/approve`, {})
        // Images come back as 2 variants so the reviewer picks a winner.
        await api.post(
          `/campaign-assets/${asset.id}/generate-media`,
          asset.kind === 'IMAGE_PROMPT' ? { variants: 2 } : {},
        )
        toast.push('success', 'Creative generated — give it a final look')
        onChanged()
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'Generation failed')
      } finally {
        setBusy(null)
      }
      return
    }
    await act('Approve', () => api.post(`/campaign-assets/${asset.id}/approve`, {}))
  }

  return (
    <div style={{ animation: 'rise 0.2s ease both' }}>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 14 }}>
        <Icon name="arrow-left" size={14} /> Back
      </button>

      <div className="card">
        <div className="spread" style={{ marginBottom: 16, alignItems: 'center' }}>
          <div className="row" style={{ gap: 10 }}>
            <PlatformIcon platform={asset.platform} size={22} />
            <div>
              <div style={{ fontWeight: 650, fontSize: 15 }}>
                {asset.platform} · {kindLabel(asset.kind)}
              </div>
              {asset.scheduledFor ? (
                <div className="dim" style={{ fontSize: 12 }}>
                  Scheduled · {new Date(asset.scheduledFor).toLocaleString()}
                </div>
              ) : null}
            </div>
          </div>
          <StatusPill status={toStatus(status)} />
        </div>

        <Field label="Body">
          <textarea
            className="input"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field label="Caption">
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <Field label="Call to action">
          <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
        </Field>

        {asset.hashtags && asset.hashtags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {asset.hashtags.map((h) => (
              <Chip key={h}>#{h.replace(/^#/, '')}</Chip>
            ))}
          </div>
        ) : null}

        {/* A/B variants: the reviewer promotes the winner before final approval. */}
        {asset.kind === 'IMAGE_PROMPT' &&
        (asset.aiVersions?.variants?.length ?? 0) > 1 &&
        status === 'NEEDS_REVIEW' ? (
          <div style={{ marginBottom: 12 }}>
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              Pick the winner — the selected variant becomes the final creative:
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {asset.aiVersions!.variants!.map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    void act('Select variant', () =>
                      api.post(`/campaign-assets/${asset.id}/choose-variant`, { url: v }),
                    )
                  }
                  disabled={busy !== null}
                  style={{
                    padding: 0,
                    border:
                      v === asset.mediaUrl
                        ? '3px solid var(--color-primary)'
                        : '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                  aria-label={v === asset.mediaUrl ? 'Selected variant' : 'Choose this variant'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v}
                    alt="Variant"
                    style={{ width: 132, height: 92, objectFit: 'cover', display: 'block' }}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* The creative itself — once generated it sits beside its copy. */}
        {asset.mediaUrl ? (
          <div style={{ marginBottom: 16 }}>
            {asset.kind === 'VIDEO_PROMPT' ? (
              <video
                src={asset.mediaUrl}
                controls
                style={{
                  width: '100%',
                  maxHeight: 420,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: '#000',
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.mediaUrl}
                alt={asset.title ?? 'Generated creative'}
                style={{
                  width: '100%',
                  maxHeight: 420,
                  objectFit: 'contain',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)',
                }}
              />
            )}
          </div>
        ) : isConcept ? (
          <div
            style={{
              border: '1px dashed var(--border-strong)',
              borderRadius: 'var(--radius)',
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              marginBottom: 16,
              background: 'var(--bg-subtle)',
            }}
          >
            <Icon name={asset.kind === 'VIDEO_PROMPT' ? 'video' : 'image'} size={22} />
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {busy === 'Generate'
                ? 'Generating your creative — this takes a few seconds…'
                : 'Approve this concept and the creative is generated for you in seconds.'}
            </div>
          </div>
        ) : null}

        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void act(
                'Save',
                () => api.patch(`/campaign-assets/${asset.id}`, { body, caption, cta }),
                false,
              )
            }
          >
            {busy === 'Save' ? (
              <Spinner />
            ) : (
              <>
                <Icon name="check" size={14} /> Save
              </>
            )}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void regenerate()}>
            {busy === 'Regenerate' ? (
              <Spinner />
            ) : (
              <>
                <Icon name="refresh" size={14} /> Regenerate
              </>
            )}
          </button>
          {canApprove ? (
            <button className="btn primary" disabled={busy !== null} onClick={() => void approve()}>
              {busy === 'Generate' ? (
                <>
                  <Spinner /> Generating…
                </>
              ) : (
                <>
                  <Icon name={isConcept && !asset.mediaUrl ? 'sparkles' : 'check'} size={14} />
                  {isConcept && !asset.mediaUrl ? 'Approve & generate' : 'Approve'}
                </>
              )}
            </button>
          ) : null}
          {canPublish ? (
            <button
              className="btn primary"
              disabled={busy !== null}
              onClick={() => setPublishOpen(true)}
            >
              <Icon name="send" size={14} /> Publish
            </button>
          ) : null}
          <button
            className="btn ghost sm"
            disabled={busy !== null}
            onClick={() => setRejectOpen(true)}
          >
            <Icon name="x" size={14} /> Reject
          </button>
          <button
            className="btn ghost sm"
            disabled={busy !== null}
            onClick={() =>
              void act('Duplicate', () => api.post(`/campaign-assets/${asset.id}/duplicate`, {}))
            }
          >
            <Icon name="copy" size={14} /> Duplicate
          </button>
          <div className="grow" />
          <button className="btn ghost sm" onClick={() => setConfirmDel(true)}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        title="Delete asset?"
        message="This removes the asset from the campaign."
        confirmLabel="Delete"
        danger
        onConfirm={() => void act('Delete', () => api.del(`/campaign-assets/${asset.id}`))}
        onCancel={() => setConfirmDel(false)}
      />

      {publishOpen ? (
        <PublishDialog
          assetId={asset.id}
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            setPublishOpen(false)
            toast.push('success', 'Queued for publishing')
            onChanged()
          }}
        />
      ) : null}

      {rejectOpen ? (
        <RejectDialog
          onClose={() => setRejectOpen(false)}
          onReject={(reason) => {
            setRejectOpen(false)
            void act('Reject', () =>
              api.post(`/campaign-assets/${asset.id}/reject`, reason ? { reason } : {}),
            )
          }}
        />
      ) : null}
    </div>
  )
}

// ── Publish dialog — where an approved creative meets the world ───────────────
export function PublishDialog({
  assetId,
  onClose,
  onPublished,
}: {
  assetId: string
  onClose: () => void
  onPublished: () => void
}) {
  const toast = useToast()
  const [accounts, setAccounts] = useState<
    { id: string; platform: string; handle: string | null; displayName: string | null }[] | null
  >(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [when, setWhen] = useState('') // empty = post now
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<
        {
          id: string
          platform: string
          handle: string | null
          displayName: string | null
          status: string
        }[]
      >('/social/accounts')
      .then((rows) => setAccounts(rows.filter((a) => a.status === 'CONNECTED')))
      .catch(() => setAccounts([]))
  }, [])

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function publish() {
    if (chosen.size === 0) return
    setBusy(true)
    try {
      await api.post(`/campaign-assets/${assetId}/publish`, {
        accountIds: [...chosen],
        ...(when ? { scheduledAt: new Date(when).toISOString() } : {}),
      })
      onPublished()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Publish failed')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Publish">
        <div className="head">
          <h3>Publish this creative</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          {accounts === null ? (
            <Spinner />
          ) : accounts.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No connected accounts yet. Connect Instagram, Facebook or another channel under
              Marketing → Social first.
            </p>
          ) : (
            <>
              <div className="field">
                <label>Where should it go?</label>
                <div className="stack" style={{ gap: 6 }}>
                  {accounts.map((a) => (
                    <label
                      key={a.id}
                      className="row"
                      style={{ gap: 10, cursor: 'pointer', padding: '6px 4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(a.id)}
                        onChange={() => toggle(a.id)}
                        style={{ margin: 0 }}
                      />
                      <PlatformIcon platform={a.platform} size={16} />
                      <span style={{ fontSize: 13 }}>
                        {a.displayName ?? a.handle ?? a.platform}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>When?</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <span className="hint">Leave empty to post now.</span>
              </div>
            </>
          )}
        </div>
        <div className="foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || chosen.size === 0}
            onClick={() => void publish()}
          >
            {busy ? <Spinner /> : when ? 'Schedule' : 'Post now'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Reject dialog — the reason becomes standing guidance for future AI work ───
const REJECT_REASONS = ['Off-brand', 'Wrong style', 'Weak copy', 'Wrong colors', 'Not relevant']

function RejectDialog({
  onClose,
  onReject,
}: {
  onClose: () => void
  onReject: (reason: string | null) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

  const reason = [picked, custom.trim()].filter(Boolean).join(' — ') || null

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Reject asset">
        <div className="head">
          <h3>Why reject it?</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>
            The AI learns from this — future content avoids what you reject.
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                className={`chip ${picked === r ? 'on' : ''}`}
                onClick={() => setPicked(picked === r ? null : r)}
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="Anything more specific?">
            <input
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Too corporate — we speak casually"
            />
          </Field>
        </div>
        <div className="foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={() => onReject(reason)}>
            Reject
          </button>
        </div>
      </div>
    </>
  )
}
