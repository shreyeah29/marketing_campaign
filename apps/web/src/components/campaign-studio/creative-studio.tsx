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

/**
 * The sheet can show one medium or all of them.
 *
 * `all` exists because the split was a consequence of the rail, not of the work:
 * a column 280px wide could only hold one list, so posters and videos became
 * tabs. A grid has room for both, and most campaigns are small enough that
 * splitting six creatives across three tabs hides more than it organises.
 */
type MediumTab = PieceMedium | 'all'

/** Statuses that mean a piece has already been decided on. */
const TERMINAL = new Set(['APPROVED', 'PUBLISHED', 'SCHEDULED', 'PUBLISHING'])

/** Lower-case for use mid-sentence in the empty states. */
const MEDIUM_NOUN: Record<MediumTab, string> = {
  poster: 'posters',
  video: 'videos',
  copy: 'copy',
  all: 'creatives',
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
  const [medium, setMedium] = useState<MediumTab>('poster')
  /**
   * Which pieces a batch action will run on, by piece id.
   *
   * Cleared whenever the medium or filter changes. A selection that outlives the
   * filter it was made under is a way to approve something nobody looked at —
   * the tiles leave the screen, the count stays, and Approve 5 acts on two
   * things you can no longer see.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Anchor for shift-click, over the filtered order rather than the full set. */
  const anchorRef = useRef<string | null>(null)
  /** Progress while a batch runs, so the button can count rather than spin. */
  const [batch, setBatch] = useState<{ verb: string; done: number; total: number } | null>(null)
  const [batchNote, setBatchNote] = useState(false)
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
  // not open on an empty Posters tab and read as "nothing was generated" — and a
  // campaign with posters *and* videos opens on All, because with a grid there
  // is no longer a reason to see half of it at a time.
  const settledRef = useRef(false)
  useEffect(() => {
    if (settledRef.current || pieces.length === 0) return
    settledRef.current = true
    const occupied = MEDIUMS.filter(([id]) => byMedium[id].length > 0)
    if (occupied.length > 1) {
      setMedium('all')
      return
    }
    setMedium(occupied[0]?.[0] ?? 'poster')
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

  /** Everything in the chosen medium, before the status filter. */
  const scoped = useMemo(
    () => (medium === 'all' ? pieces : byMedium[medium]),
    [medium, pieces, byMedium],
  )

  const filtered = useMemo(() => {
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
  }, [scoped, filter])

  /** Counts for the filter chips, so a chip says what it will show. */
  const filterCounts = useMemo(() => {
    const approved = scoped.filter((p) =>
      p.assets.every(
        (a) => a.status === 'APPROVED' || a.status === 'PUBLISHED' || a.status === 'SCHEDULED',
      ),
    ).length
    const review = scoped.filter((p) =>
      ['GENERATED', 'NEEDS_REVIEW', 'DRAFT', 'REJECTED'].includes(pieceStatus(p)),
    ).length
    return { all: scoped.length, approved, review }
  }, [scoped])

  /**
   * The piece being looked at, or null for the sheet.
   *
   * No longer falls back to the first filtered piece. With a rail, something had
   * to be in the stage or the right-hand two thirds of the screen were blank; a
   * sheet *is* the content, so opening one is a deliberate act and the default is
   * to show all of them. The fallback also had a bug in it: the stage would open
   * on whatever happened to sort first, which changes as pieces are approved.
   */
  const selectedPiece = useMemo(() => {
    if (!selectedAssetId) return null
    return pieces.find((p) => p.assets.some((a) => a.id === selectedAssetId)) ?? null
  }, [pieces, selectedAssetId])

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
          m != null &&
          m.kind === 'IMAGE_PROMPT' &&
          !m.mediaUrl &&
          m.status !== 'REJECTED' &&
          /**
           * A concept that already failed is not started again on its own.
           *
           * `startedRef` only remembers within one mount, so before failures were
           * recorded, reopening this screen re-fired every generation that had
           * gone wrong — against a provider that had just refused, for a fee, on
           * every single page load. The retry button is deliberate; an effect
           * firing on mount is not.
           */
          m.status !== 'FAILED',
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

  /**
   * A selection belongs to the view it was made in.
   *
   * Changing medium or filter takes tiles off the screen, and a count that
   * survives that is a batch acting on things nobody can see — the exact way
   * something gets approved without being looked at.
   */
  useEffect(() => {
    setSelected(new Set())
    anchorRef.current = null
  }, [medium, filter])

  /**
   * Select all in view, or clear.
   *
   * Scoped to `filtered` for the same reason the shift-range is: "all" means
   * what is on the screen, not what exists.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelected(new Set())
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        // Not while typing: ⌘A in the redraw note means select the text.
        const el = e.target as HTMLElement | null
        if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return
        e.preventDefault()
        setSelected(new Set(filtered.map((p) => p.id)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered])

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

  type PieceAction = 'approve' | 'reject' | 'regenerate' | 'duplicate' | 'generate'

  /**
   * The work itself: no toast, no reload, throws on failure.
   *
   * Split out so a batch can run the identical code path per piece without a
   * toast and a refetch after each one. Ten approvals used to mean ten toasts
   * and ten reloads of the whole campaign — the reload racing the next request,
   * and the toasts stacking into a column nobody reads. The batch collects, then
   * reports once.
   *
   * Returns the sentence to show when this runs on its own.
   */
  async function performAction(piece: ContentPiece, action: PieceAction): Promise<string | null> {
    if (action === 'generate') {
      // Render the creative so it can be judged on sight. Deliberately does
      // not approve anything — the reviewer decides after seeing it.
      const target = piece.master
      if (!target) return null
      // `force` because this is a deliberate click asking for something
      // different. The automatic path below never sends it, which is what
      // makes a remount cost nothing instead of a new generation.
      await api.post(`/campaign-assets/${target.id}/generate-media`, {
        variants: 1,
        force: true,
      })
      return target.kind === 'VIDEO_PROMPT'
        ? 'Rendering the video — this takes a few minutes'
        : 'Generating the creative — this takes a moment'
    }
    if (action === 'approve') {
      // Poster first (may chain Runway), then adaptations
      const ordered = piece.master ? [piece.master, ...piece.adaptations] : piece.adaptations
      let generated = 0
      let waiting = 0
      for (const a of ordered) {
        if (TERMINAL.has(a.status)) continue
        /**
         * A concept with no picture cannot be approved, and must not take the
         * rest of the piece down with it.
         *
         * This loop threw on the first asset the API refused, so one variant
         * that never rendered blocked approval of the poster and every caption
         * beside it — all of them fine, and visible on screen.
         */
        const isArtwork = a.kind === 'IMAGE_PROMPT' || a.kind === 'VIDEO_PROMPT'
        if (isArtwork && !a.mediaUrl) {
          waiting++
          continue
        }
        const result = await approveCampaignAsset(a)
        if (result === 'generated') generated++
      }
      if (generated > 0) return 'Poster generating — adaptations approved'
      return waiting > 0
        ? `Approved — ${String(waiting)} still waiting on a picture`
        : 'Piece approved'
    }
    if (action === 'reject') {
      for (const a of piece.assets) {
        if (a.status === 'REJECTED') continue
        await api.post(`/campaign-assets/${a.id}/reject`, {})
      }
      return 'Piece rejected'
    }
    if (action === 'regenerate') {
      const target = piece.master ?? activeAdaptation
      if (!target) return null
      const instruction = regenNote.trim()
      await api.post(`/campaign-assets/${target.id}/regenerate`, instruction ? { instruction } : {})
      return instruction ? 'Redrawing with your change' : 'Regenerating…'
    }
    const target = piece.master ?? activeAdaptation
    if (!target) return null
    await api.post(`/campaign-assets/${target.id}/duplicate`, {})
    return 'Duplicated'
  }

  /** One piece, one toast, one reload. */
  async function actOnPiece(piece: ContentPiece, action: PieceAction) {
    setBusy(true)
    try {
      const note = await performAction(piece, action)
      if (action === 'regenerate') setRegenNote('')
      if (note) toast.push('success', note)
      reload()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${action} failed`)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Whether a batch action would do anything to this piece.
   *
   * Used for the button's count, so "Approve 3" means three things will change.
   * Counting five when two are already approved makes the number a lie about
   * the work, and the two are skipped inside `performAction` anyway.
   */
  function wouldAct(piece: ContentPiece, action: PieceAction): boolean {
    if (action === 'approve') return piece.assets.some((a) => !TERMINAL.has(a.status))
    if (action === 'reject') return piece.assets.some((a) => a.status !== 'REJECTED')
    // Redrawing needs artwork to redraw. In a batch there is no open piece to
    // fall back to, so a copy-only tile would be counted and then do nothing.
    if (action === 'regenerate' || action === 'generate') return piece.master != null
    return true
  }

  const chosen = useMemo(() => filtered.filter((p) => selected.has(p.id)), [filtered, selected])
  /**
   * How many the button will actually change.
   *
   * "Approve 5" over a selection where two are already approved is a number
   * that misdescribes the work — the two are skipped inside `performAction`
   * either way, so the label should not have counted them.
   */
  const approvable = chosen.filter((p) => wouldAct(p, 'approve')).length
  const rejectable = chosen.filter((p) => wouldAct(p, 'reject')).length

  /**
   * Run one action across the selection, one piece at a time.
   *
   * Sequential, and not as a matter of taste: approving a poster chains a Runway
   * generation, and firing five at once hits the provider's rate limit and fails
   * most of them on a limit that means "wait" rather than "no".
   *
   * One failure does not abort the rest — the other four had nothing wrong with
   * them, and stopping at the first would leave the batch half-applied with no
   * record of where it stopped. Failures are collected and reported once.
   */
  async function runBatch(action: PieceAction, verb: string) {
    const targets = chosen.filter((p) => wouldAct(p, action))
    if (targets.length === 0 || batch) return

    const failures: string[] = []
    setBatch({ verb, done: 0, total: targets.length })
    for (const [i, piece] of targets.entries()) {
      setBatch({ verb, done: i + 1, total: targets.length })
      try {
        await performAction(piece, action)
      } catch (e) {
        failures.push(e instanceof ApiError ? e.message : `${piece.label} failed`)
      }
    }
    setBatch(null)
    if (action === 'regenerate') {
      setRegenNote('')
      setBatchNote(false)
    }

    const done = targets.length - failures.length
    if (failures.length === 0) {
      toast.push(
        'success',
        `${String(done)} ${done === 1 ? 'piece' : 'pieces'} ${verb.toLowerCase()}d`,
      )
    } else {
      // The first reason rather than a bare count: five identical rate-limit
      // failures and five different ones need different responses, and a number
      // alone cannot tell them apart.
      toast.push(
        'error',
        `${String(failures.length)} of ${String(targets.length)} failed — ${failures[0] ?? ''}`,
      )
    }
    setSelected(new Set())
    reload()
  }

  /**
   * Toggle one tile, or extend from the last one when shift is held.
   *
   * The range runs over `filtered`, which is what is on screen — a range over
   * the full set would select tiles behind the current filter.
   */
  function toggleSelection(piece: ContentPiece, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      const anchor = anchorRef.current
      if (shift && anchor && anchor !== piece.id) {
        const from = filtered.findIndex((p) => p.id === anchor)
        const to = filtered.findIndex((p) => p.id === piece.id)
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from]
          for (const p of filtered.slice(lo, hi + 1)) next.add(p.id)
          return next
        }
      }
      if (next.has(piece.id)) next.delete(piece.id)
      else next.add(piece.id)
      return next
    })
    anchorRef.current = piece.id
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
  /**
   * Why this tile is empty, preferring the reason that survives a reload.
   *
   * `blocked` is this session's error and disappears the moment the screen is
   * closed; `failureReason` is what the API wrote on the asset. Reaching for the
   * stored one first is the whole point — a poster that failed last night should
   * still be able to say so this morning, rather than reverting to
   * "Rendering this poster…" and looking like it is still working.
   */
  const stallReason = selectedPiece?.master?.failureReason ?? blocked
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
      {/* ── Toolbar ──────────────────────────────────────────────────────
          One line instead of three stacked rows in a column. The medium split
          and the status filter were a consequence of the rail's width, not of
          the work — a grid has room for both kinds at once, which is why All
          exists and is the default whenever more than one has content. */}
      <div className="cstudio__toolbar">
        <div className="cstudio__mediums" role="tablist" aria-label="Creative type">
          {(
            [
              ['all', 'All', pieces.length],
              ...MEDIUMS.filter(([id]) => byMedium[id].length > 0).map(
                ([id, label]) => [id, label, byMedium[id].length] as const,
              ),
            ] as readonly (readonly [MediumTab, string, number])[]
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`cstudio__medium${medium === id ? ' is-on' : ''}`}
              aria-selected={medium === id}
              onClick={() => setMedium(id)}
            >
              {label}
              <span className="cstudio__medium-count">{count}</span>
            </button>
          ))}
        </div>

        <div className="cstudio__filters" role="tablist" aria-label="Status">
          {(
            [
              ['review', 'Needs review', filterCounts.review],
              ['approved', 'Approved', filterCounts.approved],
              ['all', 'All', filterCounts.all],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`cstudio__filter${filter === id ? ' is-on' : ''}`}
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span className="cstudio__filter-count">{count}</span>
            </button>
          ))}
        </div>

        <div className="cstudio__toolbar-end">
          {pending > 0 ? (
            <span className="cstudio__rendering">
              <Spinner />
              {pending} rendering
            </span>
          ) : null}
          {/* Grid is the only view built. Rendered rather than hidden so the
              control does not appear later as though it were new, and disabled
              rather than inert so nobody presses it expecting a list. */}
          <div className="cstudio__views" role="group" aria-label="Layout">
            <button
              type="button"
              className="cstudio__view is-on"
              aria-pressed
              aria-label="Grid view"
              title="Grid"
            >
              <Icon name="grid" size={14} />
            </button>
            <button
              type="button"
              className="cstudio__view"
              disabled
              aria-label="List view"
              title="List view — not built yet"
            >
              <Icon name="menu" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Contact sheet ────────────────────────────────────────────────
          The creatives are the content now. A campaign with one poster wastes
          no column on it, and one with twelve shows twelve. */}
      {filtered.length === 0 ? (
        <div className="cstudio__sheet-empty">
          {scoped.length === 0 ? (
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
                  Show all {scoped.length}
                </button>
              }
            />
          )}
        </div>
      ) : (
        <ul className="cstudio__sheet">
          {filtered.map((piece) => (
            <Tile
              key={piece.id}
              piece={piece}
              selected={selected.has(piece.id)}
              blocked={blocked}
              busy={busy || batch !== null}
              onToggle={(shift) => toggleSelection(piece, shift)}
              onOpen={() => selectPiece(piece)}
              onGenerate={() => void actOnPiece(piece, 'generate')}
            />
          ))}
        </ul>
      )}

      {/* ── Batch bar ────────────────────────────────────────────────────
          Only when something is selected. A permanent bar holding disabled
          buttons is a row of things that never work. */}
      {chosen.length > 0 ? (
        <div className="cstudio__batch" role="region" aria-label="Batch actions">
          <div className="cstudio__batch-count">
            <strong>{chosen.length}</strong> selected
            <span className="type-caption">
              Shift-click for a range · ⌘A selects this view · Esc clears
            </span>
          </div>

          {batchNote ? (
            <input
              className="input cstudio__batch-note"
              value={regenNote}
              autoFocus
              onChange={(e) => setRegenNote(e.target.value)}
              placeholder="What should change on all of them? e.g. warmer light, bigger offer"
              aria-label="What to change when redrawing the selection"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !batch) void runBatch('regenerate', 'Redraw')
              }}
            />
          ) : null}

          <div className="cstudio__batch-actions">
            <button
              type="button"
              className="btn primary"
              disabled={batch !== null || approvable === 0}
              onClick={() => void runBatch('approve', 'Approve')}
            >
              {batch?.verb === 'Approve' ? (
                <>
                  <Spinner /> Approving {batch.done} of {batch.total}…
                </>
              ) : (
                <>
                  <Icon name="check" size={14} /> Approve {approvable}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn"
              disabled={batch !== null || rejectable === 0}
              onClick={() => void runBatch('reject', 'Reject')}
            >
              {batch?.verb === 'Reject' ? (
                <>
                  <Spinner /> Rejecting {batch.done} of {batch.total}…
                </>
              ) : (
                <>
                  <Icon name="x" size={14} /> Reject {rejectable}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn"
              disabled={batch !== null}
              onClick={() => {
                if (!batchNote) setBatchNote(true)
                else void runBatch('regenerate', 'Redraw')
              }}
            >
              {batch?.verb === 'Redraw' ? (
                <>
                  <Spinner /> Redrawing {batch.done} of {batch.total}…
                </>
              ) : (
                <>
                  <Icon name="refresh" size={14} />
                  {batchNote ? `Redraw ${String(chosen.length)}` : 'Redraw with a note'}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={batch !== null}
              onClick={() => {
                const first = chosen[0]
                if (first) selectPiece(first)
              }}
            >
              <Icon name="external-link" size={14} /> Open first
            </button>
          </div>
        </div>
      ) : null}

      {/* ── The one piece, opened ────────────────────────────────────────
          Unchanged: the same canvas, platform tabs, caption panel and
          compliance note. This task removed the list rail, not the detail
          view. It renders only for an explicitly opened asset — the sheet is
          what you get otherwise, and the empty states live there. */}
      {selectedPiece ? (
        <main className="cstudio__stage">
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
                      : stallReason
                        ? `This ${isVideo ? 'video' : 'poster'} could not be rendered`
                        : isVideo
                          ? 'Ready to render'
                          : 'Rendering this poster…'}
                  </p>
                  <p className="type-secondary" style={{ margin: 0, maxWidth: '42ch' }}>
                    {!selectedPiece.master
                      ? 'This group came back as captions only — the plan produced no image concept for it.'
                      : (stallReason ??
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
                      className={`btn${isVideo && !stallReason ? ' primary' : ''}`}
                      style={{ marginTop: 16 }}
                      disabled={busy}
                      onClick={() => void actOnPiece(selectedPiece, 'generate')}
                    >
                      {busy ? (
                        <Spinner />
                      ) : (
                        <Icon name={isVideo && !stallReason ? 'play' : 'refresh'} size={14} />
                      )}
                      {isVideo && !stallReason ? 'Render this video' : 'Try again'}
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
        </main>
      ) : null}

      {drawer}
    </div>
  )
}

/**
 * One creative in the contact sheet.
 *
 * Three states have to be tellable apart without clicking, because the whole
 * point of a sheet is surveying twelve at once: still rendering, failed, and —
 * for video — never started. Each carries its own reason on the tile rather than
 * behind it, so nothing requires opening a piece to find out why it is blank.
 *
 * The failure reason prefers `failureReason` over the session's `blocked`. One
 * is written on the asset and survives a reload; the other disappears with the
 * tab, and a poster that failed last night should still say so this morning
 * instead of reverting to "Rendering…" and looking like it is still working.
 */
function Tile({
  piece,
  selected,
  blocked,
  busy,
  onToggle,
  onOpen,
  onGenerate,
}: {
  piece: ContentPiece
  selected: boolean
  blocked: string | null
  busy: boolean
  onToggle: (shift: boolean) => void
  onOpen: () => void
  onGenerate: () => void
}) {
  const medium = pieceMedium(piece)
  const preview = piecePreviewUrl(piece)
  const master = piece.master
  const isVideo = medium === 'video'
  const failure = master?.failureReason ?? (master?.status === 'FAILED' ? blocked : null)
  // A video is not "rendering" while it waits — nothing was started. Saying so
  // is the difference between a tile you should wait on and one you must press.
  const waiting = !preview && !failure && master != null && !isVideo
  const platforms = piecePlatforms(piece)

  return (
    <li className="cstudio__tile" data-selected={selected ? 'true' : undefined}>
      <div className="cstudio__tile-media" data-medium={medium}>
        <button
          type="button"
          className="cstudio__tile-hit"
          onClick={isVideo && !preview && !failure ? onGenerate : onOpen}
          aria-label={
            isVideo && !preview && !failure ? `Render ${piece.label}` : `Open ${piece.label}`
          }
        >
          {preview ? (
            isVideo ? (
              // Muted and preloaded to a frame: a poster image for a video the
              // API does not store one for, without autoplaying twelve at once.
              <video src={preview} muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" loading="lazy" />
            )
          ) : (
            <span className="cstudio__tile-state">
              {failure ? (
                <Icon name="alert-triangle" size={20} />
              ) : waiting ? (
                <Spinner />
              ) : isVideo ? (
                <Icon name="play" size={22} />
              ) : (
                <Icon name="file-text" size={20} />
              )}
              <span className="type-caption">
                {failure
                  ? 'Could not render'
                  : waiting
                    ? 'Rendering…'
                    : isVideo
                      ? 'Ready to render'
                      : 'Copy only'}
              </span>
            </span>
          )}
        </button>

        {/* Outside the hit target rather than inside it: a button within a
            button is invalid, and the checkbox must not open the piece. */}
        <button
          type="button"
          className="cstudio__tile-check"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${piece.label}`}
          onClick={(e) => onToggle(e.shiftKey)}
        >
          {selected ? <Icon name="check" size={12} /> : null}
        </button>

        <span className="cstudio__tile-status">
          <StatusPill status={toStatus(pieceStatus(piece))} />
        </span>

        {/* No duration: the API does not store one, and a plausible "0:09"
            under a video nobody has timed is a number invented to fill a
            corner. The shape is known. */}
        {isVideo ? <span className="cstudio__tile-ratio">9:16</span> : null}
      </div>

      <p className="cstudio__tile-label">{piece.label}</p>

      {failure ? (
        /* The reason, and the way out, in the line that would otherwise hold
           the platform. A failed tile has nothing useful to say about aspect
           ratios. */
        <button
          type="button"
          className="cstudio__tile-meta is-failed"
          disabled={busy}
          onClick={onGenerate}
          title={failure}
        >
          <Icon name="refresh" size={12} />
          Provider refused · try again
        </button>
      ) : (
        <p className="cstudio__tile-meta">
          {isVideo ? (
            <>
              <Icon name="video" size={12} />
              Reels · costs minutes
            </>
          ) : (
            <>
              {platforms[0] ? <PlatformIcon platform={platforms[0]} size={12} /> : null}
              {platforms.length > 1
                ? `${String(platforms.length)} platforms`
                : platforms[0]
                  ? platformLabel(platforms[0])
                  : kindLabel(master?.kind ?? piece.assets[0]?.kind ?? '')}
              {medium === 'poster' ? ' · 4:5' : ''}
            </>
          )}
        </p>
      )}
    </li>
  )
}

/** @deprecated Use CreativeStudio — kept as alias for imports. */
export const ReviewQueue = CreativeStudio
