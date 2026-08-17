'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, EmptyState, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip, kindLabel, StatusPill, toStatus } from '@/components/status'

import { pushAssetVersion, readAssetVersions, type AssetVersion } from './asset-versions'
import { approveCampaignAsset } from './approve-asset'
import type { Asset } from './types'

type DrawerTab = 'content' | 'targeting' | 'comments' | 'history'

/**
 * Asset editor — page or 480px drawer (brief Part 3 §9).
 * Preserves two-gate approval, A/B variants, reject chips, and publish.
 * History is browser-local so regenerate is not lossy in the UI.
 */
export function AssetEditor({
  asset,
  onBack,
  onChanged,
  variant = 'page',
}: {
  asset: Asset
  onBack: () => void
  onChanged: () => void
  variant?: 'page' | 'drawer'
}) {
  const toast = useToast()
  const [body, setBody] = useState(asset.body)
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [cta, setCta] = useState(asset.cta ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tab, setTab] = useState<DrawerTab>('content')
  const [versions, setVersions] = useState<AssetVersion[]>(() => readAssetVersions(asset.id))
  const [regenNote, setRegenNote] = useState('')
  const status = asset.status

  useEffect(() => {
    setBody(asset.body)
    setCaption(asset.caption ?? '')
    setCta(asset.cta ?? '')
    setVersions(readAssetVersions(asset.id))
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

  function snapshot(note?: string) {
    const next = pushAssetVersion(asset.id, {
      body,
      caption,
      cta,
      ...(note ? { note } : {}),
    })
    setVersions(next)
  }

  async function regenerate() {
    setBusy('Regenerate')
    try {
      snapshot(regenNote.trim() || 'Before regenerate')
      const res = await api.post<{ body?: string }>(`/campaign-assets/${asset.id}/regenerate`, {})
      if (res.body) setBody(res.body)
      setRegenNote('')
      toast.push('success', 'Regenerated — previous copy is in History')
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
  const [changesOpen, setChangesOpen] = useState(false)

  /**
   * Gate 1 for concepts: approving an image/video *concept* immediately turns it
   * into a real creative (Runway), which comes back as NEEDS_REVIEW — Gate 2.
   * For everything else, approve is the final approval.
   */
  async function approve() {
    if (isConcept && !asset.mediaUrl) {
      setBusy('Generate')
      try {
        await approveCampaignAsset(asset)
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

  function restore(v: AssetVersion) {
    snapshot('Before restore')
    setBody(v.body)
    setCaption(v.caption)
    setCta(v.cta)
    setTab('content')
    toast.push('success', 'Restored into the editor — Save to keep it')
  }

  const title = `${asset.platform} · ${kindLabel(asset.kind)}`

  const footer = (
    <div className="rq-drawer__footer">
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
      <button className="btn" disabled={busy !== null} onClick={() => setChangesOpen(true)}>
        Request changes
      </button>
      <button
        className="btn ghost"
        disabled={busy !== null}
        onClick={() => setRejectOpen(true)}
        style={{ color: 'var(--crimson-600)' }}
      >
        Reject
      </button>
      <div className="rq-drawer__regen">
        <input
          className="input"
          value={regenNote}
          onChange={(e) => setRegenNote(e.target.value)}
          placeholder="Optional regenerate note"
          aria-label="Regenerate instruction"
        />
        <button className="btn" disabled={busy !== null} onClick={() => void regenerate()}>
          {busy === 'Regenerate' ? <Spinner /> : <Icon name="refresh" size={14} />}
          Regenerate
        </button>
      </div>
    </div>
  )

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'targeting', label: 'Targeting' },
    { id: 'comments', label: 'Comments' },
    { id: 'history', label: 'History' },
  ]

  const bodyContent = (
    <>
      <div className="spread" style={{ marginBottom: 16, alignItems: 'center' }}>
        <div className="row" style={{ gap: 10 }}>
          <PlatformIcon platform={asset.platform} size={22} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{title}</div>
            {asset.scheduledFor ? (
              <div className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                Scheduled · {new Date(asset.scheduledFor).toLocaleString()}
              </div>
            ) : null}
          </div>
        </div>
        <StatusPill status={toStatus(status)} />
      </div>

      {asset.mediaUrl ? (
        <div style={{ marginBottom: 16 }}>
          {asset.kind === 'VIDEO_PROMPT' ? (
            <video
              src={asset.mediaUrl}
              controls
              style={{
                width: '100%',
                maxHeight: 320,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-inverse)',
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.mediaUrl}
              alt={asset.title ?? 'Generated creative'}
              style={{
                width: '100%',
                maxHeight: 320,
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-sunken)',
              }}
            />
          )}
        </div>
      ) : isConcept ? (
        <div className="rq-drawer__concept">
          <Icon name={asset.kind === 'VIDEO_PROMPT' ? 'video' : 'image'} size={22} />
          <p className="type-caption">
            {busy === 'Generate'
              ? 'Generating your creative…'
              : 'Approve this concept to generate the creative.'}
          </p>
        </div>
      ) : null}

      <div className="rq-drawer__tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'content' ? (
        <div className="stack" style={{ gap: 12 }}>
          {/* On a poster or video concept, `body` is the generation prompt, and
              prompts are not shown anywhere in the product. On every other kind
              it is the copy itself, which is the whole reason this drawer opens.
              Same column, two different things — so the field appears for one
              and not the other. The stored prompt is untouched; regeneration
              still uses it. */}
          {isConcept ? null : (
            <Field label="Body">
              <textarea
                className="input"
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
          )}
          <Field label="Caption">
            <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Field>
          <Field label="Call to action">
            <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
          </Field>
          {asset.hashtags && asset.hashtags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {asset.hashtags.map((h) => (
                <Chip key={h}>#{h.replace(/^#/, '')}</Chip>
              ))}
            </div>
          ) : null}

          {asset.kind === 'IMAGE_PROMPT' &&
          (asset.aiVersions?.variants?.length ?? 0) > 1 &&
          status === 'NEEDS_REVIEW' ? (
            <div>
              <p className="type-caption" style={{ marginBottom: 8 }}>
                Pick the winner — the selected variant becomes the final creative:
              </p>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {asset.aiVersions!.variants!.map((v) => (
                  <button
                    key={v}
                    type="button"
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
                          ? '3px solid var(--cobalt-600)'
                          : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
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

          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => {
                snapshot('Before save')
                void act(
                  'Save',
                  () => api.patch(`/campaign-assets/${asset.id}`, { body, caption, cta }),
                  false,
                )
              }}
            >
              {busy === 'Save' ? (
                <Spinner />
              ) : (
                <>
                  <Icon name="check" size={14} /> Save
                </>
              )}
            </button>
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
      ) : null}

      {tab === 'targeting' ? (
        <EmptyState
          icon="target"
          title="No targeting on this asset"
          hint={
            asset.kind.startsWith('AD_')
              ? 'Audience, placements, and budget are chosen at publish or on the connected ad account — they are not stored on the asset in this contract.'
              : 'Targeting applies to ads. This asset is copy or organic content.'
          }
        />
      ) : null}

      {tab === 'comments' ? (
        <EmptyState
          icon="message-square"
          title="Comments unavailable"
          hint="Threaded comments are not part of the frozen campaign-assets contract. Use Request changes or Reject with a reason so the AI learns."
        />
      ) : null}

      {tab === 'history' ? (
        versions.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No local versions yet"
            hint="Regenerate or Save stores a copy in this browser so you can restore earlier text."
          />
        ) : (
          <ul className="rq-history">
            {versions.map((v) => (
              <li key={v.at} className="rq-history__item">
                <div className="spread">
                  <span className="type-caption strat-mono">{new Date(v.at).toLocaleString()}</span>
                  <button type="button" className="btn ghost sm" onClick={() => restore(v)}>
                    Restore
                  </button>
                </div>
                {v.note ? <p className="type-caption">{v.note}</p> : null}
                <p className="type-body rq-history__body">
                  {v.body.slice(0, 220)}
                  {v.body.length > 220 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </>
  )

  const dialogs = (
    <>
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
          title="Why reject it?"
          confirmLabel="Reject"
          danger
          onClose={() => setRejectOpen(false)}
          onReject={(reason) => {
            setRejectOpen(false)
            void act('Reject', () =>
              api.post(`/campaign-assets/${asset.id}/reject`, reason ? { reason } : {}),
            )
          }}
        />
      ) : null}

      {changesOpen ? (
        <RejectDialog
          title="What should change?"
          confirmLabel="Request changes"
          danger={false}
          onClose={() => setChangesOpen(false)}
          onReject={(reason) => {
            setChangesOpen(false)
            void act('Request changes', () =>
              api.post(`/campaign-assets/${asset.id}/reject`, {
                reason: reason ? `Request changes — ${reason}` : 'Request changes',
              }),
            )
          }}
        />
      ) : null}
    </>
  )

  if (variant === 'drawer') {
    return (
      <>
        <div className="overlay" onClick={onBack} />
        <aside className="drawer rq-drawer" role="dialog" aria-label={title}>
          <div className="head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onBack} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="body">{bodyContent}</div>
          <div className="foot">{footer}</div>
        </aside>
        {dialogs}
      </>
    )
  }

  return (
    <div style={{ animation: 'rise 0.2s ease both' }}>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 14 }}>
        <Icon name="arrow-left" size={14} /> Back
      </button>
      <div className="card">{bodyContent}</div>
      <div style={{ marginTop: 16 }}>{footer}</div>
      {dialogs}
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
  const [when, setWhen] = useState('')
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
            <p className="type-secondary" style={{ fontSize: 13 }}>
              No connected accounts yet. Connect a channel under Connections first.
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

const REJECT_REASONS = ['Off-brand', 'Wrong style', 'Weak copy', 'Wrong colors', 'Not relevant']

function RejectDialog({
  title,
  confirmLabel,
  danger,
  onClose,
  onReject,
}: {
  title: string
  confirmLabel: string
  danger: boolean
  onClose: () => void
  onReject: (reason: string | null) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState('')

  const reason = [picked, custom.trim()].filter(Boolean).join(' — ') || null

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={title}>
        <div className="head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          <p className="type-caption" style={{ marginBottom: 12 }}>
            The AI learns from this — future content avoids what you reject.
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
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
          <button
            className={danger ? 'btn danger' : 'btn primary'}
            onClick={() => onReject(reason)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
