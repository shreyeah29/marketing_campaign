'use client'

/**
 * Today — the screen that answers "what needs me?" before it answers anything
 * else.
 *
 * Built against the Ink & Signal reference. Every figure on it is real: where
 * the reference shows a window the API does not serve (LEADS · 7D), the number
 * is computed from the timeseries rather than relabelled, and where there is no
 * measurement at all (video minutes used) the allowance is shown without a
 * fabricated fill. A dashboard that invents a bar is worse than one that admits
 * it cannot draw it.
 */

import { useCallback, useEffect, useState } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { ErrorState, TileSkeleton } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon, type IconName } from '@/components/icon'

import { useIndicators, useWorkspace } from '../layout'

interface Overview {
  contacts: number
  leads: number
  campaigns: number
  activeCampaigns: number
  assetsGenerated: number
  assetsApproved: number
  aiSpendUsd: string
}

interface TimeseriesPoint {
  date: string
  leads: number
}

interface Campaign {
  id: string
  name: string
  objective?: string | null
  status?: string | null
}

interface CampaignAsset {
  id: string
  status: string
}

interface Creative {
  id: string
  renderedUrl: string | null
  aspectRatio: string
  status: string
  product: { name: string; brand: string | null } | null
}

/** A campaign with the asset counts that make its progress rule meaningful. */
interface CampaignFlight {
  campaign: Campaign
  total: number
  approved: number
}

interface Limit {
  metric: string
  name: string
  unit: string
  period: string
  limit: number | null
}

function unwrapList<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

function num(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}

/** Compact money for a tile: 18400 → ₹18.4k. Full precision lives on Insights. */
function compactMoney(v: string | number | undefined): string {
  const n = Number(v ?? NaN)
  if (!Number.isFinite(n)) return '—'
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`
  return `₹${String(Math.round(n))}`
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Statuses a campaign can be in while still "in flight" — not archived. */
const IN_FLIGHT = new Set(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PUBLISHED', 'LIVE'])

export default function DashboardPage() {
  const ws = useWorkspace()
  const indicators = useIndicators()
  const router = useRouter()

  const [overview, setOverview] = useState<Overview | null>(null)
  const [leads7d, setLeads7d] = useState<number | null>(null)
  const [flights, setFlights] = useState<CampaignFlight[]>([])
  const [fresh, setFresh] = useState<Creative[]>([])
  const [aiCalls, setAiCalls] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * The dateline is rendered only after mount. It is derived from the client's
   * clock, and rendering it on the server produces a different string in a
   * different timezone — which React reports as a hydration error on a screen
   * whose whole job is to look calm.
   */
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ovRes, seriesRes, campsRes, creativesRes, usageRes] = await Promise.allSettled([
        api.get<Overview>('/analytics/overview'),
        api.get<{ days: TimeseriesPoint[] }>('/analytics/timeseries?days=30'),
        api.get<Campaign[] | { data: Campaign[] }>('/campaigns'),
        api.get<{ data: Creative[] }>('/creatives'),
        api.get<{ totalCalls?: number }>('/analytics/ai-usage'),
      ])

      // Overview is the only one whose failure leaves the screen without a
      // subject; the rest degrade to an empty panel rather than an error page.
      if (ovRes.status === 'rejected') {
        throw ovRes.reason instanceof ApiError
          ? ovRes.reason
          : new Error('Could not load your workspace summary')
      }
      setOverview(ovRes.value)

      if (seriesRes.status === 'fulfilled') {
        const days = seriesRes.value.days ?? []
        setLeads7d(days.slice(-7).reduce((sum, d) => sum + (d.leads ?? 0), 0))
      } else {
        setLeads7d(null)
      }

      if (usageRes.status === 'fulfilled') setAiCalls(usageRes.value.totalCalls ?? null)

      if (creativesRes.status === 'fulfilled') {
        setFresh((creativesRes.value.data ?? []).filter((c) => c.renderedUrl).slice(0, 5))
      }

      if (campsRes.status === 'fulfilled') {
        const camps = unwrapList(campsRes.value)
          .filter((c) => !c.status || IN_FLIGHT.has(c.status.toUpperCase()))
          .slice(0, 3)

        // Three requests, not one per campaign: the progress rule is only shown
        // for the three campaigns on screen, so only those are counted.
        const rows = await Promise.all(
          camps.map(async (campaign): Promise<CampaignFlight> => {
            try {
              const r = await api.get<CampaignAsset[] | { data: CampaignAsset[] }>(
                `/campaign-assets?campaignId=${encodeURIComponent(campaign.id)}`,
              )
              const assets = unwrapList(r)
              return {
                campaign,
                total: assets.length,
                approved: assets.filter((a) => a.status === 'APPROVED' || a.status === 'PUBLISHED')
                  .length,
              }
            } catch {
              return { campaign, total: 0, approved: 0 }
            }
          }),
        )
        setFlights(rows)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your workspace summary')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const firstName = (ws.user.name || ws.user.email || '').split(/[\s@]/)[0] ?? ''
  const orgName = ws.branding?.displayName || ws.organization?.name || ''

  // ── The "needs you" list, assembled from what is actually true ────────────
  const needs: {
    key: string
    verb: string
    tone: 'signal' | 'decision' | 'neutral'
    text: string
    href: string
  }[] = []
  if (indicators.assetsNeedingReview > 0) {
    needs.push({
      key: 'review',
      verb: 'APPROVE',
      tone: 'signal',
      text: `${String(indicators.assetsNeedingReview)} ${indicators.assetsNeedingReview === 1 ? 'asset is' : 'assets are'} waiting for a decision`,
      href: '/app/creatives?status=needs_review',
    })
  }
  if (indicators.connectionIssue) {
    needs.push({
      key: 'connection',
      verb: 'RECONNECT',
      tone: 'decision',
      text: 'A channel connection has expired — the schedule cannot publish through it',
      href: '/app/connections',
    })
  }
  if (indicators.newLeads > 0) {
    needs.push({
      key: 'leads',
      verb: 'REPLY',
      tone: 'neutral',
      text: `${String(indicators.newLeads)} new ${indicators.newLeads === 1 ? 'lead has' : 'leads have'} not been contacted`,
      href: '/app/leads/pipeline',
    })
  }

  // ── Workspace setup, from real state ──────────────────────────────────────
  const checklist: {
    key: string
    label: string
    state: 'done' | 'blocked' | 'todo'
    href: string
  }[] = [
    {
      key: 'brand',
      label: 'Brand profile',
      state: ws.branding?.displayName ? 'done' : 'todo',
      href: '/app/settings/branding',
    },
    {
      key: 'connection',
      label: indicators.connectionIssue ? 'A connection needs reconnecting' : 'Channels connected',
      state: indicators.connectionIssue ? 'blocked' : 'done',
      href: '/app/connections',
    },
    {
      key: 'campaign',
      label: 'First campaign',
      state: (overview?.campaigns ?? 0) > 0 ? 'done' : 'todo',
      href: '/app/campaigns',
    },
    {
      key: 'products',
      label: 'Products in the catalogue',
      state: 'todo',
      href: '/app/products',
    },
  ]

  // ── Plan usage: a bar only where a real measurement exists ────────────────
  const usageFor = (metric: string): number | null => {
    const m = metric.toLowerCase()
    if (m.includes('contact')) return overview?.contacts ?? null
    if (m.includes('generation') || m.includes('ai_call') || m.includes('ai')) return aiCalls
    if (m.includes('campaign')) return overview?.campaigns ?? null
    return null
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  return (
    <FadeIn className="today-layout">
      <div className="today-main">
        <div className="dateline">
          {now
            ? `${now
                .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                .toUpperCase()}${orgName ? ` · ${orgName.toUpperCase()}` : ''}`
            : ' '}
        </div>
        <h1 className="greeting">
          {now ? greetingFor(now.getHours()) : 'Hello'}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 14.5, maxWidth: '60ch' }}>
          {needs.length === 0
            ? 'Nothing is waiting on you. Everything generated has been judged.'
            : `${needs.map((n) => n.text).join(', and ')}.`}
        </p>

        {/* ── The five figures ─────────────────────────────────────────── */}
        {loading && !overview ? (
          <div style={{ marginTop: 24 }}>
            <TileSkeleton count={5} />
          </div>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
              gap: 10,
              marginTop: 24,
            }}
          >
            <div className="card kpi">
              <div className="k">Live campaigns</div>
              <div className="v">{num(overview?.activeCampaigns)}</div>
            </div>
            <div
              className="card kpi"
              {...(indicators.assetsNeedingReview > 0 ? { 'data-attention': '' } : {})}
            >
              <div className="k">In review</div>
              <div className="v">{num(indicators.assetsNeedingReview)}</div>
            </div>
            <div className="card kpi">
              <div className="k">Assets generated</div>
              <div className="v">{num(overview?.assetsGenerated)}</div>
            </div>
            <div className="card kpi">
              <div className="k">{leads7d === null ? 'Leads' : 'Leads · 7d'}</div>
              <div className="v">{num(leads7d ?? overview?.leads)}</div>
            </div>
            <div className="card kpi">
              <div className="k">AI spend</div>
              <div className="v">{compactMoney(overview?.aiSpendUsd)}</div>
            </div>
          </div>
        )}

        {/* ── Needs you ────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 26, padding: 0, overflow: 'hidden' }}>
          <div className="panel-head">
            <span className="panel-head__title">Needs you</span>
            <Link href="/app/creatives?status=needs_review" className="panel-head__more">
              Open review queue →
            </Link>
          </div>
          {needs.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '18px 16px',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}
            >
              Nothing is waiting on a decision right now.
            </p>
          ) : (
            needs.map((n) => (
              <button
                key={n.key}
                type="button"
                className="panel-row"
                onClick={() => router.push(n.href)}
              >
                <span
                  className="row-verb"
                  {...(n.tone === 'neutral' ? {} : { 'data-tone': n.tone })}
                >
                  {n.verb}
                </span>
                <span className="panel-row__grow">{n.text}</span>
              </button>
            ))
          )}
        </div>

        {/* ── Campaigns in flight ──────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 22, padding: 0, overflow: 'hidden' }}>
          <div className="panel-head">
            <span className="panel-head__title">Campaigns in flight</span>
            <Link href="/app/campaigns" className="panel-head__more">
              {overview?.campaigns ? `All ${String(overview.campaigns)} →` : 'All campaigns →'}
            </Link>
          </div>
          {loading && flights.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '18px 16px',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}
            >
              Loading campaigns…
            </p>
          ) : flights.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '18px 16px',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}
            >
              No campaigns yet. Start one from the brief.
            </p>
          ) : (
            flights.map(({ campaign, total, approved }) => {
              const pct = total > 0 ? Math.round((approved / total) * 100) : 0
              const done = total > 0 && approved === total
              return (
                <button
                  key={campaign.id}
                  type="button"
                  className="panel-row"
                  onClick={() => router.push(`/app/campaigns/${campaign.id}/assets`)}
                >
                  <span className="panel-row__grow" style={{ minWidth: 200 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                      {campaign.name}
                    </span>
                    <br />
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {total === 0
                        ? 'No assets yet'
                        : `${String(total)} assets · ${String(approved)} approved`}
                      {campaign.objective ? ` · ${campaign.objective.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <span className="batch-bar" style={{ width: 104, flex: 'none', height: 5 }}>
                    <span
                      className="batch-bar__fill"
                      style={{ width: `${String(pct)}%`, display: 'block' }}
                      {...(done ? { 'data-done': '' } : {})}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      flex: 'none',
                      color: done ? 'var(--text-tertiary)' : 'var(--cobalt-600)',
                    }}
                  >
                    {(campaign.status ?? 'DRAFT').toUpperCase()}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* ── Fresh from the generator ─────────────────────────────────── */}
        <div className="card" style={{ marginTop: 22, padding: 0, overflow: 'hidden' }}>
          <div className="panel-head">
            <span className="panel-head__title">Fresh from the generator</span>
            <Link href="/app/creatives" className="panel-head__more">
              Media library →
            </Link>
          </div>
          {fresh.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '18px 16px',
                color: 'var(--text-tertiary)',
                fontSize: 13,
              }}
            >
              Nothing generated yet. Attach products to a campaign and press Generate all.
            </p>
          ) : (
            <div className="media-grid" style={{ padding: '14px 16px' }}>
              {fresh.map((c) => (
                <Link key={c.id} href="/app/creatives" style={{ color: 'inherit' }}>
                  <div className="media-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.renderedUrl ?? ''}
                      alt={c.product?.name ?? 'Generated creative'}
                      crossOrigin="use-credentials"
                      loading="lazy"
                    />
                    <span className="media-badge">{c.aspectRatio}</span>
                  </div>
                  <div className="media-sub">{c.product?.name ?? 'Creative'}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────────────────── */}
      <div className="today-rail">
        <div className="card">
          <div className="panel-head__title" style={{ marginBottom: 12 }}>
            Start something
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(
              [
                {
                  href: '/app/create',
                  icon: 'sparkles',
                  label: 'New campaign brief',
                  primary: true,
                },
                { href: '/app/products', icon: 'grid', label: 'Add a product', primary: false },
                {
                  href: '/app/creatives',
                  icon: 'image',
                  label: 'Generate posters',
                  primary: false,
                },
                { href: '/app/ai/video', icon: 'video', label: 'Generate a video', primary: false },
              ] as { href: string; icon: IconName; label: string; primary: boolean }[]
            ).map((a) => (
              <button
                key={a.href}
                type="button"
                className="rail-action"
                {...(a.primary ? { 'data-primary': '' } : {})}
                onClick={() => router.push(a.href)}
              >
                <Icon name={a.icon} size={15} />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="panel-head__title" style={{ marginBottom: 12 }}>
            Workspace setup
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {checklist.map((c) => (
              <button
                key={c.key}
                type="button"
                className="checklist-item"
                data-state={c.state}
                data-action=""
                onClick={() => router.push(c.href)}
              >
                <Icon
                  name={
                    c.state === 'done'
                      ? 'check-circle'
                      : c.state === 'blocked'
                        ? 'alert-triangle'
                        : 'circle'
                  }
                  size={15}
                  className="ico"
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {ws.limits.length > 0 ? (
          <div className="card">
            <div className="panel-head__title" style={{ marginBottom: 12 }}>
              Plan usage{ws.plan?.name ? ` · ${ws.plan.name}` : ''}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {ws.limits.map((l: Limit) => {
                const used = usageFor(l.metric)
                const pct =
                  used !== null && l.limit
                    ? Math.min(100, Math.round((used / l.limit) * 100))
                    : null
                return (
                  <div key={l.metric}>
                    <div className="spread" style={{ marginBottom: 5 }}>
                      <span>{l.name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {used !== null ? `${num(used)} / ` : ''}
                        {l.limit === null ? 'Unlimited' : num(l.limit)}
                      </span>
                    </div>
                    {/* No bar without a real measurement — an empty track says
                        "not measured", a filled one would be a guess. */}
                    <div className="batch-bar" style={{ height: 5 }}>
                      {pct === null ? null : (
                        <div className="batch-bar__fill" style={{ width: `${String(pct)}%` }} />
                      )}
                    </div>
                  </div>
                )
              })}
              <Link
                href="/app/settings/features"
                className="panel-head__more"
                style={{ margin: 0 }}
              >
                Features &amp; limits →
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </FadeIn>
  )
}
