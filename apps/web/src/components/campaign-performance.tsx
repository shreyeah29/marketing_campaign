'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, MetricTile, ErrorState, TileSkeleton } from '@/components/kit'
import { LineChart, HorizontalBarChart } from '@/components/charts'
import { FadeIn } from '@/components/motion'
import { StatusPill, toStatus, kindLabel } from '@/components/status'
import { PlatformIcon } from '@/components/platform-icon'
import { Icon } from '@/components/icon'
import { AssetCard } from '@/components/asset-card'
import { SkeletonList, useCampaign, type Asset } from '@/components/campaign-studio'

interface MetaSummary {
  impressions: number
  reach: number
  clicks: number
  spend: number
  leads: number
  ctr: number
  cpl: number
}

interface TrendPoint {
  date: string
  impressions: number
  clicks: number
  leads: number
  spend: number
}

type MetricKey = 'reach' | 'clicks' | 'conversions' | 'leads' | 'revenue' | 'roas'

const RANGES = [
  { key: '1', label: '24h', days: 1 },
  { key: '7', label: '7d', days: 7 },
  { key: '30', label: '30d', days: 30 },
  { key: 'all', label: 'All', days: 365 },
] as const

function num(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString()
}

function shortDate(iso: string): string {
  const parts = iso.split('-')
  return `${Number(parts[1])}/${Number(parts[2])}`
}

function durationLabel(createdAt?: string): string {
  if (!createdAt) return '—'
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
  if (days === 0) return 'Started today'
  if (days === 1) return 'Running 1 day'
  return `Running ${days} days`
}

/**
 * Campaign Performance (brief Part 3 §12).
 * Meta analytics are org-wide in the contract — labelled honestly. Channel and
 * asset sections use this campaign's assets only.
 */
export default function CampaignPerformancePage() {
  const { campaignId, campaign, assets, showPerformance } = useCampaign()
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30')
  const [metric, setMetric] = useState<MetricKey>('reach')
  const [summary, setSummary] = useState<MetaSummary | null>(null)
  const [prevSummary, setPrevSummary] = useState<MetaSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!showPerformance) return
    setLoading(true)
    setError(null)
    const days = RANGES.find((r) => r.key === range)?.days ?? 30
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const prevFrom = new Date(Date.now() - days * 2 * 86_400_000).toISOString().slice(0, 10)
    const qs = `?from=${from}`
    Promise.all([
      api.get<MetaSummary>(`/meta/analytics/summary${qs}`).catch(() => null),
      api.get<MetaSummary>(`/meta/analytics/summary?from=${prevFrom}`).catch(() => null),
      api
        .get<{ data: TrendPoint[] }>(`/meta/analytics/timeseries${qs}`)
        .then((r) => r.data)
        .catch(() => [] as TrendPoint[]),
    ])
      .then(([s, p, t]) => {
        setSummary(s)
        setPrevSummary(p)
        setTrend(t)
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load performance'),
      )
      .finally(() => setLoading(false))
  }, [range, showPerformance])

  useEffect(load, [load])

  const delta = useCallback(
    (key: keyof MetaSummary) => {
      if (!summary || !prevSummary) return undefined
      const next = summary[key]
      const prev = prevSummary[key]
      if (typeof next !== 'number' || typeof prev !== 'number') return undefined
      if (prev <= 0 && next <= 0) return undefined
      if (prev <= 0) return { dir: 'up' as const, text: '+100%' }
      const pct = Math.round(((next - prev) / prev) * 100)
      if (pct === 0) return undefined
      return {
        dir: pct > 0 ? ('up' as const) : ('down' as const),
        text: `${pct > 0 ? '+' : ''}${pct}%`,
      }
    },
    [summary, prevSummary],
  )

  const spark = useCallback(
    (key: keyof TrendPoint) => trend.map((p) => Number(p[key]) || 0),
    [trend],
  )

  const roas =
    summary && summary.spend > 0 && summary.leads > 0
      ? summary.leads / (summary.spend / 1000 || 1)
      : undefined

  const channelBars = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of assets ?? []) {
      if (!['PUBLISHED', 'SCHEDULED', 'PUBLISHING'].includes(a.status)) continue
      m.set(a.platform, (m.get(a.platform) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [assets])

  const ranked = useMemo(() => {
    const live = (assets ?? []).filter((a) =>
      ['PUBLISHED', 'SCHEDULED', 'APPROVED'].includes(a.status),
    )
    const scored = live.map((a) => ({
      asset: a,
      score: (a.body?.length ?? 0) + (a.mediaUrl ? 500 : 0) + (a.status === 'PUBLISHED' ? 200 : 0),
    }))
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.asset)
  }, [assets])

  const chartSeries = useMemo(() => {
    const key: keyof TrendPoint =
      metric === 'clicks'
        ? 'clicks'
        : metric === 'leads' || metric === 'conversions'
          ? 'leads'
          : metric === 'revenue' || metric === 'roas'
            ? 'spend'
            : 'impressions'
    return [
      {
        name: metric === 'reach' ? 'Impressions' : key.charAt(0).toUpperCase() + key.slice(1),
        data: trend.map((p) => ({ label: shortDate(p.date), value: Number(p[key]) || 0 })),
      },
    ]
  }, [trend, metric])

  if (assets === null) return <SkeletonList />

  if (!showPerformance) {
    return (
      <EmptyState
        icon="bar-chart"
        title="Performance unlocks after publish"
        hint="Once an asset is scheduled or published, live metrics appear here."
      />
    )
  }

  return (
    <FadeIn>
      <div className="perf">
        <div className="perf__main">
          <header className="perf__header">
            <div>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <h2 className="perf__title">{campaign?.name ?? 'Campaign'}</h2>
                <StatusPill status={toStatus(campaign?.status ?? 'LIVE')} />
              </div>
              <p className="type-caption" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                {durationLabel(campaign?.createdAt)}
              </p>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn ghost sm"
                disabled
                title="Pause is not in the campaign API contract"
              >
                <Icon name="pause" size={14} /> Pause
              </button>
              <Link
                className="btn primary sm"
                href={`/app/create?prompt=${encodeURIComponent('Improve this campaign')}`}
              >
                <Icon name="sparkles" size={14} /> Improve campaign
              </Link>
            </div>
          </header>

          <p className="type-caption" style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            Reach, clicks, leads and spend come from org Meta insights (not campaign-scoped in the
            API). Channel and asset sections below are this campaign only.
          </p>

          {error ? <ErrorState message={error} onRetry={load} /> : null}

          {loading && !summary ? (
            <TileSkeleton count={6} />
          ) : (
            <div className="perf__tiles">
              <MetricTile
                label="Reach"
                value={num(summary?.reach)}
                {...(delta('reach') ? { delta: delta('reach') } : {})}
                sparkline={spark('impressions')}
                onClick={() => setMetric('reach')}
              />
              <MetricTile
                label="Clicks"
                value={num(summary?.clicks)}
                {...(delta('clicks') ? { delta: delta('clicks') } : {})}
                sparkline={spark('clicks')}
                onClick={() => setMetric('clicks')}
              />
              <MetricTile label="Conversions" value="—" onClick={() => setMetric('conversions')} />
              <MetricTile
                label="Leads"
                value={num(summary?.leads)}
                {...(delta('leads') ? { delta: delta('leads') } : {})}
                sparkline={spark('leads')}
                onClick={() => setMetric('leads')}
              />
              <MetricTile label="Revenue" value="—" onClick={() => setMetric('revenue')} />
              <MetricTile
                label="ROAS"
                value={roas != null ? roas.toFixed(2) : '—'}
                onClick={() => setMetric('roas')}
              />
            </div>
          )}

          <div className="perf__chart-card">
            <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 className="type-body-strong" style={{ margin: 0, fontSize: 15 }}>
                {metric.charAt(0).toUpperCase() + metric.slice(1)} over time
              </h3>
              <div className="row" style={{ gap: 6 }}>
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`chip ${range === r.key ? 'on' : ''}`}
                    onClick={() => setRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {trend.length === 0 ? (
              <EmptyState
                icon="activity"
                title="No timeseries yet"
                hint="Connect Meta and run ads to populate this chart."
              />
            ) : (
              <LineChart series={chartSeries} height={220} />
            )}
          </div>

          <div className="perf__chart-card">
            <h3 className="type-body-strong" style={{ margin: '0 0 12px', fontSize: 15 }}>
              Channel comparison
            </h3>
            {channelBars.length === 0 ? (
              <EmptyState
                icon="share"
                title="No published channels yet"
                hint="Scheduled and published assets for this campaign appear here."
              />
            ) : (
              <HorizontalBarChart
                data={channelBars}
                height={Math.max(120, channelBars.length * 36)}
              />
            )}
          </div>

          <div className="perf__split">
            <section>
              <h3 className="type-body-strong" style={{ margin: '0 0 12px', fontSize: 15 }}>
                Top performing
              </h3>
              <AssetStack assets={ranked.slice(0, 3)} empty="Not enough live assets yet." />
            </section>
            <section>
              <h3 className="type-body-strong" style={{ margin: '0 0 12px', fontSize: 15 }}>
                Bottom performing
              </h3>
              <AssetStack
                assets={ranked.length > 3 ? ranked.slice(-3).reverse() : []}
                empty="Need more assets to compare."
              />
            </section>
          </div>

          <section className="perf__chart-card">
            <div className="spread" style={{ marginBottom: 12 }}>
              <h3 className="type-body-strong" style={{ margin: 0, fontSize: 15 }}>
                All assets
              </h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => exportAssetsCsv(assets ?? [], campaign?.name ?? 'campaign')}
              >
                <Icon name="download" size={14} /> Export
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {(assets ?? []).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <PlatformIcon platform={a.platform} size={14} />
                          {a.platform}
                        </span>
                      </td>
                      <td>{kindLabel(a.kind)}</td>
                      <td>
                        <StatusPill status={toStatus(a.status)} />
                      </td>
                      <td className="type-caption">{(a.caption || a.body).slice(0, 80)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="perf__rail">
          <h3 className="type-body-strong" style={{ margin: '0 0 12px', fontSize: 15 }}>
            Insights
          </h3>
          <InsightRail summary={summary} channelBars={channelBars} campaignId={campaignId} />
        </aside>
      </div>
    </FadeIn>
  )
}

function AssetStack({ assets, empty }: { assets: Asset[]; empty: string }) {
  if (assets.length === 0) {
    return (
      <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
        {empty}
      </p>
    )
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      {assets.map((a) => (
        <AssetCard
          key={a.id}
          platform={a.platform}
          kind={a.kind}
          status={a.status}
          body={a.caption || a.body}
          title={a.title}
          mediaUrl={a.mediaUrl}
        />
      ))}
    </div>
  )
}

function InsightRail({
  summary,
  channelBars,
  campaignId,
}: {
  summary: MetaSummary | null
  channelBars: { label: string; value: number }[]
  campaignId: string
}) {
  const items: { text: string; href: string; label: string }[] = []
  if (summary && summary.ctr > 0 && summary.ctr < 0.01) {
    items.push({
      text: `CTR is ${(summary.ctr * 100).toFixed(2)}% — creative refresh may help.`,
      href: `/app/campaigns/${campaignId}/assets`,
      label: 'Review assets',
    })
  }
  if (channelBars[0]) {
    items.push({
      text: `${channelBars[0].label} leads this campaign’s published mix (${channelBars[0].value} assets).`,
      href: `/app/campaigns/${campaignId}/schedule`,
      label: 'Open schedule',
    })
  }
  if (summary && summary.leads === 0) {
    items.push({
      text: 'No Meta leads in this range yet. Check forms and offer clarity.',
      href: `/app/create?prompt=${encodeURIComponent('Improve lead generation for this campaign')}`,
      label: 'Improve',
    })
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title="Insights arrive with data"
        hint="Connect Meta and publish assets to get suggested actions here."
      />
    )
  }
  return (
    <ul className="perf-insights">
      {items.map((it) => (
        <li key={it.text}>
          <p className="type-body">{it.text}</p>
          <Link className="btn sm" href={it.href}>
            {it.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function exportAssetsCsv(assets: Asset[], name: string) {
  const rows = [
    ['id', 'platform', 'kind', 'status', 'body'],
    ...assets.map((a) => [a.id, a.platform, a.kind, a.status, JSON.stringify(a.body ?? '')]),
  ]
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-assets.csv`
  a.click()
  URL.revokeObjectURL(url)
}
