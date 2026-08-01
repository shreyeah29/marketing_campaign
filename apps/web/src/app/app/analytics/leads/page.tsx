'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, TableSkeleton } from '@/components/kit'
import { BarChart, LineChart } from '@/components/charts'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * Lead analytics — how leads are managed: where they come from, how they move
 * through the funnel, and which sources actually turn into business.
 * ──────────────────────────────────────────────────────────────────────────── */

interface LeadAnalytics {
  summary: { total: number; new30d: number; converted: number; conversionRatePercent: number }
  funnel: { stage: string; count: number }[]
  bySource: {
    source: string
    total: number
    converted: number
    conversionRatePercent: number
    valueUsd: string
  }[]
  series: { date: string; leads: number }[]
}

const STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NURTURING: 'Nurturing',
  UNQUALIFIED: 'Lost',
  CONVERTED: 'Completed',
}

const SOURCE_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  FORM: 'Website form',
  EMAIL: 'Email',
  MANUAL: 'Manual',
  UNKNOWN: 'Unknown',
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function LeadAnalyticsPage() {
  const [data, setData] = useState<LeadAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<LeadAnalytics>('/analytics/leads')
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load lead analytics'),
      )
  }, [])
  useEffect(load, [load])

  if (error) {
    return (
      <>
        <PageHeader title="Lead analytics" subtitle="Where leads come from and how they move." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Lead analytics" subtitle="Where leads come from and how they move." />
        <TableSkeleton cols={4} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Lead analytics"
        subtitle="Where your leads come from, how they progress, and which sources produce business."
      />

      <div className="stack" style={{ gap: 22 }}>
        <Stagger className="cols-4 grid" interval={0.05}>
          <StaggerItem>
            <StatCard label="Total leads" value={data.summary.total.toLocaleString()} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="New · 30 days" value={data.summary.new30d.toLocaleString()} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Completed" value={data.summary.converted.toLocaleString()} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Conversion rate" value={`${data.summary.conversionRatePercent}%`} />
          </StaggerItem>
        </Stagger>

        <FadeIn
          delay={0.12}
          className="cols-2 split grid"
          style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'stretch' }}
        >
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>New leads</div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              Last 30 days
            </div>
            <LineChart
              data={data.series.map((p) => ({ label: shortDate(p.date), value: p.leads }))}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Funnel</div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              Every stage, first touch to completed
            </div>
            <BarChart
              data={data.funnel.map((f) => ({
                label: STAGE_LABELS[f.stage] ?? f.stage,
                value: f.count,
              }))}
            />
          </div>
        </FadeIn>

        <FadeIn delay={0.2} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 4px', fontWeight: 600 }}>Source performance</div>
          <p className="dim" style={{ padding: '0 18px 10px', fontSize: 12 }}>
            Which channels bring leads — and which bring leads that complete.
          </p>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Leads</th>
                  <th>Completed</th>
                  <th>Conversion</th>
                  <th>Pipeline value</th>
                </tr>
              </thead>
              <tbody>
                {data.bySource.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="dim" style={{ textAlign: 'center', padding: 28 }}>
                      No leads yet — analytics appear as soon as leads arrive.
                    </td>
                  </tr>
                ) : (
                  data.bySource.map((s) => (
                    <tr key={s.source}>
                      <td style={{ fontWeight: 600 }}>{SOURCE_LABELS[s.source] ?? s.source}</td>
                      <td>{s.total}</td>
                      <td>{s.converted}</td>
                      <td>
                        <span
                          style={{
                            color:
                              s.conversionRatePercent >= 20
                                ? 'var(--ok)'
                                : s.conversionRatePercent > 0
                                  ? 'var(--warn)'
                                  : 'var(--text-dim)',
                            fontWeight: 600,
                          }}
                        >
                          {s.conversionRatePercent}%
                        </span>
                      </td>
                      <td>${Number(s.valueUsd).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </FadeIn>
      </div>
    </>
  )
}
