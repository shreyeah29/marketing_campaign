'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { BarChart, LineChart } from '@/components/charts'

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

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function ReportsPage() {
  const [series, setSeries] = useState<TimeseriesPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [channels, setChannels] = useState<ChannelPerformance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ts, fn, ch] = await Promise.all([
        api.get<{ days: TimeseriesPoint[] }>('/analytics/timeseries?days=30'),
        api.get<FunnelStage[]>('/analytics/leads-funnel'),
        api.get<ChannelPerformance>('/analytics/channel-performance'),
      ])
      setSeries(ts?.days ?? [])
      setFunnel(fn ?? [])
      setChannels(ch)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalLeads = funnel.reduce((s, f) => s + f.count, 0)
  const converted = funnel.find((f) => f.stage === 'CONVERTED')?.count ?? 0
  const qualified = funnel.find((f) => f.stage === 'QUALIFIED')?.count ?? 0
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 1000) / 10 : 0

  const funnelBars = funnel.map((f) => ({ label: STAGE_LABELS[f.stage] ?? f.stage, value: f.count }))
  const leadsLine = series.map((p) => ({ label: shortDate(p.date), value: p.leads }))

  return (
    <>
      <PageHeader title="Reports" subtitle="Lead funnel, acquisition trend and channel performance" />

      {loading ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          <div className="grid cols-4">
            <StatCard label="Total leads" value={totalLeads.toLocaleString()} />
            <StatCard label="Qualified" value={qualified.toLocaleString()} />
            <StatCard label="Converted" value={converted.toLocaleString()} />
            <StatCard label="Conversion rate" value={`${conversionRate}%`} />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>New leads over time</div>
            <LineChart data={leadsLine} />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Leads funnel by stage</div>
            <BarChart data={funnelBars} />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Channel performance</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Volume</th>
                    <th>Engaged</th>
                    <th>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Email — opens</td>
                    <td>{(channels?.email.sent ?? 0).toLocaleString()} sent</td>
                    <td>{(channels?.email.opened ?? 0).toLocaleString()} opened</td>
                    <td>
                      {channels && channels.email.sent > 0
                        ? `${Math.round((channels.email.opened / channels.email.sent) * 1000) / 10}%`
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td>Email — clicks</td>
                    <td>{(channels?.email.sent ?? 0).toLocaleString()} sent</td>
                    <td>{(channels?.email.clicked ?? 0).toLocaleString()} clicked</td>
                    <td>
                      {channels && channels.email.sent > 0
                        ? `${Math.round((channels.email.clicked / channels.email.sent) * 1000) / 10}%`
                        : '—'}
                    </td>
                  </tr>
                  {(channels?.social ?? []).map((s) => (
                    <tr key={s.platform}>
                      <td>{s.platform} — assets</td>
                      <td>{s.assets.toLocaleString()}</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
