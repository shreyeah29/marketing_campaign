'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, MetricTile, TileSkeleton, ChartSkeleton } from '@/components/kit'
import { HorizontalBarChart, LineChart } from '@/components/charts'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { StatusPill, toStatus } from '@/components/status'

import { useAnalyticsFilters } from '../layout'

interface Overview {
  contacts: number
  leads: number
  qualifiedLeads: number
  deals: number
  openDeals: number
  wonDeals: number
  campaigns: number
  activeCampaigns: number
  assetsGenerated: number
  assetsApproved: number
  workflowRuns: number
  emailsSent: number
  aiSpendUsd: string
}

interface TimeseriesPoint {
  date: string
  leads: number
  deals: number
  revenue: string
}

interface FunnelStage {
  stage: string
  count: number
}

interface ChannelPerformance {
  email: { sent: number; opened: number; clicked: number }
  social: { platform: string; assets: number }[]
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NURTURING: 'Nurturing',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
}

const STAGE_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'UNQUALIFIED']

function money(v: string | number | undefined): string {
  if (v === undefined) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
}

function num(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function FunnelWithDropOff({ stages }: { stages: FunnelStage[] }) {
  const ordered = STAGE_ORDER.map((stage) => stages.find((s) => s.stage === stage)).filter(
    (s): s is FunnelStage => !!s,
  )

  if (ordered.every((s) => s.count === 0)) {
    return (
      <EmptyState
        icon="users"
        title="No funnel data yet"
        hint="Lead stages appear here once leads enter your workspace — data comes from /analytics/leads-funnel."
      />
    )
  }

  return (
    <div className="stack" style={{ gap: 2 }}>
      {ordered.map((s, i) => {
        const prev = i > 0 ? ordered[i - 1]!.count : null
        const dropOff =
          prev !== null && prev > 0 && s.count < prev
            ? Math.round(((prev - s.count) / prev) * 1000) / 10
            : null
        return (
          <div key={s.stage}>
            {dropOff !== null && dropOff > 0 ? (
              <div
                className="dim"
                style={{
                  fontSize: 11,
                  padding: '6px 0 2px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-code)',
                }}
              >
                ↓ {dropOff}% drop-off
              </div>
            ) : i > 0 ? (
              <div style={{ height: 6 }} />
            ) : null}
            <div
              className="spread"
              style={{
                padding: '10px 14px',
                background: 'var(--surface-raised, var(--surface-sunken))',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontWeight: 500 }}>{STAGE_LABELS[s.stage] ?? s.stage}</span>
              <span style={{ fontFamily: 'var(--font-code)', fontVariantNumeric: 'tabular-nums' }}>
                {s.count.toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsOverviewPage() {
  const { days, campaignId, campaigns } = useAnalyticsFilters()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [channels, setChannels] = useState<ChannelPerformance | null>(null)
  const [metric, setMetric] = useState<'leads' | 'revenue'>('leads')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get<Overview>('/analytics/overview'),
      api.get<{ days: TimeseriesPoint[] }>(`/analytics/timeseries?days=${days}`),
      api.get<FunnelStage[]>('/analytics/leads-funnel'),
      api.get<ChannelPerformance>('/analytics/channel-performance'),
    ])
      .then(([ov, ts, fn, ch]) => {
        setOverview(ov)
        setSeries(ts?.days ?? [])
        setFunnel(Array.isArray(fn) ? fn : [])
        setChannels(ch)
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load analytics overview'),
      )
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const lineData = series.map((p) => ({
    label: shortDate(p.date),
    value: metric === 'leads' ? p.leads : Number(p.revenue),
  }))

  const channelBars = useMemo(() => {
    if (!channels) return []
    const bars: { label: string; value: number }[] = []
    if (channels.email.sent > 0) {
      bars.push({ label: 'Email sent', value: channels.email.sent })
      bars.push({ label: 'Email opened', value: channels.email.opened })
      bars.push({ label: 'Email clicked', value: channels.email.clicked })
    }
    for (const s of channels.social) {
      if (s.assets > 0) bars.push({ label: s.platform, value: s.assets })
    }
    return bars
  }, [channels])

  const topCampaigns = useMemo(() => {
    let list = [...campaigns]
    if (campaignId) list = list.filter((c) => c.id === campaignId)
    return list
      .sort((a, b) => {
        const aLive = toStatus(a.status) === 'live' ? 0 : 1
        const bLive = toStatus(b.status) === 'live' ? 0 : 1
        if (aLive !== bLive) return aLive - bLive
        return a.name.localeCompare(b.name)
      })
      .slice(0, 10)
  }, [campaigns, campaignId])

  const totalRevenue = useMemo(
    () => series.reduce((sum, p) => sum + (Number(p.revenue) || 0), 0),
    [series],
  )

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  if (loading || !overview) {
    return (
      <div className="stack" style={{ gap: 22 }}>
        <TileSkeleton count={6} />
        <ChartSkeleton height={220} />
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      {campaignId ? (
        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          Campaign filter is applied to the table below only — overview metrics are workspace-wide.
        </p>
      ) : null}

      <Stagger className="cols-3 grid" style={{ gap: 14 }} interval={0.05}>
        <StaggerItem>
          <MetricTile label="Leads" value={num(overview.leads)} />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="Qualified leads" value={num(overview.qualifiedLeads)} />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="Won deals" value={num(overview.wonDeals)} />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="Open deals" value={num(overview.openDeals)} />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="Active campaigns" value={num(overview.activeCampaigns)} />
        </StaggerItem>
        <StaggerItem>
          <MetricTile label="AI spend" value={money(overview.aiSpendUsd)} />
        </StaggerItem>
      </Stagger>

      <FadeIn
        delay={0.1}
        className="cols-2 split grid"
        style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'stretch', gap: 16 }}
      >
        <div className="card">
          <div className="spread" style={{ marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Trend</div>
              <div className="dim" style={{ fontSize: 12 }}>
                Last {days} days
                {metric === 'revenue' && totalRevenue > 0
                  ? ` · ${money(String(totalRevenue))} total`
                  : null}
              </div>
            </div>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${metric === 'leads' ? 'active' : ''}`}
                onClick={() => setMetric('leads')}
              >
                Leads
              </button>
              <button
                type="button"
                className={`tab ${metric === 'revenue' ? 'active' : ''}`}
                onClick={() => setMetric('revenue')}
              >
                Revenue
              </button>
            </div>
          </div>
          {lineData.length > 0 ? (
            <LineChart
              data={lineData}
              title={`${metric === 'leads' ? 'Leads' : 'Revenue'} trend`}
              color={metric === 'revenue' ? 'var(--chart-2)' : 'var(--chart-1)'}
              valueFormat={
                metric === 'revenue'
                  ? (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                  : undefined
              }
            />
          ) : (
            <EmptyState
              icon="trending-up"
              title="No trend data yet"
              hint={`Daily ${metric} from /analytics/timeseries appears once activity is recorded.`}
            />
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Leads funnel</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
            Stage counts with drop-off between steps
          </div>
          <FunnelWithDropOff stages={funnel} />
        </div>
      </FadeIn>

      <FadeIn delay={0.16} className="cols-2 split grid" style={{ gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Channel comparison</div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
            Email engagement and social assets by platform
          </div>
          {channelBars.length > 0 ? (
            <HorizontalBarChart data={channelBars} title="Channel comparison" />
          ) : (
            <EmptyState
              icon="share"
              title="No channel activity yet"
              hint="Send email or publish social assets — counts from /analytics/channel-performance will show here."
            />
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 4px', fontWeight: 600 }}>Top campaigns</div>
          <p className="dim" style={{ padding: '0 18px 10px', fontSize: 12, margin: 0 }}>
            Active campaigns first — status from your workspace.
          </p>
          {topCampaigns.length === 0 ? (
            <div
              className="dim"
              style={{ padding: '24px 18px', textAlign: 'center', fontSize: 13 }}
            >
              No campaigns yet — create one to see it here.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/app/campaigns/${c.id}`}
                        style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={toStatus(c.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FadeIn>
    </div>
  )
}
