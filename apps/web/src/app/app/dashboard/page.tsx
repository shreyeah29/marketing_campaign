'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { DonutChart, LineChart } from '@/components/charts'

import { useWorkspace } from '../layout'

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

function money(v: string | number | undefined): string {
  if (v === undefined) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

function num(v: number | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—'
}

function shortDate(iso: string): string {
  // 'YYYY-MM-DD' → 'M/D', kept locale-stable to avoid hydration drift.
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NURTURING: 'Nurturing',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
}

export default function DashboardPage() {
  const ws = useWorkspace()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [channels, setChannels] = useState<ChannelPerformance | null>(null)
  const [metric, setMetric] = useState<'leads' | 'revenue'>('leads')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ov, ts, fn, ch] = await Promise.all([
        api.get<Overview>('/analytics/overview'),
        api.get<{ days: TimeseriesPoint[] }>('/analytics/timeseries?days=30'),
        api.get<FunnelStage[]>('/analytics/leads-funnel'),
        api.get<ChannelPerformance>('/analytics/channel-performance'),
      ])
      setOverview(ov)
      setSeries(ts?.days ?? [])
      setFunnel(fn ?? [])
      setChannels(ch)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orgName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'

  const lineData = series.map((p) => ({
    label: shortDate(p.date),
    value: metric === 'leads' ? p.leads : Number(p.revenue),
  }))

  const funnelSegments = funnel
    .filter((s) => s.count > 0)
    .map((s) => ({ label: STAGE_LABELS[s.stage] ?? s.stage, value: s.count }))

  const emailOpenRate =
    channels && channels.email.sent > 0
      ? Math.round((channels.email.opened / channels.email.sent) * 1000) / 10
      : 0
  const emailClickRate =
    channels && channels.email.sent > 0
      ? Math.round((channels.email.clicked / channels.email.sent) * 1000) / 10
      : 0

  return (
    <>
      <PageHeader
        title={`Welcome, ${orgName}`}
        subtitle={`${ws.plan?.name ?? 'No plan'} · ${ws.enabledFeatures.length} modules enabled`}
      />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          {/* KPI row */}
          <div className="grid cols-4">
            <StatCard label="Contacts" value={num(overview?.contacts)} />
            <StatCard label="Leads" value={num(overview?.leads)} />
            <StatCard label="Qualified leads" value={num(overview?.qualifiedLeads)} />
            <StatCard label="Open deals" value={num(overview?.openDeals)} />
            <StatCard label="Won deals" value={num(overview?.wonDeals)} />
            <StatCard label="Active campaigns" value={num(overview?.activeCampaigns)} />
            <StatCard label="Emails sent" value={num(overview?.emailsSent)} />
            <StatCard label="AI spend" value={money(overview?.aiSpendUsd)} />
          </div>

          {/* Trend + funnel */}
          <div className="grid cols-2 split" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'stretch' }}>
            <div className="card">
              <div className="spread" style={{ marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Trend</div>
                  <div className="dim" style={{ fontSize: 12 }}>Last 30 days</div>
                </div>
                <div className="tabs">
                  <button
                    className={`tab ${metric === 'leads' ? 'active' : ''}`}
                    onClick={() => setMetric('leads')}
                  >
                    Leads
                  </button>
                  <button
                    className={`tab ${metric === 'revenue' ? 'active' : ''}`}
                    onClick={() => setMetric('revenue')}
                  >
                    Revenue
                  </button>
                </div>
              </div>
              <LineChart
                data={lineData}
                color={metric === 'revenue' ? 'var(--color-accent)' : 'var(--color-primary)'}
                valueFormat={
                  metric === 'revenue'
                    ? (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                    : undefined
                }
              />
            </div>

            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Leads funnel</div>
              {funnelSegments.length > 0 ? (
                <DonutChart segments={funnelSegments} centerLabel="Leads" />
              ) : (
                <div className="dim" style={{ padding: '40px 0', textAlign: 'center', fontSize: 13 }}>
                  No leads yet
                </div>
              )}
            </div>
          </div>

          {/* Channel performance */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 14 }}>Channel performance</div>
            <div className="grid cols-2" style={{ gap: 20 }}>
              <div className="stack" style={{ gap: 10 }}>
                <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Email
                </div>
                <div className="grid cols-3" style={{ gap: 12 }}>
                  <StatCard label="Sent" value={num(channels?.email.sent)} />
                  <StatCard label="Open rate" value={`${emailOpenRate}%`} />
                  <StatCard label="Click rate" value={`${emailClickRate}%`} />
                </div>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Social assets by platform
                </div>
                {channels && channels.social.length > 0 ? (
                  <div className="stack" style={{ gap: 6 }}>
                    {channels.social.map((s) => {
                      const maxAssets = Math.max(...channels.social.map((x) => x.assets), 1)
                      return (
                        <div key={s.platform} className="spread" style={{ gap: 12, fontSize: 13 }}>
                          <span style={{ width: 96, color: 'var(--text)' }}>{s.platform}</span>
                          <span style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            <span
                              style={{
                                display: 'block',
                                height: '100%',
                                width: `${(s.assets / maxAssets) * 100}%`,
                                background: 'var(--color-primary)',
                                borderRadius: 6,
                              }}
                            />
                          </span>
                          <span className="dim" style={{ width: 32, textAlign: 'right' }}>{s.assets}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="dim" style={{ fontSize: 13 }}>No social assets yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
