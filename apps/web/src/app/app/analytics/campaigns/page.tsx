'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { BarChart, DonutChart, LineChart } from '@/components/charts'

interface Summary {
  impressions: number
  reach: number
  clicks: number
  spend: number
  leads: number
  activeCampaigns: number
  ctr: number
  cpl: number
}
interface Bucket {
  value: string
  reach: number
  impressions: number
  leads: number
  spend: number
}
interface Demographics {
  age: Bucket[]
  gender: Bucket[]
}
interface TrendPoint {
  date: string
  impressions: number
  clicks: number
  leads: number
  spend: number
}
interface FunnelStage {
  stage: string
  count: number
}

const RANGES = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
]

// Demographics are categories, not statuses: they take the chart ramp, never a
// meaning-carrying status colour (design brief 1.1, rule 2).
const GENDER_COLORS: Record<string, string> = {
  female: 'var(--chart-2)',
  male: 'var(--chart-1)',
  unknown: 'var(--chart-6)',
}

function num(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString()
}
function money(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `₹${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function pct(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(2)}%`
}
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function CampaignInsightsPage() {
  const [days, setDays] = useState('30')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [demo, setDemo] = useState<Demographics | null>(null)
  const [geo, setGeo] = useState<Bucket[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function load(range: string): void {
    setLoading(true)
    setError(null)
    const from = new Date(Date.now() - Number(range) * 86_400_000).toISOString().slice(0, 10)
    const qs = `?from=${from}`
    Promise.all([
      api.get<Summary>(`/meta/analytics/summary${qs}`),
      api.get<Demographics>(`/meta/analytics/demographics${qs}`),
      api.get<{ data: Bucket[] }>(`/meta/analytics/geography${qs}`),
      api.get<{ data: TrendPoint[] }>(`/meta/analytics/timeseries${qs}`),
      api.get<FunnelStage[]>(`/analytics/leads-funnel`).catch(() => [] as FunnelStage[]),
    ])
      .then(([s, d, g, t, f]) => {
        setSummary(s)
        setDemo(d)
        setGeo(g.data)
        setTrend(t.data)
        setFunnel(Array.isArray(f) ? f : [])
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load insights'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const hasAudience =
    (demo?.age.length ?? 0) > 0 || (demo?.gender.length ?? 0) > 0 || geo.length > 0

  return (
    <>
      <PageHeader
        title="Campaign Insights"
        subtitle="Reach, audience and leads across your Facebook &amp; Instagram ads"
        actions={
          <div className="row" style={{ gap: 6 }} role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                aria-pressed={days === r.key}
                className={`btn sm ${days === r.key ? 'primary' : ''}`}
                onClick={() => setDays(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load(days)} />
      ) : loading ? (
        <TableSkeleton cols={4} />
      ) : (
        <div className="stack" style={{ gap: 28 }}>
          {!hasAudience && (
            <div className="banner info">
              <span>
                Audience insights — age, gender and location of the people your ads reach — appear
                here automatically once your campaigns are live.
              </span>
            </div>
          )}

          {/* Headline metrics */}
          <Stagger className="cols-4 grid" style={{ gap: 14 }} interval={0.05}>
            <StaggerItem>
              <StatCard label="Reach" value={num(summary?.reach)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Impressions" value={num(summary?.impressions)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Clicks" value={num(summary?.clicks)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Leads" value={num(summary?.leads)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Ad spend" value={money(summary?.spend)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Click-through rate" value={pct(summary?.ctr)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Cost per lead" value={money(summary?.cpl)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Active campaigns" value={num(summary?.activeCampaigns)} />
            </StaggerItem>
          </Stagger>

          {/* Trend */}
          <FadeIn delay={0.12} className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Leads over time</h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              Daily leads generated by your ads
            </p>
            <LineChart data={trend.map((t) => ({ label: shortDate(t.date), value: t.leads }))} />
          </FadeIn>

          {/* Audience */}
          <FadeIn delay={0.18} className="cols-2 grid" style={{ gap: 16, alignItems: 'stretch' }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Who sees your ads — by age</h3>
              <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
                Reach by age band
              </p>
              <BarChart data={(demo?.age ?? []).map((b) => ({ label: b.value, value: b.reach }))} />
            </div>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>By gender</h3>
              <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
                Share of reach
              </p>
              <DonutChart
                centerLabel="Reach"
                segments={(demo?.gender ?? []).map((b) => ({
                  label: titleCase(b.value),
                  value: b.reach,
                  color: GENDER_COLORS[b.value.toLowerCase()] ?? 'var(--text-tertiary, #6b7680)',
                }))}
              />
            </div>
          </FadeIn>

          {/* Geography */}
          <section className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Where your audience is</h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              Top regions by reach
            </p>
            <BarChart data={geo.map((b) => ({ label: b.value, value: b.reach }))} />
          </section>

          {/* Leads funnel */}
          <section className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Lead funnel</h3>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
              How leads progress from first contact to won
            </p>
            <BarChart
              data={funnel.map((s) => ({
                label: titleCase(s.stage.toLowerCase()),
                value: s.count,
              }))}
            />
          </section>
        </div>
      )}
    </>
  )
}
