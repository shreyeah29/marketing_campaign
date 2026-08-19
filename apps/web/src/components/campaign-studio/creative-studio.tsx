'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { checkCopy, type ComplianceRules } from '@/lib/compliance'
import { EmptyState, useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, platformLabel, StatusPill, StatusRail, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'

import { useCampaign } from './campaign-context'
import { approveCampaignAsset } from './approve-asset'
import {
  groupIntoContentPieces,
  pieceMedium,
  piecePlatforms,
  piecePreviewUrl,
  piecePrimaryCaption,
  pieceStatus,
  type PieceMedium,
} from './content-pieces'
import { readAssetVersions } from './asset-versions'
import type { Asset, ContentPiece } from './types'

const MEDIUMS: readonly (readonly [PieceMedium, string])[] = [
  ['poster', 'Posters'],
  ['video', 'Videos'],
  ['copy', 'Copy'],
]

/** Lower-case for use mid-sentence in the empty states. */
const MEDIUM_NOUN: Record<PieceMedium, string> = {
  poster: 'posters',
  video: 'videos',
  copy: 'copy',
}

/**
 * Campaign-centric Creative Studio — large previews, platform adaptations,
 * full captions. Groups flat API assets into Content Pieces (one poster).
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
  const [medium, setMedium] = useState<PieceMedium>('poster')
  const [platformTab, setPlatformTab] = useState<string | null>(null)
  const [panel, setPanel] = useState<'copy' | 'comments' | 'versions'>('copy')
  /**
   * What to change on the next regenerate.
   *
   * Optional, and the difference between "give me another one" and "give me
   * this one, warmer". Without it the button could only reroll, which is a
   * worse answer than it looks: a person who asked for one change and received
   * an unrelated one has to work out which of the differences was the point.
   */
  const [regenNote, setRegenNote] = useState('')

  const pieces = useMemo(() => groupIntoContentPieces(assets ?? []), [assets])

  // Posters, videos and copy-only pieces are counted separately so each tab can
  // show its own number and empty tabs can be hidden rather than offered.
  const byMedium = useMemo(() => {
    const groups: Record<PieceMedium, typeof pieces> = { poster: [], video: [], copy: [] }
    for (const p of pieces) groups[pieceMedium(p)].push(p)
    return groups
  }, [pieces])

  // Land on a tab that has something in it. A campaign of videos only should
  // not open on an empty Posters tab and read as "nothing was generated".
  const settledRef = useRef(false)
  useEffect(() => {
    if (settledRef.current || pieces.length === 0) return
    settledRef.current = true
    if (byMedium.poster.length > 0) return
    setMedium(byMedium.video.length > 0 ? 'video' : 'copy')
  }, [pieces, byMedium])

  // Following a link straight to one asset must show it, even when it lives
  // under a tab other than the one currently open.
  //
  // Honoured once per asset id, not on every `pieces` change: while posters are
  // rendering this page reloads every five seconds, and re-running the switch
  // would drag you back off the Videos tab a few seconds after you opened it.
  const honouredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedAssetId || honouredRef.current === selectedAssetId) return
    const owner = pieces.find((p) => p.assets.some((a) => a.id === selectedAssetId))
    // Assets may not have arrived yet — leave it unhonoured and retry when they do.
    if (!owner) return
    honouredRef.current = selectedAssetId
    setMedium(pieceMedium(owner))
  }, [selectedAssetId, pieces])

  const filtered = useMemo(() => {
    const scoped = byMedium[medium]
    if (filter === 'all') return scoped
    if (filter === 'approved') {
      return scoped.filter((p) =>
        p.assets.every(
          (a) => a.status === 'APPROVED' || a.status === 'PUBLISHED' || a.status === 'SCHEDULED',
        ),
      )
    }
    return scoped.filter((p) => {
      const s = pieceStatus(p)
      return ['GENERATED', 'NEEDS_REVIEW', 'DRAFT', 'REJECTED'].includes(s)
    })
  }, [byMedium, medium, filter])

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

  // ── Posters render themselves ────────────────────────────────────────────
  // You cannot judge a poster from a description, so nothing here waits for a
  // Generate click. Every poster concept without artwork is sent off as soon as
  // the tab opens, and the page polls until they land — you watch them arrive
  // and then decide. Concepts already rejected are left alone; regenerating one
  // means reopening it, which keeps a rejection meaningful.
  //
  // This ref only avoids a duplicate *request*; it is not what keeps artwork
  // stable. It empties on every mount, so navigating away and back mid-render
  // used to start a second generation and silently replace the poster. The
  // server refuses to regenerate over existing media unless asked — that is the
  // guarantee. See `generate-media` in review-queue.controller.ts.
  const startedRef = useRef<Set<string>>(new Set())
  const [pending, setPending] = useState(0)
  const [blocked, setBlocked] = useState<string | null>(null)

  useEffect(() => {
    const waiting = pieces
      .map((p) => p.master)
      .filter(
        (m): m is Asset =>
          m != null && m.kind === 'IMAGE_PROMPT' && !m.mediaUrl && m.status !== 'REJECTED',
      )

    const fresh = waiting.filter((m) => !startedRef.current.has(m.id))
    setPending(waiting.length)
    if (fresh.length === 0) return

    fresh.forEach((m) => startedRef.current.add(m.id))
    let cancelled = false

    void (async () => {
      // Bounded concurrency: a ten-poster campaign firing at once would hit the
      // provider's rate limit and fail the lot.
      const queue = [...fresh]
      let firstError: string | null = null
      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const next = queue.shift()
          if (!next || cancelled) return
          try {
            await api.post(`/campaign-assets/${next.id}/generate-media`, { variants: 1 })
          } catch (e) {
            // Report the first failure and stop. Swallowing these left posters
            // silently never appearing, which is indistinguishable from the
            // provider being slow — and every retry costs money.
            firstError ??= e instanceof ApiError ? e.message : 'Poster rendering failed'
            queue.length = 0
          }
        }
      }
      await Promise.all([worker(), worker(), worker()])
      if (cancelled) return
      if (firstError) {
        setBlocked(firstError)
        toast.push('error', firstError)
      }
      reload()
    })()

    return () => {
      cancelled = true
    }
  }, [pieces, reload])

  // Poll while anything is still rendering, so posters appear as they finish
  // rather than on the next manual refresh.
  useEffect(() => {
    if (pending === 0 || blocked) return
    // Bounded. A poster that fails permanently leaves `pending` above zero
    // forever, and without a ceiling this polls every five seconds for as long
    // as the tab is open — a request loop with nothing left to discover.
    let ticks = 0
    const t = window.setInterval(() => {
      ticks += 1
      if (ticks > 60) {
        window.clearInterval(t)
        return
      }
      reload()
    }, 5000)
    return () => window.clearInterval(t)
  }, [pending, blocked, reload])

  // ── Advertising rules ────────────────────────────────────────────────────
  // Fetched once. An organisation that has set no rules gets no banner, and a
  // failed fetch must never block reviewing — compliance context is additive.
  const [rules, setRules] = useState<ComplianceRules>({ bannedClaims: [], disclaimers: [] })
  useEffect(() => {
    api
      .get<{ bannedClaims?: string[] | null; disclaimers?: ComplianceRules['disclaimers'] | null }>(
        '/config/branding',
      )
      .then((b) =>
        setRules({ bannedClaims: b?.bannedClaims ?? [], disclaimers: b?.disclaimers ?? [] }),
      )
      .catch(() => undefined)
  }, [])

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
        // `force` because this is a deliberate click asking for something
        // different. The automatic path below never sends it, which is what
        // makes a remount cost nothing instead of a new generation.
        await api.post(`/campaign-assets/${target.id}/generate-media`, {
          variants: 1,
          force: true,
        })
        toast.push(
          'success',
          target.kind === 'VIDEO_PROMPT'
            ? 'Rendering the video — this takes a few minutes'
            : 'Generating the creative — this takes a moment',
        )
      } else if (action === 'approve') {
        // Poster first (may chain Runway), then adaptations
        const ordered = piece.master ? [piece.master, ...piece.adaptations] : piece.adaptations
        let generated = 0
        for (const a of ordered) {
          if (['APPROVED', 'PUBLISHED', 'SCHEDULED', 'PUBLISHING'].includes(a.status)) continue
          const result = await approveCampaignAsset(a)
          if (result === 'generated') generated++
        }
        toast.push(
          'success',
          generated > 0 ? 'Poster generating — adaptations approved' : 'Piece approved',
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
        const instruction = regenNote.trim()
        await api.post(
          `/campaign-assets/${target.id}/regenerate`,
          instruction ? { instruction } : {},
        )
        setRegenNote('')
        toast.push('success', instruction ? 'Redrawing with your change' : 'Regenerating…')
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
          hint="Generate from Create. Each piece is one poster reused across platforms."
        />
      </div>
    )
  }

  const previewUrl = selectedPiece ? piecePreviewUrl(selectedPiece) : null
  const isVideo = selectedPiece?.master?.kind === 'VIDEO_PROMPT'
  const status = selectedPiece ? pieceStatus(selectedPiece) : 'DRAFT'
  const versions = activeAdaptation ? readAssetVersions(activeAdaptation.id) : []
  /**
   * No `!` on selectedPiece.
   *
   * This is the line that white-screened the whole route. `selectedPiece` is
   * legitimately null whenever the filter matches nothing — which is the normal
   * end state of a campaign, because the default filter is "Needs review" and
   * approving everything empties it. The assertion turned that into
   * `null.adaptations`, and an exception thrown during render takes the route
   * down instead of rendering the empty state twenty lines below.
   */
  const caption =
    activeAdaptation?.caption ||
    activeAdaptation?.body ||
    (selectedPiece ? piecePrimaryCaption(selectedPiece) : '')
  const compliance = checkCopy([caption, activeAdaptation?.cta, activeAdaptation?.body], rules)

  return (
    <div className={`cstudio${drawer ? ' has-drawer' : ''}`}>
      <aside className="cstudio__rail" aria-label="Creatives">
        {/* Posters and videos are separate tabs, not one mixed list: a poster is
            already rendered and waiting to be judged, a video has not been made
            yet and costs minutes to make. Showing them together meant the two
            most different actions on this screen sat side by side. */}
        <div className="cstudio__mediums" role="tablist" aria-label="Creative type">
          {MEDIUMS.filter(([id]) => byMedium[id].length > 0 || id === 'poster').map(
            ([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`cstudio__medium${medium === id ? ' is-on' : ''}`}
                aria-selected={medium === id}
                onClick={() => setMedium(id)}
              >
                <Icon
                  name={id === 'video' ? 'video' : id === 'copy' ? 'file-text' : 'image'}
                  size={14}
                />
                {label}
                <span className="cstudio__medium-count">{byMedium[id].length}</span>
              </button>
            ),
          )}
        </div>
        <div className="cstudio__rail-head">
          <p className="type-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
            {medium === 'video'
              ? `${String(byMedium.video.length)} video concept${byMedium.video.length === 1 ? '' : 's'} — ready to render`
              : medium === 'copy'
                ? `${String(byMedium.copy.length)} caption-only piece${byMedium.copy.length === 1 ? '' : 's'}`
                : `${String(byMedium.poster.length)} poster${byMedium.poster.length === 1 ? '' : 's'}${pending > 0 ? ` · ${String(pending)} rendering` : ''}`}
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
                      {piecePlatforms(p).length === 1
                        ? platformLabel(piecePlatforms(p)[0] ?? '')
                        : piecePlatforms(p).length > 1
                          ? `${String(piecePlatforms(p).length)} platforms`
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
        {/* Nothing selected has three causes, and "Pick a piece from the left"
            was only true for one of them. With the list empty that hint asks for
            something impossible, and the most common way to get here is the good
            outcome: everything in this tab is approved, so the default "Needs
            review" filter matches nothing. Say which, and offer the way out. */}
        {!selectedPiece ? (
          byMedium[medium].length === 0 ? (
            <EmptyState
              icon={medium === 'video' ? 'video' : medium === 'copy' ? 'file-text' : 'image'}
              title={`No ${MEDIUM_NOUN[medium]} in this campaign`}
              hint="The plan produced none of these. Other tabs may still have work in them."
            />
          ) : (
            <EmptyState
              icon={filter === 'review' ? 'check-circle' : 'layout'}
              title={
                filter === 'review'
                  ? 'Nothing is waiting for review'
                  : `No ${MEDIUM_NOUN[medium]} are approved yet`
              }
              hint={
                filter === 'review'
                  ? `Every ${MEDIUM_NOUN[medium] === 'copy' ? 'piece' : MEDIUM_NOUN[medium].replace(/s$/, '')} in this tab has been decided on.`
                  : 'Approve one from Needs review and it appears here.'
              }
              action={
                <button type="button" className="btn" onClick={() => setFilter('all')}>
                  Show all {byMedium[medium].length}
                </button>
              }
            />
          )
        ) : (
          <StatusRail status={toStatus(status)} className="cstudio__canvas">
            <header className="cstudio__stage-head">
              <div>
                <p className="type-label" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
                  Poster {String(selectedPiece.index).padStart(2, '0')}
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
                  <Icon name={isVideo ? 'video' : 'image'} size={36} />
                  <p className="type-body-strong" style={{ margin: '12px 0 4px' }}>
                    {!selectedPiece.master
                      ? 'Copy-only piece'
                      : blocked
                        ? `This ${isVideo ? 'video' : 'poster'} could not be rendered`
                        : isVideo
                          ? 'Ready to render'
                          : 'Rendering this poster…'}
                  </p>
                  <p className="type-secondary" style={{ margin: 0, maxWidth: '42ch' }}>
                    {!selectedPiece.master
                      ? 'This group came back as captions only — the plan produced no image concept for it.'
                      : (blocked ??
                        (isVideo
                          ? 'Read the prompt below first. Videos take a few minutes each, so this one waits for you rather than rendering on its own.'
                          : 'It appears here the moment it is ready — no need to wait on this screen. Then keep it, reject it, or ask for another.'))}
                  </p>
                  {/* Posters render on their own, so for them this is the retry
                      after a provider failure. Videos never start by themselves
                      — here the same button is the way in. */}
                  {selectedPiece.master ? (
                    <button
                      type="button"
                      className={`btn${isVideo && !blocked ? ' primary' : ''}`}
                      style={{ marginTop: 16 }}
                      disabled={busy}
                      onClick={() => void actOnPiece(selectedPiece, 'generate')}
                    >
                      {busy ? (
                        <Spinner />
                      ) : (
                        <Icon name={isVideo && !blocked ? 'play' : 'refresh'} size={14} />
                      )}
                      {isVideo && !blocked ? 'Render this video' : 'Try again'}
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
                <div className="cstudio__copy-head">
                  <p className="type-label" style={{ margin: 0 }}>
                    Caption
                  </p>
                  {caption ? (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        const tags = (activeAdaptation?.hashtags ?? [])
                          .map((h) => `#${h.replace(/^#/, '')}`)
                          .join(' ')
                        void navigator.clipboard
                          .writeText([caption, tags].filter(Boolean).join('\n\n'))
                          .then(() => toast.push('success', 'Caption and hashtags copied'))
                          .catch(() => toast.push('error', 'Could not copy'))
                      }}
                    >
                      <Icon name="copy" size={13} /> Copy
                    </button>
                  ) : null}
                </div>
                <p className="cstudio__caption">{caption || '—'}</p>
                {activeAdaptation?.hashtags && activeAdaptation.hashtags.length > 0 ? (
                  <>
                    <p className="type-label" style={{ marginTop: 20 }}>
                      Hashtags
                    </p>
                    {/* Chips, not one run-on line. You scan these to judge them
                        and copy them as a block to paste — both are harder when
                        thirty tags are glued into a paragraph. */}
                    <ul className="cstudio__tags">
                      {activeAdaptation.hashtags.map((h) => (
                        <li key={h} className="cstudio__tag">
                          #{h.replace(/^#/, '')}
                        </li>
                      ))}
                    </ul>
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

            {/* Advertising rules, shown where the decision is made rather than
                on a settings page nobody revisits. This reports and does not
                block: the reviewer is the compliance authority, and a check
                that refuses to publish with no override strands them. */}
            {!compliance.clean || compliance.disclaimers.length > 0 ? (
              <div className="cstudio__compliance" role="note">
                {!compliance.clean ? (
                  <p className="cstudio__compliance-line">
                    <Icon name="alert-triangle" size={14} />
                    <span>
                      This copy uses {compliance.claims.length === 1 ? 'a phrase' : 'phrases'} you
                      banned: <strong>{compliance.claims.map((c) => `“${c}”`).join(', ')}</strong>.
                      Edit the caption or change the rule in your brand kit.
                    </span>
                  </p>
                ) : null}
                {compliance.disclaimers.length > 0 ? (
                  <p className="cstudio__compliance-line type-caption">
                    <Icon name="shield" size={14} />
                    <span>
                      Must carry your disclaimer —{' '}
                      {compliance.disclaimers
                        .map((d) => (d.label ? `${d.label}: ${d.value}` : d.value))
                        .join(' · ')}
                    </span>
                  </p>
                ) : null}
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
                title={
                  regenNote.trim()
                    ? `Redraw with: ${regenNote.trim()}`
                    : 'Redraw. Say what to change in the box first to steer it.'
                }
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
              {/* Full width under the buttons: an instruction is a sentence, and
                  a sentence in a 120px box beside four buttons goes unread. */}
              <input
                className="input cstudio__regen-note"
                value={regenNote}
                onChange={(e) => setRegenNote(e.target.value)}
                placeholder="What should change? e.g. warmer light, add the terrace, make the offer bigger"
                aria-label="What to change when regenerating"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) void actOnPiece(selectedPiece, 'regenerate')
                }}
              />
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
