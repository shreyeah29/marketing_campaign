'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { ApiError, api } from '@/lib/api'
import { FadeIn } from '@/components/motion'
import { Icon, type IconName } from '@/components/icon'
import { LoadingScreen, Spinner } from '@/components/ui'
import {
  fetchAssets,
  fetchCampaignById,
  type Asset,
  type Campaign,
} from '@/components/campaign-studio'

/**
 * Generation run — step 4 of six.
 *
 * The run belongs to the server, and this screen only reports it. That is the
 * whole design: close the tab mid-run and the work carries on, because it is a
 * campaign and a set of asset rows in Postgres, not a timer in a browser.
 * Coming back re-reads that state and shows where the run actually is.
 *
 * The previous version of this screen animated a five-step checklist on
 * `setTimeout`, which meant reloading restarted the story from the beginning
 * while the real run was two thirds done. Every row below is derived from asset
 * status instead. Nothing here is on a timer except the poll.
 *
 * A failed asset retries twice and then stops, staying FAILED so it surfaces in
 * the review queue marked for a redo. It never holds up the rest: the retry is
 * per asset, and the other twenty-two finish regardless.
 */

/** How many times this screen will re-ask for one failed asset. */
const MAX_RETRIES = 2
const POLL_MS = 2500

const STEPS = ['Brief', 'Intake', 'Plan', 'Generate', 'Review', 'Publish'] as const

type RowState = 'done' | 'running' | 'queued' | 'failed'

interface LogRow {
  key: string
  label: string
  state: RowState
  detail: string
}

/** Kinds that carry rendered artwork, so a missing `mediaUrl` means unfinished. */
const VISUAL_KINDS = new Set(['IMAGE_PROMPT', 'VIDEO_PROMPT'])

function isDone(a: Asset): boolean {
  if (a.status === 'FAILED') return false
  if (VISUAL_KINDS.has(a.kind)) return Boolean(a.mediaUrl)
  return a.body.trim().length > 0
}

/**
 * The run log, derived from asset rows.
 *
 * Grouped by kind rather than listed per asset: "10 posters composed" is the
 * sentence someone wants, and twenty-three rows scrolling past is not. Each
 * group reports the truth of its members — all done, some in flight, none
 * started, or some failed after retries.
 */
function buildLog(assets: Asset[], attempts: Map<string, number>): LogRow[] {
  const groups: { key: string; kinds: string[]; label: (n: number) => string }[] = [
    {
      key: 'copy',
      kinds: ['POST'],
      label: (n) => `${String(n)} post${n === 1 ? '' : 's'} written`,
    },
    {
      key: 'posters',
      kinds: ['IMAGE_PROMPT'],
      label: (n) => `${String(n)} poster${n === 1 ? '' : 's'} composed`,
    },
    {
      key: 'videos',
      kinds: ['VIDEO_PROMPT'],
      label: (n) => `${String(n)} video concept${n === 1 ? '' : 's'} rendered`,
    },
    {
      key: 'ads',
      kinds: ['AD_COPY', 'AD_HEADLINE', 'AD_DESCRIPTION'],
      label: (n) => `${String(n)} ad copy set${n === 1 ? '' : 's'}`,
    },
  ]

  const rows: LogRow[] = []
  for (const g of groups) {
    const members = assets.filter((a) => g.kinds.includes(a.kind))
    if (members.length === 0) continue

    const done = members.filter(isDone)
    const failed = members.filter(
      (a) => a.status === 'FAILED' && (attempts.get(a.id) ?? 0) >= MAX_RETRIES,
    )
    const pending = members.filter((a) => !isDone(a) && a.status !== 'FAILED')

    let state: RowState
    let detail: string
    if (failed.length > 0 && done.length + failed.length === members.length) {
      state = 'failed'
      detail = `${String(failed.length)} for redo`
    } else if (pending.length === 0 && failed.length === 0) {
      state = 'done'
      detail = 'done'
    } else if (done.length > 0 || pending.length < members.length) {
      state = 'running'
      detail = `${String(done.length)} of ${String(members.length)}`
    } else {
      state = 'queued'
      detail = 'queued'
    }

    rows.push({ key: g.key, label: g.label(members.length), state, detail })
  }
  return rows
}

const ROW_ICON: Record<RowState, IconName> = {
  done: 'check-circle',
  running: 'refresh',
  queued: 'circle',
  failed: 'alert-triangle',
}

export default function GeneratingPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RunInner />
    </Suspense>
  )
}

function RunInner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = params.id

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Retry counts, per asset, for this visit.
   *
   * Deliberately not persisted. The count exists to stop this screen asking the
   * same failed asset forever; a fresh visit is a fresh judgement, and the
   * explicit Retry in the review queue is the durable path for a redo.
   */
  const attempts = useRef<Map<string, number>>(new Map())
  const retrying = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([fetchCampaignById(campaignId), fetchAssets(campaignId)])
      setCampaign(c ?? { id: campaignId, name: 'Campaign' })
      setAssets(a)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not read the run')
    }
  }, [campaignId])

  // The only timer on the screen. It reads server state; it does not advance a
  // story of its own.
  useEffect(() => {
    let cancelled = false
    void load()
    const t = window.setInterval(() => {
      if (!cancelled) void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [load])

  /**
   * Retry failed assets, twice each, one at a time.
   *
   * Sequential on purpose — a burst of regenerations against the provider is
   * how you turn one failure into a rate-limit and several. Nothing waits on
   * this: assets that are fine keep arriving while a failed one is re-asked.
   */
  useEffect(() => {
    if (!assets) return
    const candidate = assets.find(
      (a) =>
        a.status === 'FAILED' &&
        (attempts.current.get(a.id) ?? 0) < MAX_RETRIES &&
        !retrying.current.has(a.id),
    )
    if (!candidate) return

    retrying.current.add(candidate.id)
    attempts.current.set(candidate.id, (attempts.current.get(candidate.id) ?? 0) + 1)
    void (async () => {
      try {
        await api.post(`/campaign-assets/${candidate.id}/regenerate`, {})
        await load()
      } catch {
        // Swallowed by design: a retry that fails is what the attempt counter is
        // counting. After the second, the asset stays FAILED and the review
        // queue owns it.
      } finally {
        retrying.current.delete(candidate.id)
      }
    })()
  }, [assets, load])

  const log = useMemo(() => buildLog(assets ?? [], attempts.current), [assets])

  const total = assets?.length ?? 0
  const done = (assets ?? []).filter(isDone).length
  const forRedo = (assets ?? []).filter(
    (a) => a.status === 'FAILED' && (attempts.current.get(a.id) ?? 0) >= MAX_RETRIES,
  ).length
  const settled = done + forRedo
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0
  const finished = total > 0 && settled === total

  const ready = (assets ?? []).filter((a) => VISUAL_KINDS.has(a.kind) && a.mediaUrl)
  const stillRendering = (assets ?? []).filter(
    (a) => VISUAL_KINDS.has(a.kind) && !a.mediaUrl && a.status !== 'FAILED',
  ).length

  if (assets === null && error === null) return <LoadingScreen />

  return (
    <FadeIn style={{ maxWidth: 1100 }}>
      <div className="step-rail">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className="step-chip"
            data-state={i < 3 ? 'done' : i === 3 ? 'current' : 'todo'}
          >
            {i + 1} {label.toUpperCase()}
            {i < 3 ? ' ✓' : ''}
          </span>
        ))}
      </div>

      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
        <div>
          <h1 className="brief-title" style={{ maxWidth: 'none', margin: '0 0 6px' }}>
            {finished
              ? `${String(done)} assets ready`
              : `Generating ${String(total || '')} assets`.trim()}
          </h1>
          <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 14.5 }}>
            {campaign?.name ?? 'Campaign'} · you can leave this page — the run continues on the
            server
          </p>
        </div>
        <span
          className="row"
          style={{
            marginLeft: 'auto',
            gap: 8,
            fontSize: 12.5,
            color: finished ? 'var(--jade-600)' : 'var(--cobalt-600)',
          }}
        >
          {!finished ? <span className="run-pulse" aria-hidden /> : null}
          {String(settled)} of {String(total)} done
        </span>
      </div>

      <div className="batch-bar" style={{ height: 6, margin: '18px 0 24px' }}>
        <div
          className="batch-bar__fill"
          style={{ width: `${String(pct)}%` }}
          {...(finished ? { 'data-done': '' } : {})}
        />
      </div>

      {error ? (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--amber-600)' }}>
            {error} — the run itself is unaffected; this screen will keep trying to read it.
          </p>
        </div>
      ) : null}

      <div className="row" style={{ flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        {/* ── Run log ─────────────────────────────────────────────────────── */}
        <div
          className="card"
          style={{ flex: '2 1 420px', minWidth: 0, padding: 0, overflow: 'hidden' }}
        >
          <div className="panel-head">
            <span className="panel-head__title">Run log</span>
          </div>
          {log.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '16px',
                fontSize: 13,
                color: 'var(--text-tertiary)',
              }}
            >
              Waiting for the first assets to appear.
            </p>
          ) : (
            log.map((r) => (
              <div key={r.key} className="log-row" data-state={r.state}>
                {r.state === 'running' ? (
                  <Spinner />
                ) : (
                  <Icon name={ROW_ICON[r.state]} size={16} className="ico" />
                )}
                <span style={{ flex: 1 }}>{r.label}</span>
                <span className="log-row__when">{r.detail}</span>
              </div>
            ))
          )}
        </div>

        {/* ── Landing as they finish ──────────────────────────────────────── */}
        <div className="card" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div className="panel-head__title" style={{ marginBottom: 12 }}>
            Landing as they finish
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))', gap: 7 }}
          >
            {ready.map((a) => (
              <div key={a.id} className="run-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.mediaUrl ?? ''}
                  alt={a.title ?? 'Generated asset'}
                  crossOrigin="use-credentials"
                  loading="lazy"
                />
              </div>
            ))}
            {stillRendering > 0 ? (
              <div className="run-thumb" data-pending="">
                <Spinner />
              </div>
            ) : null}
            {ready.length === 0 && stillRendering === 0 ? (
              <div className="run-thumb" data-empty="" />
            ) : null}
          </div>

          <Link
            href={`/app/campaigns/${campaignId}/assets`}
            className="rail-action"
            style={{ marginTop: 14, justifyContent: 'center' }}
          >
            Review what is ready
            <Icon name="arrow-right" size={14} />
          </Link>

          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
            A failed asset retries twice, then lands in the queue marked for a redo — the run never
            blocks on one item.
          </p>
          {forRedo > 0 ? (
            <p style={{ fontSize: 11.5, color: 'var(--amber-600)', marginTop: 6 }}>
              {forRedo} {forRedo === 1 ? 'asset needs' : 'assets need'} a redo. Everything else
              finished.
            </p>
          ) : null}
        </div>
      </div>

      {finished ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => router.push(`/app/campaigns/${campaignId}/assets`)}
          >
            Review {done} assets
            <Icon name="arrow-right" size={15} />
          </button>
          <button type="button" className="btn" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      ) : null}
    </FadeIn>
  )
}
