'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { StatusPill, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'
import { groupIntoContentPieces } from '@/components/campaign-studio/content-pieces'
import type { Asset } from '@/components/campaign-studio/types'

/**
 * Copy & captions — the picture, and the words that go with it.
 *
 * This screen used to render the image gallery, so clicking a post opened a
 * photograph with Download and Copy link and no caption anywhere. That is the
 * media library's job. What was missing was the one thing the page is named
 * after: which words belong to which post.
 *
 * The grid shows the poster, because that is how a person recognises a post —
 * nobody scans a wall of paragraphs looking for the one about the weekend
 * brunch. Clicking it opens the caption, the hashtags and the call to action
 * for **that** concept, ready to copy.
 *
 * The pairing is not a guess. `groupIntoContentPieces` is the same grouping the
 * campaign studio uses: an IMAGE_PROMPT is a concept, and the POST and CAPTION
 * assets titled with the same "Concept N:" prefix are its adaptations. Reusing
 * it means this page and the campaign screen can never disagree about which
 * caption belongs to which picture.
 */

interface RawAsset extends Asset {
  campaignId?: string | null
  createdAt?: string | null
}

function unwrap<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

/** Copy kinds, in the order a person reads them. */
const COPY_KINDS = ['POST', 'CAPTION', 'AD_HEADLINE', 'AD_DESCRIPTION', 'AD_COPY', 'STORY', 'REEL']

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').toLowerCase()
}

export function CopyLibrary() {
  const toast = useToast()
  const [assets, setAssets] = useState<RawAsset[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [assetRes, campRes] = await Promise.allSettled([
        api.get<RawAsset[] | { data: RawAsset[] }>('/campaign-assets'),
        api.get<{ id: string; name: string }[] | { data: { id: string; name: string }[] }>(
          '/campaigns',
        ),
      ])
      if (assetRes.status === 'rejected') throw assetRes.reason
      setAssets(unwrap(assetRes.value))
      if (campRes.status === 'fulfilled') {
        setNames(new Map(unwrap(campRes.value).map((c) => [c.id, c.name])))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your copy')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Concepts that have both a picture and something to say.
   *
   * A concept with no copy has nothing for this page to show, and copy with no
   * picture cannot be recognised from a grid — it lives on the campaign screen
   * where it has a name and a position. Both are deliberately excluded rather
   * than rendered as an empty tile.
   */
  const pieces = useMemo(() => {
    const grouped = groupIntoContentPieces(assets ?? [])
    return grouped
      .map((p) => ({
        piece: p,
        copy: p.adaptations.filter((a) => COPY_KINDS.includes(a.kind)),
        campaign:
          names.get(((p.master ?? p.assets[0]) as RawAsset | undefined)?.campaignId ?? '') ?? null,
      }))
      .filter((p) => p.piece.master?.mediaUrl && p.copy.length > 0)
  }, [assets, names])

  const open = pieces.find((p) => p.piece.id === openId) ?? null

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.push('success', `${what} copied`)
    } catch {
      toast.push('error', 'Could not copy that')
    }
  }

  /** Caption, hashtags and CTA as one block — what you paste into Instagram. */
  function fullText(copyAssets: Asset[]): string {
    const first = copyAssets[0]
    if (!first) return ''
    const body = (first.caption ?? first.body ?? '').trim()
    const tags = (first.hashtags ?? []).map((h) => `#${h.replace(/^#/, '')}`).join(' ')
    return [body, tags].filter(Boolean).join('\n\n')
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (assets === null) {
    return (
      <div className="row" style={{ gap: 8, padding: 40 }}>
        <Spinner />
        <span className="type-secondary">Loading your copy…</span>
      </div>
    )
  }

  if (pieces.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="No captions yet"
        hint="Captions appear here once a campaign has generated them, paired with the poster they belong to."
      />
    )
  }

  return (
    <>
      <p className="type-secondary" style={{ margin: '0 0 18px' }}>
        {pieces.length} {pieces.length === 1 ? 'post' : 'posts'} with copy. Click one to read and
        copy its caption.
      </p>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}
      >
        {pieces.map(({ piece, copy: copyAssets, campaign }) => {
          const preview = (copyAssets[0]?.caption ?? copyAssets[0]?.body ?? '').trim()
          return (
            <FadeIn key={piece.id} className="card copy-card">
              <button
                type="button"
                className="copy-card__hit"
                onClick={() => setOpenId(piece.id)}
                aria-label={`Open captions for ${piece.label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece.master?.mediaUrl ?? ''} alt={piece.label} loading="lazy" />
              </button>

              <div className="spread" style={{ marginTop: 10, gap: 8 }}>
                <StatusPill status={toStatus(piece.master?.status ?? 'DRAFT')} />
                <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                  {copyAssets.length} {copyAssets.length === 1 ? 'caption' : 'captions'}
                </span>
              </div>

              <p className="type-body-strong" style={{ margin: '7px 0 0' }}>
                {piece.label}
              </p>
              {campaign ? (
                <p
                  className="type-caption"
                  style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}
                >
                  {campaign}
                </p>
              ) : null}
              <p className="copy-card__preview">{preview}</p>
            </FadeIn>
          )
        })}
      </div>

      {/* ── One post, its picture and every word that goes with it ────────── */}
      {open ? (
        /* `gallery__lightbox` — the class that is actually styled fixed.
           I invented `gallery__overlay` and `gallery__scrim`, neither of which
           exists in the stylesheet, so the panel rendered in normal flow at the
           bottom of the page and every click meant a scroll to find it. */
        <div
          className="gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={open.piece.label}
          onClick={() => setOpenId(null)}
        >
          {/* Only the backdrop dismisses; a click inside the panel must not. */}
          <div className="gallery__panel copy-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn gallery__close"
              aria-label="Close"
              onClick={() => setOpenId(null)}
            >
              <Icon name="x" size={16} />
            </button>

            <div className="copy-panel__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.piece.master?.mediaUrl ?? ''} alt={open.piece.label} />
            </div>

            <div className="copy-panel__body">
              <div className="panel-head__title">{open.piece.label}</div>
              <div className="row" style={{ gap: 8, marginTop: 4, marginBottom: 14 }}>
                <StatusPill status={toStatus(open.piece.master?.status ?? 'DRAFT')} />
                {open.campaign ? (
                  <span className="type-caption" style={{ color: 'var(--text-muted)' }}>
                    {open.campaign}
                  </span>
                ) : null}
              </div>

              {open.copy.map((asset) => {
                const body = (asset.caption ?? asset.body ?? '').trim()
                return (
                  <div key={asset.id} className="copy-block">
                    <div className="copy-block__head">
                      <PlatformIcon platform={asset.platform} size={13} />
                      <span className="type-label">{kindLabel(asset.kind)}</span>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => void copy(body, 'Caption')}
                      >
                        <Icon name="copy" size={13} /> Copy
                      </button>
                    </div>
                    <p className="copy-block__text">{body || '—'}</p>

                    {asset.hashtags && asset.hashtags.length > 0 ? (
                      <ul className="cstudio__tags">
                        {asset.hashtags.map((h) => (
                          <li key={h} className="cstudio__tag">
                            #{h.replace(/^#/, '')}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {asset.cta ? (
                      <p className="type-caption" style={{ margin: '8px 0 0' }}>
                        CTA · <strong>{asset.cta}</strong>
                      </p>
                    ) : null}
                  </div>
                )
              })}

              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 4 }}
                onClick={() => void copy(fullText(open.copy), 'Caption and hashtags')}
              >
                <Icon name="copy" size={14} /> Copy caption and hashtags
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
