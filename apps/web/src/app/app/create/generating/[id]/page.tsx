'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner, LoadingScreen } from '@/components/ui'
import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, StatusPill, StatusRail, toStatus } from '@/components/status'
import {
  buildBriefFromDraft,
  fetchAssets,
  fetchCampaignById,
  readDraft,
  upsertDraft,
  type Asset,
  type Campaign,
  type CampaignPlan,
} from '@/components/campaign-studio'

const STRATEGY_CHECKLIST = [
  'Analysing your market',
  'Researching competitors',
  'Building the funnel',
  'Allocating budget',
  'Drafting the schedule',
] as const

export default function GeneratingPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <GeneratingInner />
    </Suspense>
  )
}

function GeneratingInner() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const id = params.id
  const phase = search.get('phase') === 'strategy' ? 'strategy' : 'assets'

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [checkIdx, setCheckIdx] = useState(0)
  const [planning, setPlanning] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)

  const draft = phase === 'strategy' ? readDraft(id) : null
  const isDraftRoute = phase === 'strategy' && draft !== null

  useEffect(() => {
    if (phase !== 'strategy' || !isDraftRoute) return
    let cancelled = false
    const timers: number[] = []

    STRATEGY_CHECKLIST.forEach((_, i) => {
      timers.push(
        window.setTimeout(
          () => {
            if (!cancelled) setCheckIdx(i)
          },
          i * 900 + 400,
        ),
      )
    })

    async function runPlan() {
      const d = readDraft(id)
      if (!d) return
      if (d.plan) {
        timers.push(
          window.setTimeout(
            () => {
              if (!cancelled) router.replace(`/app/create/strategy/${id}`)
            },
            STRATEGY_CHECKLIST.length * 900 + 600,
          ),
        )
        return
      }
      const brief = buildBriefFromDraft(d)
      if (brief.trim().length < 4) return
      setPlanning(true)
      try {
        const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
        upsertDraft(id, { brief, plan })
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'Could not build the plan')
      } finally {
        setPlanning(false)
        timers.push(
          window.setTimeout(() => {
            if (!cancelled) router.replace(`/app/create/strategy/${id}`)
          }, 800),
        )
      }
    }

    void runPlan()

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [phase, isDraftRoute, id, router, toast])

  const reloadAssets = useCallback(async () => {
    const [c, a] = await Promise.all([fetchCampaignById(id), fetchAssets(id)])
    if (c) setCampaign(c)
    else setCampaign({ id, name: 'Campaign' })
    setAssets(a)
  }, [id])

  useEffect(() => {
    if (phase === 'strategy' && isDraftRoute) return
    let cancelled = false
    async function tick() {
      const [c, a] = await Promise.all([fetchCampaignById(id), fetchAssets(id)])
      if (cancelled) return
      if (c) setCampaign(c)
      else setCampaign({ id, name: 'Campaign' })
      setAssets(a)
    }
    void tick()
    const interval = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [id, phase, isDraftRoute])

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>()
    for (const a of assets ?? []) {
      const p = a.platform.toUpperCase()
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(a)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [assets])

  const generatedCount = (assets ?? []).filter((a) => a.status !== 'FAILED').length
  const firstGroupComplete = grouped.some(([, items]) =>
    items.some((a) => a.status !== 'FAILED' && a.body.trim().length > 0),
  )

  async function retryAsset(assetId: string) {
    setRetrying(assetId)
    try {
      await api.post(`/campaign-assets/${assetId}/regenerate`, {})
      await reloadAssets()
      toast.push('success', 'Regeneration started')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Retry failed')
    } finally {
      setRetrying(null)
    }
  }

  if (phase === 'strategy' && isDraftRoute) {
    return (
      <FadeIn className="gen-strategy" style={{ maxWidth: 480, margin: '48px auto', padding: 16 }}>
        <div className="row" style={{ gap: 10, marginBottom: 8 }}>
          <Icon name="sparkles" size={18} style={{ color: 'var(--iris-600)' }} />
          <div
            className="dim"
            style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Planning your campaign
          </div>
        </div>
        <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Building your strategy
        </h1>
        <p className="muted mono" style={{ marginBottom: 28, fontSize: 13 }}>
          ~{Math.max(15, 45 - checkIdx * 8)}s remaining
        </p>
        <ul className="gen-checklist">
          {STRATEGY_CHECKLIST.map((label, i) => {
            const done = i < checkIdx
            const current = i === checkIdx
            return (
              <li
                key={label}
                className={`gen-checklist__item${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
              >
                <span className="gen-checklist__tick" aria-hidden>
                  {done ? '✓' : i + 1}
                </span>
                {label}
              </li>
            )
          })}
        </ul>
        {planning ? (
          <div className="row" style={{ gap: 8, marginTop: 24 }}>
            <Spinner />
            <span className="dim" style={{ fontSize: 13 }}>
              Calling the planner…
            </span>
          </div>
        ) : null}
        <div style={{ marginTop: 32 }}>
          <Link className="btn ghost sm" href="/app/create">
            Cancel
          </Link>
        </div>
      </FadeIn>
    )
  }

  const reviewHref = `/app/campaigns/${id}/assets`

  return (
    <FadeIn className="gen-assets" style={{ padding: '24px 16px 48px' }}>
      <div className="spread" style={{ marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <Icon name="sparkles" size={18} style={{ color: 'var(--iris-600)' }} />
            <div
              className="dim"
              style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Generating assets
            </div>
          </div>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>
            {campaign?.name ?? 'Your campaign'}
          </h1>
        </div>
        <div className="mono gen-counter">
          {generatedCount} generated
          {(assets?.length ?? 0) > generatedCount ? ` · ${assets!.length} total` : ''}
        </div>
      </div>

      {assets === null ? (
        <div className="state">
          <Spinner />
        </div>
      ) : assets.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="muted">
            Assets are still generating. This page refreshes automatically every few seconds.
          </p>
        </div>
      ) : (
        <div className="gen-grid">
          {grouped.map(([platform, items]) => (
            <section key={platform} className="gen-group">
              <h2 className="gen-group__title row" style={{ gap: 8 }}>
                <PlatformIcon platform={platform} size={18} />
                {platform.charAt(0) + platform.slice(1).toLowerCase()}
                <span className="dim mono" style={{ fontSize: 12 }}>
                  {items.filter((a) => a.status !== 'FAILED').length}/{items.length}
                </span>
              </h2>
              <div className="gen-group__cards">
                {items.map((a) => (
                  <FadeIn key={a.id} delay={0.05}>
                    <StatusRail
                      status={a.status === 'FAILED' ? 'failed' : 'ai-draft'}
                      className="gen-card card"
                    >
                      <div className="gen-card__head spread">
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{kindLabel(a.kind)}</span>
                        <StatusPill status={toStatus(a.status)} />
                      </div>
                      <p className="muted gen-card__body" style={{ fontSize: 13 }}>
                        {a.body.slice(0, 160)}
                        {a.body.length > 160 ? '…' : ''}
                      </p>
                      {a.status === 'FAILED' ? (
                        <div className="gen-card__fail">
                          <span className="dim" style={{ fontSize: 12 }}>
                            Couldn&apos;t generate
                          </span>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={retrying === a.id}
                            onClick={() => void retryAsset(a.id)}
                          >
                            {retrying === a.id ? <Spinner /> : 'Retry'}
                          </button>
                        </div>
                      ) : null}
                    </StatusRail>
                  </FadeIn>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 28, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={() => router.push('/app/create')}>
          Back to Create
        </button>
        <Link
          className={`btn primary${firstGroupComplete ? '' : ' is-disabled'}`}
          href={firstGroupComplete ? reviewHref : '#'}
          aria-disabled={!firstGroupComplete}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            if (!firstGroupComplete) e.preventDefault()
          }}
        >
          Review assets →
        </Link>
      </div>
    </FadeIn>
  )
}
