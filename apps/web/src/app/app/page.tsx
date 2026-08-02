'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, api } from '@/lib/api'
import { fetchAssets, fetchCampaigns, type Campaign } from '@/components/campaign-studio'
import { MetricTile, ErrorState, TileSkeleton, CardSkeleton } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { StatusPill, toStatus } from '@/components/status'
import { Icon } from '@/components/icon'

import { useWorkspace } from './layout'

interface Overview {
  contacts: number
  leads: number
  qualifiedLeads: number
  openDeals: number
  wonDeals: number
  activeCampaigns: number
  emailsSent: number
  aiSpendUsd: string
  assetsGenerated: number
  assetsApproved: number
}

interface TimeseriesPoint {
  date: string
  leads: number
  deals: number
  revenue: string
}

interface BoardLead {
  id: string
  status: string
}

interface NotificationRow {
  id: string
  title?: string | null
  body?: string | null
  createdAt?: string
  level?: string | null
}

interface MetaSummary {
  reach?: number
  impressions?: number
  clicks?: number
  spend?: number
  leads?: number
}

function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function firstName(name: string | null | undefined, email: string): string {
  const n = (name ?? '').trim()
  if (n) return n.split(/\s+/)[0] ?? n
  return email.split('@')[0] ?? 'there'
}

function money(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function deltaPct(prev: number, next: number): { dir: 'up' | 'down'; text: string } | null {
  if (prev <= 0 && next <= 0) return null
  if (prev <= 0) return { dir: 'up', text: '+100%' }
  const pct = Math.round(((next - prev) / prev) * 100)
  if (pct === 0) return null
  return { dir: pct > 0 ? 'up' : 'down', text: `${pct > 0 ? '+' : ''}${pct}%` }
}

/**
 * Tenant Home — brief Part 3 screen 3.
 * Zone A brief · Zone B action-required (only if count > 0) · Zone C metrics.
 * Empty org: Zone A becomes first-campaign CTA; B and C omitted.
 */
export default function HomePage() {
  const ws = useWorkspace()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [awaitingReview, setAwaitingReview] = useState(0)
  const [newLeads, setNewLeads] = useState(0)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [meta, setMeta] = useState<MetaSummary | null>(null)
  const [progressByCampaign, setProgressByCampaign] = useState<Record<string, number>>({})
  const [scheduled, setScheduled] = useState<
    { id: string; title: string; when: string; href: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ov, ts, camps, board, notes, metaRes] = await Promise.all([
        api.get<Overview>('/analytics/overview').catch(() => null),
        api.get<{ days: TimeseriesPoint[] }>('/analytics/timeseries?days=30').catch(() => ({
          days: [] as TimeseriesPoint[],
        })),
        fetchCampaigns(),
        api.get<BoardLead[]>('/leads/board').catch(() => [] as BoardLead[]),
        api
          .get<{ data: NotificationRow[] } | NotificationRow[]>('/notifications')
          .then((r) => (Array.isArray(r) ? r : (r.data ?? [])))
          .catch(() => [] as NotificationRow[]),
        api.get<MetaSummary>('/meta/analytics/summary').catch(() => null),
      ])

      setOverview(ov)
      setSeries(ts?.days ?? [])
      setCampaigns(camps)
      setNewLeads(board.filter((l) => l.status === 'NEW').length)
      setNotifications(notes.slice(0, 5))
      setMeta(metaRes)

      // Real awaiting-review count — not assetsGenerated (audit fix).
      const active = camps.filter((c) => {
        const s = (c.status ?? '').toUpperCase()
        return s !== 'ARCHIVED' && s !== 'COMPLETED' && s !== 'DELETED'
      })
      const sample = active.slice(0, 8)
      const assetLists = await Promise.all(sample.map((c) => fetchAssets(c.id)))
      let review = 0
      const progress: Record<string, number> = {}
      const nextScheduled: { id: string; title: string; when: string; href: string }[] = []
      for (let i = 0; i < sample.length; i++) {
        const c = sample[i]
        if (!c) continue
        const assets = assetLists[i] ?? []
        review += assets.filter(
          (a) => a.status === 'GENERATED' || a.status === 'NEEDS_REVIEW',
        ).length
        const approved = assets.filter(
          (a) =>
            a.status === 'APPROVED' ||
            a.status === 'SCHEDULED' ||
            a.status === 'PUBLISHED' ||
            a.status === 'PUBLISHING',
        ).length
        progress[c.id] = assets.length > 0 ? approved / assets.length : 0
        for (const a of assets) {
          if (!a.scheduledFor) continue
          nextScheduled.push({
            id: a.id,
            title: a.title || a.body.slice(0, 40) || a.kind,
            when: a.scheduledFor,
            href: `/app/campaigns/${c.id}/assets/${a.id}`,
          })
        }
      }
      setAwaitingReview(review)
      setProgressByCampaign(progress)
      nextScheduled.sort((a, b) => a.when.localeCompare(b.when))
      setScheduled(nextScheduled.slice(0, 5))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load home')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const name = firstName(ws.user.name, ws.user.email)
  const isEmpty = (campaigns?.length ?? 0) === 0 && (overview?.leads ?? 0) === 0

  const leadSeries = series.map((d) => d.leads)
  const revenueSeries = series.map((d) => Number(d.revenue) || 0)
  const lastLeads = leadSeries.at(-1) ?? 0
  const prevLeads = leadSeries.at(-2) ?? 0
  const lastRev = revenueSeries.at(-1) ?? 0
  const prevRev = revenueSeries.at(-2) ?? 0
  const leadsDelta = deltaPct(prevLeads, lastLeads)
  const revDelta = deltaPct(prevRev, lastRev)

  const briefLines = useMemo(() => {
    const lines: { text: ReactNode; key: string }[] = []
    if (lastLeads > 0 || prevLeads > 0) {
      const d = leadsDelta
      lines.push({
        key: 'leads',
        text: (
          <>
            Yesterday brought <span className="home-brief__num">{lastLeads.toLocaleString()}</span>{' '}
            leads
            {d ? (
              <>
                {' '}
                (
                <span className="home-brief__delta" data-dir={d.dir}>
                  {d.text}
                </span>
                )
              </>
            ) : null}
            .
          </>
        ),
      })
    }
    if (lastRev > 0 || prevRev > 0) {
      const d = revDelta
      lines.push({
        key: 'rev',
        text: (
          <>
            Revenue closed at <span className="home-brief__num">{money(lastRev)}</span>
            {d ? (
              <>
                {' '}
                (
                <span className="home-brief__delta" data-dir={d.dir}>
                  {d.text}
                </span>
                )
              </>
            ) : null}
            .
          </>
        ),
      })
    }
    if (overview?.activeCampaigns) {
      lines.push({
        key: 'camps',
        text: (
          <>
            You have <span className="home-brief__num">{overview.activeCampaigns}</span> active
            campaign{overview.activeCampaigns === 1 ? '' : 's'} running.
          </>
        ),
      })
    }
    if (awaitingReview > 0) {
      lines.push({
        key: 'review',
        text: (
          <>
            <span className="home-brief__num">{awaitingReview}</span> asset
            {awaitingReview === 1 ? '' : 's'} still need your review.
          </>
        ),
      })
    }
    if (newLeads > 0) {
      lines.push({
        key: 'newleads',
        text: (
          <>
            <span className="home-brief__num">{newLeads}</span> new lead
            {newLeads === 1 ? '' : 's'} are waiting in the inbox.
          </>
        ),
      })
    }
    return lines.slice(0, 5)
  }, [
    awaitingReview,
    lastLeads,
    lastRev,
    leadsDelta,
    newLeads,
    overview?.activeCampaigns,
    prevLeads,
    prevRev,
    revDelta,
  ])

  const actions: { label: string; href: string }[] = []
  if (awaitingReview > 0)
    actions.push({
      label: `Approve ${awaitingReview} pending asset${awaitingReview === 1 ? '' : 's'}`,
      href: '/app/campaigns',
    })
  if (newLeads > 0)
    actions.push({
      label: `Review ${newLeads} new lead${newLeads === 1 ? '' : 's'}`,
      href: '/app/leads',
    })
  actions.push({ label: 'Launch a campaign', href: '/app/create' })

  if (loading) {
    return (
      <div className="stack" style={{ gap: 'var(--space-6)' }}>
        <CardSkeleton count={1} />
        <TileSkeleton count={4} />
        <CardSkeleton count={2} />
      </div>
    )
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  if (isEmpty) {
    return (
      <FadeIn className="home-brief">
        <h1 className="home-brief__hello">Let&apos;s launch your first campaign</h1>
        <p className="home-brief__date type-secondary">{formatDate()}</p>
        <p className="type-body" style={{ marginTop: 'var(--space-5)', maxWidth: 520 }}>
          Tell the AI what you want to achieve — it will draft a strategy and assets for you to
          approve before anything goes live.
        </p>
        <div className="home-brief__actions">
          <Link href="/app/create" className="btn primary">
            Open Command Center
          </Link>
        </div>
      </FadeIn>
    )
  }

  const activeCampaigns = (campaigns ?? [])
    .filter((c) => {
      const s = (c.status ?? '').toUpperCase()
      return s === 'ACTIVE' || s === 'LIVE' || s === 'PUBLISHED' || s === 'SCHEDULED' || !s
    })
    .slice(0, 5)

  const reach = meta?.reach
  const spend = meta?.spend ?? 0
  const roas = spend > 0 && lastRev > 0 ? lastRev / spend : null

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <FadeIn className="home-brief">
        <h1 className="home-brief__hello">
          {greeting()}, {name}
        </h1>
        <p className="home-brief__date type-secondary">{formatDate()}</p>
        {briefLines.length > 0 ? (
          <ul className="home-brief__lines">
            {briefLines.map((l) => (
              <li key={l.key}>{l.text}</li>
            ))}
          </ul>
        ) : (
          <p className="type-body" style={{ marginTop: 'var(--space-5)' }}>
            Your workspace is live. Start a campaign or review what&apos;s already in motion.
          </p>
        )}
        <div className="home-brief__actions">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className="btn">
              {a.label}
            </Link>
          ))}
        </div>
      </FadeIn>

      {awaitingReview + newLeads > 0 ? (
        <FadeIn delay={0.05} className="home-action">
          <div className="home-action__title">Action required</div>
          {awaitingReview > 0 ? (
            <div className="home-action__row">
              <span>
                {awaitingReview} asset{awaitingReview === 1 ? '' : 's'} awaiting review
              </span>
              <Link href="/app/campaigns" className="btn primary sm">
                Review
              </Link>
            </div>
          ) : null}
          {newLeads > 0 ? (
            <div className="home-action__row">
              <span>
                {newLeads} new lead{newLeads === 1 ? '' : 's'} to contact
              </span>
              <Link href="/app/leads" className="btn primary sm">
                Open inbox
              </Link>
            </div>
          ) : null}
        </FadeIn>
      ) : null}

      <Stagger className="cols-4 grid" interval={0.04}>
        <StaggerItem>
          <MetricTile
            label="Revenue"
            value={money(lastRev)}
            {...(revDelta ? { delta: revDelta } : {})}
            {...(revenueSeries.length > 1 ? { sparkline: revenueSeries.slice(-14) } : {})}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricTile
            label="Leads"
            value={(overview?.leads ?? lastLeads).toLocaleString()}
            {...(leadsDelta ? { delta: leadsDelta } : {})}
            {...(leadSeries.length > 1 ? { sparkline: leadSeries.slice(-14) } : {})}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricTile
            label="Reach"
            value={typeof reach === 'number' ? reach.toLocaleString() : '—'}
          />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="ROAS" value={roas !== null ? `${roas.toFixed(1)}×` : '—'} />
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.1} className="home-split">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <div className="type-label" style={{ color: 'var(--text-secondary)' }}>
            Active campaigns
          </div>
          {activeCampaigns.length === 0 ? (
            <p className="type-secondary">No active campaigns yet.</p>
          ) : (
            activeCampaigns.map((c) => {
              const pct = Math.round((progressByCampaign[c.id] ?? 0) * 100)
              return (
                <Link key={c.id} href={`/app/campaigns/${c.id}/assets`} className="home-campaign">
                  <div className="spread" style={{ gap: 8 }}>
                    <strong className="type-body-strong">{c.name}</strong>
                    {c.status ? <StatusPill status={toStatus(c.status)} /> : null}
                  </div>
                  {c.objective ? (
                    <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                      {c.objective}
                    </span>
                  ) : null}
                  <div className="home-campaign__bar" aria-hidden>
                    <div className="home-campaign__fill" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              )
            })
          )}
        </div>

        <div className="home-rail">
          <div className="type-label" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            Up next
          </div>
          {scheduled.length === 0 && notifications.length === 0 ? (
            <p className="type-secondary">
              Nothing scheduled. Approve assets to fill the calendar.
            </p>
          ) : null}
          {scheduled.map((s) => (
            <Link key={s.id} href={s.href} className="home-rail__item">
              <Icon
                name="calendar"
                size={14}
                style={{ color: 'var(--text-tertiary)', marginTop: 2 }}
              />
              <span>
                <div>{s.title}</div>
                <div className="type-caption" style={{ fontFamily: 'var(--font-code)' }}>
                  {new Date(s.when).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </span>
            </Link>
          ))}
          {notifications.map((n) => (
            <div key={n.id} className="home-rail__item">
              <Icon name="bell" size={14} style={{ color: 'var(--text-tertiary)', marginTop: 2 }} />
              <span>
                <div>{n.title || n.body || 'Notification'}</div>
                {n.createdAt ? (
                  <div className="type-caption">{new Date(n.createdAt).toLocaleDateString()}</div>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </FadeIn>
    </div>
  )
}
