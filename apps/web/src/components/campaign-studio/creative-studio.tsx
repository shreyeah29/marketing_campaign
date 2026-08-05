'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { EmptyState, useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, StatusPill, StatusRail, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'

import { useCampaign } from './campaign-context'
import { approveCampaignAsset } from './approve-asset'
import {
  groupIntoContentPieces,
  piecePlatforms,
  piecePreviewUrl,
  piecePrimaryCaption,
  pieceStatus,
} from './content-pieces'
import { readAssetVersions } from './asset-versions'
import type { Asset, ContentPiece } from './types'

/**
 * Campaign-centric Creative Studio — large previews, platform adaptations,
 * full captions. Groups flat API assets into Content Pieces (one master creative).
 */
export function CreativeStudio({
  selectedAssetId,
  drawer,
}: {
  selectedAssetId?: string | null
  drawer?: ReactNode
}) {
  const { campaignId, assets, reload } = useCampaign()
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'review' | 'approved'>('review')
  const [platformTab, setPlatformTab] = useState<string | null>(null)
  const [panel, setPanel] = useState<'copy' | 'comments' | 'versions'>('copy')

  const pieces = useMemo(() => groupIntoContentPieces(assets ?? []), [assets])

  const filtered = useMemo(() => {
    if (filter === 'all') return pieces
    if (filter === 'approved') {
      return pieces.filter((p) =>
        p.assets.every(
          (a) => a.status === 'APPROVED' || a.status === 'PUBLISHED' || a.status === 'SCHEDULED',
        ),
      )
    }
    return pieces.filter((p) => {
      const s = pieceStatus(p)
      return ['GENERATED', 'NEEDS_REVIEW', 'DRAFT', 'REJECTED'].includes(s)
    })
  }, [pieces, filter])

  const selectedPiece = useMemo(() => {
    if (!filtered.length) return null
    if (selectedAssetId) {
      const hit =
        filtered.find((p) => p.assets.some((a) => a.id === selectedAssetId)) ??
        pieces.find((p) => p.assets.some((a) => a.id === selectedAssetId))
      if (hit) return hit
    }
    return filtered[0] ?? null
  }, [filtered, pieces, selectedAssetId])

  useEffect(() => {
    if (!selectedPiece) return
    const plats = piecePlatforms(selectedPiece)
    if (!platformTab || !plats.includes(platformTab)) {
      setPlatformTab(plats[0] ?? null)
    }
  }, [selectedPiece, platformTab])

  const activeAdaptation: Asset | null = useMemo(() => {
    if (!selectedPiece) return null
    if (platformTab) {
      const hit = selectedPiece.adaptations.find((a) => a.platform === platformTab)
      if (hit) return hit
    }
    return selectedPiece.adaptations[0] ?? selectedPiece.master
  }, [selectedPiece, platformTab])

  function selectPiece(piece: ContentPiece) {
    const id = piece.master?.id ?? piece.assets[0]?.id
    if (!id) return
    router.push(`/app/campaigns/${campaignId}/assets/${id}`)
  }

  async function actOnPiece(
    piece: ContentPiece,
    action: 'approve' | 'reject' | 'regenerate' | 'duplicate' | 'generate',
  ) {
    setBusy(true)
    try {
      if (action === 'generate') {
        // Render the creative so it can be judged on sight. Deliberately does
        // not approve anything — the reviewer decides after seeing it.
        const target = piece.master
        if (!target) return
        await api.post(`/campaign-assets/${target.id}/generate-media`, { variants: 1 })
        toast.push('success', 'Generating the creative — this takes a moment')
      } else if (action === 'approve') {
        // Master creative first (may chain Runway), then adaptations
        const ordered = piece.master ? [piece.master, ...piece.adaptations] : piece.adaptations
        let generated = 0
        for (const a of ordered) {
          if (['APPROVED', 'PUBLISHED', 'SCHEDULED', 'PUBLISHING'].includes(a.status)) continue
          const result = await approveCampaignAsset(a)
          if (result === 'generated') generated++
        }
        toast.push(
          'success',
          generated > 0 ? 'Master creative generating — adaptations approved' : 'Piece approved',
        )
      } else if (action === 'reject') {
        for (const a of piece.assets) {
          if (a.status === 'REJECTED') continue
          await api.post(`/campaign-assets/${a.id}/reject`, {})
        }
        toast.push('success', 'Piece rejected')
      } else if (action === 'regenerate') {
        const target = piece.master ?? activeAdaptation
        if (!target) return
        await api.post(`/campaign-assets/${target.id}/regenerate`, {})
        toast.push('success', 'Regenerating…')
      } else {
        const target = piece.master ?? activeAdaptation
        if (!target) return
        await api.post(`/campaign-assets/${target.id}/duplicate`, {})
        toast.push('success', 'Duplicated')
      }
      reload()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${action} failed`)
    } finally {
      setBusy(false)
    }
  }

  function downloadMedia(url: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  if (assets === null) {
    return (
      <div className="cstudio">
        <div className="row" style={{ gap: 8, padding: 48 }}>
          <Spinner />
          <span className="type-secondary">Loading creatives…</span>
        </div>
      </div>
    )
  }

  if (!pieces.length) {
    return (
      <div className="cstudio">
        <EmptyState
          icon="image"
          title="No creatives yet"
          hint="Generate from Create. Each piece is one master creative reused across platforms."
        />
      </div>
    )
  }

  const previewUrl = selectedPiece ? piecePreviewUrl(selectedPiece) : null
  const status = selectedPiece ? pieceStatus(selectedPiece) : 'DRAFT'
  const versions = activeAdaptation ? readAssetVersions(activeAdaptation.id) : []
  const caption =
    (activeAdaptation?.caption || activeAdaptation?.body || piecePrimaryCaption(selectedPiece!)) ??
    ''

  return (
    <div className={`cstudio${drawer ? ' has-drawer' : ''}`}>
      <aside className="cstudio__rail" aria-label="Content pieces">
        <div className="cstudio__rail-head">
          <h2 className="type-section" style={{ margin: 0 }}>
            Creatives
          </h2>
          <p className="type-caption" style={{ color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {pieces.length} piece{pieces.length === 1 ? '' : 's'} · one master each
          </p>
        </div>
        <div className="cstudio__filters" role="tablist">
          {(
            [
              ['review', 'Needs review'],
              ['approved', 'Approved'],
              ['all', 'All'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`cstudio__filter${filter === id ? ' is-on' : ''}`}
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="cstudio__list">
          {filtered.map((p) => {
            const thumb = piecePreviewUrl(p)
            const active = p.id === selectedPiece?.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`cstudio__thumb${active ? ' is-on' : ''}`}
                  onClick={() => selectPiece(p)}
                >
                  <div className="cstudio__thumb-media">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" />
                    ) : (
                      <div className="cstudio__thumb-ph">
                        <Icon
                          name={p.master?.kind === 'VIDEO_PROMPT' ? 'video' : 'image'}
                          size={18}
                        />
                      </div>
                    )}
                  </div>
                  <div className="cstudio__thumb-meta">
                    <span className="cstudio__thumb-title">{p.label}</span>
                    <span className="type-caption">
                      {piecePlatforms(p).length
                        ? `${piecePlatforms(p).length} platforms`
                        : kindLabel(p.master?.kind ?? p.assets[0]?.kind ?? '')}
                    </span>
                    <StatusPill status={toStatus(pieceStatus(p))} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="cstudio__stage">
        {!selectedPiece ? (
          <EmptyState icon="layout" title="Select a creative" hint="Pick a piece from the left." />
        ) : (
          <StatusRail status={toStatus(status)} className="cstudio__canvas">
            <header className="cstudio__stage-head">
              <div>
                <p className="type-label" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
                  Content piece {String(selectedPiece.index).padStart(2, '0')}
                </p>
                <h1 className="cstudio__title">{selectedPiece.label}</h1>
              </div>
              <StatusPill status={toStatus(status)} />
            </header>

            <div className="cstudio__preview">
              {previewUrl ? (
                selectedPiece.master?.kind === 'VIDEO_PROMPT' ? (
                  <video src={previewUrl} controls className="cstudio__media" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="cstudio__media" />
                )
              ) : (
                <div className="cstudio__preview-empty">
                  <Icon
                    name={selectedPiece.master?.kind === 'VIDEO_PROMPT' ? 'video' : 'image'}
                    size={36}
                  />
                  <p className="type-body-strong" style={{ margin: '12px 0 4px' }}>
                    {selectedPiece.master ? 'Master creative ready to generate' : 'Copy-only piece'}
                  </p>
                  <p className="type-secondary" style={{ margin: 0, maxWidth: '42ch' }}>
                    {selectedPiece.master
                      ? 'Generate it to see the creative, then approve, reject or regenerate. It is reused across every platform tab.'
                      : 'This group came back as captions only — the plan produced no image concept for it.'}
                  </p>
                  {selectedPiece.master ? (
                    <button
                      type="button"
                      className="btn primary"
                      style={{ marginTop: 16 }}
                      disabled={busy}
                      onClick={() => void actOnPiece(selectedPiece, 'generate')}
                    >
                      {busy ? <Spinner /> : <Icon name="sparkles" size={14} />}
                      Generate creative
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div
              className="cstudio__platform-tabs"
              role="tablist"
              aria-label="Platform adaptations"
            >
              {piecePlatforms(selectedPiece).map((plat) => (
                <button
                  key={plat}
                  type="button"
                  role="tab"
                  className={`cstudio__ptab${platformTab === plat ? ' is-on' : ''}`}
                  aria-selected={platformTab === plat}
                  onClick={() => setPlatformTab(plat)}
                >
                  <PlatformIcon platform={plat} size={14} />
                  {plat.charAt(0) + plat.slice(1).toLowerCase()}
                </button>
              ))}
              {!piecePlatforms(selectedPiece).length ? (
                <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                  No platform adaptations yet
                </span>
              ) : null}
            </div>

            <div className="cstudio__panels" role="tablist">
              {(
                [
                  ['copy', 'Caption'],
                  ['comments', 'Comments'],
                  ['versions', 'Versions'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`cstudio__ptab${panel === id ? ' is-on' : ''}`}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {panel === 'copy' ? (
              <div className="cstudio__copy">
                <p className="type-label">Caption</p>
                <p className="cstudio__caption">{caption || '—'}</p>
                {activeAdaptation?.hashtags && activeAdaptation.hashtags.length > 0 ? (
                  <>
                    <p className="type-label" style={{ marginTop: 20 }}>
                      Hashtags
                    </p>
                    <p className="cstudio__tags">
                      {activeAdaptation.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join('  ')}
                    </p>
                  </>
                ) : null}
                {activeAdaptation?.cta ? (
                  <>
                    <p className="type-label" style={{ marginTop: 20 }}>
                      CTA
                    </p>
                    <p className="type-body-strong">{activeAdaptation.cta}</p>
                  </>
                ) : null}
                {selectedPiece.master && !previewUrl ? (
                  <>
                    <p className="type-label" style={{ marginTop: 20 }}>
                      Image prompt
                    </p>
                    <p className="cstudio__caption type-secondary">{selectedPiece.master.body}</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {panel === 'comments' ? (
              <div className="cstudio__copy">
                <EmptyState
                  icon="message-square"
                  title="Comments unavailable"
                  hint="Asset comments are not in the API yet. Reject with a reason to leave feedback for regenerate."
                />
              </div>
            ) : null}

            {panel === 'versions' ? (
              <div className="cstudio__copy">
                {versions.length === 0 ? (
                  <p className="type-secondary">
                    No local versions yet. Regenerate or edit to start a history for this
                    adaptation.
                  </p>
                ) : (
                  <ul className="cstudio__versions">
                    {versions.map((v, i) => (
                      <li key={`${v.at}-${i}`}>
                        <span className="type-caption">
                          {new Date(v.at).toLocaleString()}
                          {v.note ? ` · ${v.note}` : ''}
                        </span>
                        <p className="type-body">{v.caption || v.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="cstudio__actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void actOnPiece(selectedPiece, 'approve')}
              >
                {busy ? <Spinner /> : <Icon name="check" size={14} />}
                Approve
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void actOnPiece(selectedPiece, 'reject')}
              >
                <Icon name="x" size={14} /> Reject
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !activeAdaptation}
                onClick={() => {
                  if (activeAdaptation) {
                    router.push(`/app/campaigns/${campaignId}/assets/${activeAdaptation.id}`)
                  }
                }}
              >
                <Icon name="edit" size={14} /> Edit
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void actOnPiece(selectedPiece, 'regenerate')}
              >
                <Icon name="refresh" size={14} /> Regenerate
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void actOnPiece(selectedPiece, 'duplicate')}
              >
                <Icon name="copy" size={14} /> Duplicate
              </button>
              {previewUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => downloadMedia(previewUrl)}
                >
                  <Icon name="download" size={14} /> Download
                </button>
              ) : null}
            </div>
          </StatusRail>
        )}
      </main>

      {drawer}
    </div>
  )
}

/** @deprecated Use CreativeStudio — kept as alias for imports. */
export const ReviewQueue = CreativeStudio
