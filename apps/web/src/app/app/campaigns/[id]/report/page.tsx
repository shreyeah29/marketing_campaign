'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { EmptyState } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, StatusPill, toStatus } from '@/components/status'
import { useCampaign } from '@/components/campaign-studio'

interface RevenueSummary {
  summary?: {
    wonRevenueUsd?: string
    wonDeals?: number
    pipelineUsd?: string
    openDeals?: number
  }
}

interface MetaSummary {
  impressions?: number
  reach?: number
  clicks?: number
  spend?: number
  leads?: number
  ctr?: number
  cpl?: number
}

function fmtMoney(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '—'
  const n = Number(raw)
  if (Number.isNaN(n)) return String(raw)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString()
}

export default function CampaignReportPage() {
  const { campaign, assets, showReport } = useCampaign()
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null)
  const [meta, setMeta] = useState<MetaSummary | null>(null)

  useEffect(() => {
    if (!showReport) return
    void Promise.all([
      api.get<RevenueSummary>('/analytics/revenue').catch(() => null),
      api.get<MetaSummary>('/meta/analytics/summary').catch(() => null),
    ]).then(([r, m]) => {
      setRevenue(r)
      setMeta(m)
    })
  }, [showReport])

  const stats = useMemo(() => {
    const list = assets ?? []
    const total = list.length
    const published = list.filter((a) => a.status === 'PUBLISHED').length
    const approved = list.filter((a) => a.status === 'APPROVED').length
    const failed = list.filter((a) => a.status === 'FAILED').length
    const byPlatform = new Map<string, number>()
    for (const a of list) {
      const p = a.platform.toUpperCase()
      byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1)
    }
    const publishedAssets = list.filter((a) => a.status === 'PUBLISHED')
    const scored = list.map((a) => ({
      asset: a,
      score:
        (a.status === 'PUBLISHED' ? 100 : a.status === 'APPROVED' ? 60 : 20) +
        Math.min(a.body.length / 20, 40),
    }))
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]?.asset
    const worst = scored[scored.length - 1]?.asset
    return { total, published, approved, failed, byPlatform, publishedAssets, best, worst }
  }, [assets])

  if (!campaign) return null

  if (!showReport) {
    return (
      <EmptyState
        icon="file-text"
        title="Report available when the campaign ends"
        hint="When status is completed or archived, this page summarises the run from real campaign and workspace data."
      />
    )
  }

  const wonRevenue = revenue?.summary?.wonRevenueUsd
  const metaReach = meta?.reach
  const metaLeads = meta?.leads
  const metaSpend = meta?.spend
  const roas =
    metaSpend && Number(metaSpend) > 0 && wonRevenue
      ? (Number(wonRevenue) / Number(metaSpend)).toFixed(1)
      : null

  const dateRange = campaign.createdAt
    ? `Started ${new Date(campaign.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'Campaign period'

  const recommendations = [
    {
      n: 1,
      text: 'Double down on channels with the most published assets',
      prompt: `Improve my campaign "${campaign.name}" by shifting budget to the best-performing channels.`,
    },
    {
      n: 2,
      text: 'Refresh creative on underperforming posts',
      prompt: `Rewrite underperforming assets for "${campaign.name}" with shorter hooks and clearer CTAs.`,
    },
    {
      n: 3,
      text: 'Launch a follow-up remarketing pass',
      prompt: `Plan a 14-day remarketing follow-up after "${campaign.name}" for people who engaged but did not convert.`,
    },
  ]

  const nextSuggestions = [
    { label: 'Improve this campaign', prompt: `Improve this campaign: ${campaign.name}` },
    {
      label: 'Run a sequel campaign',
      prompt: `Plan a sequel campaign building on ${campaign.name}`,
    },
    {
      label: 'Try a new channel mix',
      prompt: 'Plan a campaign testing one new channel with a small budget',
    },
  ]

  return (
    <FadeIn>
      <article className="rpt card" style={{ padding: 32 }}>
        <header className="rpt__head spread" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div
              className="dim"
              style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Campaign report
            </div>
            <h1
              className="rpt__title"
              style={{ fontSize: 28, letterSpacing: '-0.02em', marginTop: 8 }}
            >
              {campaign.name}
            </h1>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              {dateRange}
              {campaign.status ? ` · ${campaign.status}` : ''}
            </p>
          </div>
          <button type="button" className="btn" onClick={() => window.print()}>
            Export PDF
          </button>
        </header>

        <section className="rpt__section">
          <h2>Executive summary</h2>
          <p className="muted" style={{ lineHeight: 1.7, fontSize: 15 }}>
            {campaign.name} ran with {stats.total} assets across{' '}
            <span className="mono">{stats.byPlatform.size}</span> channels, of which{' '}
            <span className="mono">{stats.published}</span> were published
            {stats.failed > 0 ? (
              <>
                {' '}
                and <span className="mono">{stats.failed}</span> failed generation
              </>
            ) : null}
            .
            {metaReach != null ? (
              <>
                {' '}
                Meta ads in this workspace reported reach of{' '}
                <span className="mono">{fmtNum(metaReach)}</span>
                {metaLeads != null ? (
                  <>
                    {' '}
                    and <span className="mono">{fmtNum(metaLeads)}</span> leads
                  </>
                ) : null}
                .
              </>
            ) : null}
            {wonRevenue ? (
              <>
                {' '}
                Workspace revenue attribution shows{' '}
                <span className="mono">{fmtMoney(wonRevenue)}</span> won from deals linked to
                campaigns in this org (not necessarily this campaign alone).
              </>
            ) : null}
            {campaign.objective ? <> Objective: {campaign.objective}.</> : null}
          </p>
        </section>

        <section className="rpt__section">
          <h2>Results</h2>
          <div className="rpt__grid">
            <div className="rpt__metric">
              <span className="rpt__metric-label">Revenue (org)</span>
              <span className="mono rpt__metric-value">{fmtMoney(wonRevenue)}</span>
            </div>
            <div className="rpt__metric">
              <span className="rpt__metric-label">Pipeline (org)</span>
              <span className="mono rpt__metric-value">
                {fmtMoney(revenue?.summary?.pipelineUsd)}
              </span>
            </div>
            <div className="rpt__metric">
              <span className="rpt__metric-label">ROAS (est.)</span>
              <span className="mono rpt__metric-value">{roas ? `${roas}×` : '—'}</span>
              <span className="dim" style={{ fontSize: 11 }}>
                When Meta spend and org revenue both exist
              </span>
            </div>
            <div className="rpt__metric">
              <span className="rpt__metric-label">Leads (Meta)</span>
              <span className="mono rpt__metric-value">{fmtNum(metaLeads)}</span>
            </div>
            <div className="rpt__metric">
              <span className="rpt__metric-label">Reach (Meta)</span>
              <span className="mono rpt__metric-value">{fmtNum(metaReach)}</span>
            </div>
            <div className="rpt__metric">
              <span className="rpt__metric-label">Assets published</span>
              <span className="mono rpt__metric-value">
                {stats.published}/{stats.total}
              </span>
            </div>
          </div>
        </section>

        <section className="rpt__section">
          <h2>Channel breakdown</h2>
          {stats.byPlatform.size === 0 ? (
            <p className="muted">No assets in this campaign.</p>
          ) : (
            <table className="rpt__table table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Assets</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.byPlatform.entries()].map(([platform, count]) => (
                  <tr key={platform}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <PlatformIcon platform={platform} size={16} />
                        {platform.charAt(0) + platform.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="mono">{count}</td>
                    <td className="mono">
                      {
                        (assets ?? []).filter(
                          (a) => a.platform.toUpperCase() === platform && a.status === 'PUBLISHED',
                        ).length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {(stats.best || stats.worst) && stats.total > 1 ? (
          <section className="rpt__section">
            <h2>Creative highlights</h2>
            <p className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
              Ranked by publish status and copy length — a rough proxy until per-asset metrics are
              wired for this campaign.
            </p>
            <div className="cols-2 grid" style={{ gap: 16 }}>
              {stats.best ? (
                <div className="card" style={{ padding: 16 }}>
                  <div className="spread" style={{ marginBottom: 8 }}>
                    <strong>Strongest draft</strong>
                    <StatusPill status={toStatus(stats.best.status)} />
                  </div>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {kindLabel(stats.best.kind)} on {stats.best.platform} — longer copy with{' '}
                    {stats.best.status === 'PUBLISHED' ? 'live' : stats.best.status.toLowerCase()}{' '}
                    status scored highest by this heuristic.
                  </p>
                  <p style={{ fontSize: 13, marginTop: 8 }}>{stats.best.body.slice(0, 200)}…</p>
                </div>
              ) : null}
              {stats.worst && stats.worst.id !== stats.best?.id ? (
                <div className="card" style={{ padding: 16 }}>
                  <div className="spread" style={{ marginBottom: 8 }}>
                    <strong>Needs attention</strong>
                    <StatusPill status={toStatus(stats.worst.status)} />
                  </div>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {kindLabel(stats.worst.kind)} on {stats.worst.platform} — shorter or unpublished
                    copy ranked lowest; consider regenerating or approving before the next run.
                  </p>
                  <p style={{ fontSize: 13, marginTop: 8 }}>{stats.worst.body.slice(0, 200)}…</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {campaign.targetAudience?.description ? (
          <section className="rpt__section">
            <h2>Audience</h2>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {campaign.targetAudience.description}
            </p>
          </section>
        ) : null}

        {campaign.strategy?.summary ? (
          <section className="rpt__section">
            <h2>Strategy recap</h2>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {campaign.strategy.summary}
            </p>
          </section>
        ) : null}

        <section className="rpt__section">
          <h2>Recommendations</h2>
          <ol className="rpt__recs">
            {recommendations.map((r) => (
              <li key={r.n}>
                <Link
                  href={`/app/create?prompt=${encodeURIComponent(r.prompt)}`}
                  className="rpt__rec-link"
                >
                  {r.text}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="rpt__section rpt__next">
          <h2>Next campaign</h2>
          <p className="muted" style={{ marginBottom: 14 }}>
            Start the next loop from the Command Center with a prefilled prompt.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {nextSuggestions.map((s) => (
              <Link
                key={s.label}
                className="btn"
                href={`/app/create?prompt=${encodeURIComponent(s.prompt)}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      </article>
    </FadeIn>
  )
}
