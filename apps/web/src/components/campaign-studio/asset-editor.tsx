'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, EmptyState, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip, kindLabel, StatusPill, toStatus } from '@/components/status'

import { pushAssetVersion, readAssetVersions, type AssetVersion } from './asset-versions'
import type { Asset } from './types'

/**
 * Two tabs, not four.
 *
 * Targeting and Comments rendered an EmptyState in every reachable state —
 * neither is in the frozen contract, so they could only ever say "not
 * available". Two tabs that cost a click to learn nothing make a panel look
 * broken. The feedback they implied is already collected by Request changes and
 * Reject, whose reason chips are where the learning signal actually goes.
 */
type EditorTab = 'content' | 'history'

/**
 * Asset editor — a page, or a lightbox over the contact sheet.
 *
 * The lightbox replaced a 480px drawer that capped the creative at 320px tall
 * and pushed the decision buttons below two empty fields, while two thirds of
 * the screen sat behind a dimmed overlay doing nothing. The artwork is the thing
 * being judged; it gets the room.
 *
 * Preserves A/B variants, reject chips, publish, and browser-local history so
 * regenerate is not lossy in the UI.
 */
export function AssetEditor({
  asset,
  onBack,
  onChanged,
  variant = 'page',
  step,
}: {
  asset: Asset
  onBack: () => void
  onChanged: () => void
  variant?: 'page' | 'lightbox'
  /** Position in the sheet, with the way to walk it without closing. */
  step?: { index: number; total: number; onPrev?: () => void; onNext?: () => void }
}) {
  const toast = useToast()
  const [body, setBody] = useState(asset.body)
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [cta, setCta] = useState(asset.cta ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tab, setTab] = useState<EditorTab>('content')
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
    const instruction = regenNote.trim()
    setBusy('Regenerate')
    try {
      snapshot(instruction || 'Before regenerate')
      /**
       * The note is sent, which it was not.
       *
       * It was read into state, used to label a history entry, and then a bare
       * `{}` was posted — so "make it warmer, mention the terrace" produced a
       * rewrite that had never heard of the terrace. Asking for a change and
       * getting an unrelated one is worse than nothing happening, because the
       * unrelated change reads as the answer.
       */
      const res = await api.post<{ body?: string; mediaUrl?: string }>(
        `/campaign-assets/${asset.id}/regenerate`,
        instruction ? { instruction } : {},
      )
      if (res.body) setBody(res.body)
      setRegenNote('')
      // Artwork comes back with a new picture rather than new copy, and the
      // drawer holds a stale one until the parent reloads.
      onChanged?.()
      toast.push(
        'success',
        isConcept
          ? instruction
            ? 'Redrawing with your change'
            : 'Redrawing'
          : 'Regenerated — previous copy is in History',
      )
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(null)
    }
  }

  const isConcept = asset.kind === 'IMAGE_PROMPT' || asset.kind === 'VIDEO_PROMPT'
  /**
   * Approving artwork means approving a picture, so there has to be one.
   *
   * FAILED is decidable — a person looking at a poster has made the decision,
   * and the status is a machine's opinion about a past attempt. What is not
   * decidable is a concept with nothing to look at.
   */
  const awaitingPicture = isConcept && !asset.mediaUrl
  const canApprove =
    ['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT', 'FAILED'].includes(status) &&
    !awaitingPicture
  const canPublish = status === 'APPROVED'
  const [publishOpen, setPublishOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)

  /**
   * One gate, not two.
   *
   * Approving used to *start* the generation for a concept with no picture —
   * "Approve & generate", asking permission to draw. That predates the contact
   * sheet, which now fires every poster the moment a campaign is opened. So the
   * button asked for permission to do something already done, on a screen
   * showing the finished picture, which is why it read as confusing rather than
   * careful.
   *
   * Approve now means one thing: this picture is good. Nothing here spends a
   * generation.
   */
  async function approve() {
    await act('Approve', () => api.post(`/campaign-assets/${asset.id}/approve`, {}))
  }

  /** Draw it again — the retry after a provider failure. */
  async function rerender() {
    setBusy('Generate')
    try {
      await api.post(`/campaign-assets/${asset.id}/generate-media`, { variants: 1, force: true })
      toast.push('success', 'Drawing it again — it appears here when it lands')
      onChanged()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not start it')
    } finally {
      setBusy(null)
    }
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
              <Icon name="check" size={14} />
              Approve
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
          placeholder={
            isConcept
              ? 'What should change? e.g. warmer light, add the terrace'
              : 'What should change?'
          }
          aria-label="Regenerate instruction"
        />
        <button className="btn" disabled={busy !== null} onClick={() => void regenerate()}>
          {busy === 'Regenerate' ? <Spinner /> : <Icon name="refresh" size={14} />}
          Regenerate
        </button>
      </div>
    </div>
  )

  const tabs: { id: EditorTab; label: string }[] = [
    { id: 'content', label: 'Content' },
    {
      id: 'history',
      label: versions.length > 0 ? `History ${String(versions.length)}` : 'History',
    },
  ]

  /**
   * The artwork column.
   *
   * No `maxHeight: 320`. The creative is the thing being judged and it was being
   * shown in a sliver while two thirds of the screen sat behind a dimmed
   * overlay. It now scales to the column.
   */
  const canvasContent = (
    <>
      <div className="rq-lightbox__art">
        {asset.mediaUrl ? (
          asset.kind === 'VIDEO_PROMPT' ? (
            <video src={asset.mediaUrl} controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.mediaUrl} alt={asset.title ?? 'Generated creative'} />
          )
        ) : isConcept ? (
          /**
           * What is actually happening, rather than an instruction.
           *
           * This said "Approve this concept to generate the creative", which
           * stopped being true when the contact sheet began generating every
           * poster on open. It now reports the state: drawing, or the reason it
           * stopped, with the retry beside it.
           */
          <div className="rq-lightbox__pending">
            {busy === 'Generate' || !asset.failureReason ? (
              <>
                <Spinner />
                <p className="type-caption">Drawing this one…</p>
                <p className="type-caption" style={{ color: 'var(--text-muted)' }}>
                  It appears here the moment it lands — no need to wait on this screen.
                </p>
              </>
            ) : (
              <>
                <Icon name="alert-triangle" size={22} />
                <p className="type-caption">{asset.failureReason}</p>
                <button
                  type="button"
                  className="btn sm"
                  disabled={busy !== null}
                  onClick={() => void rerender()}
                >
                  <Icon name="refresh" size={13} /> Try again
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Beside the artwork, not at the bottom of a scrolling panel. Picking the
          winner is the one decision that needs the picture in view, and it was
          the furthest thing from it. */}
      {asset.kind === 'IMAGE_PROMPT' &&
      (asset.aiVersions?.variants?.length ?? 0) > 1 &&
      status === 'NEEDS_REVIEW' ? (
        <div className="rq-lightbox__variants">
          <p className="type-caption">
            Pick the winner — the selected variant becomes the final creative:
          </p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {asset.aiVersions?.variants?.map((v) => {
              const chosen = v === asset.mediaUrl
              return (
                <button
                  key={v}
                  type="button"
                  className={`rq-variant${chosen ? ' is-on' : ''}`}
                  onClick={() =>
                    void act('Select variant', () =>
                      api.post(`/campaign-assets/${asset.id}/choose-variant`, { url: v }),
                    )
                  }
                  disabled={busy !== null}
                  aria-pressed={chosen}
                  aria-label={chosen ? 'Selected variant' : 'Choose this variant'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v} alt="Variant" />
                  {/* Labelled, so the choice reads without hovering each one. */}
                  {chosen ? <span className="rq-variant__tag">Selected</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )

  const bodyContent = (
    <>
      {/* Printed once. The lightbox carries these in its own head, and having
          both meant the title and the status pill appeared twice, eight pixels
          apart. Still needed by the page variant, which has no head of its own. */}
      {variant === 'page' ? (
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
      ) : null}

      {/* The page has one column, so the artwork stays in the flow here. */}
      {variant === 'page' ? canvasContent : null}

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
            <input
              className="input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Empty — generate from the brief or type it"
            />
          </Field>
          <Field label="Call to action">
            <input
              className="input"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="e.g. Book a slot"
            />
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

  if (variant === 'lightbox') {
    return (
      <>
        <div className="overlay" onClick={onBack} />
        {/**
         * Bounded height, deliberately.
         *
         * The footer holds every decision on this screen, and a modal that grows
         * with its content pushes those below the fold on a 900px laptop — which
         * is what the drawer did, so you scrolled past two empty fields to reach
         * Approve. Head and foot are fixed; only the two columns scroll, and
         * they scroll independently so reading the caption never moves the
         * picture you are judging it against.
         */}
        <div className="rq-lightbox" role="dialog" aria-modal="true" aria-label={title}>
          <div className="rq-lightbox__head">
            <PlatformIcon platform={asset.platform} size={20} />
            <div className="rq-lightbox__title">
              <span>{title}</span>
              {asset.scheduledFor ? (
                <span className="type-caption">
                  Scheduled · {new Date(asset.scheduledFor).toLocaleString()}
                </span>
              ) : null}
            </div>
            <StatusPill status={toStatus(status)} />
            <div className="grow" />
            {step && step.total > 1 ? (
              <div className="rq-lightbox__step">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Previous"
                  disabled={!step.onPrev}
                  onClick={step.onPrev}
                >
                  <Icon name="chevron-left" size={15} />
                </button>
                <span className="type-caption">
                  {step.index + 1} of {step.total}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Next"
                  disabled={!step.onNext}
                  onClick={step.onNext}
                >
                  <Icon name="chevron-right" size={15} />
                </button>
              </div>
            ) : null}
            <button className="icon-btn" onClick={onBack} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="rq-lightbox__body">
            <div className="rq-lightbox__canvas">{canvasContent}</div>
            <div className="rq-lightbox__panel">{bodyContent}</div>
          </div>

          <div className="rq-lightbox__foot">{footer}</div>
        </div>
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
