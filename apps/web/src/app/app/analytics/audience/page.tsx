'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, ChartSkeleton, TableSkeleton } from '@/components/kit'
import { HorizontalBarChart } from '@/components/charts'
import { FadeIn } from '@/components/motion'

import { useAnalyticsFilters } from '../layout'

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

function fromDate(days: string): string {
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10)
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function num(v: number): string {
  return v.toLocaleString()
}

function bestSegmentSentence(age: Bucket[], gender: Bucket[], geo: Bucket[]): string | null {
  type Candidate = { dimension: string; label: string; reach: number; leads: number }
  const candidates: Candidate[] = []

  for (const b of age) {
    if (b.reach > 0)
      candidates.push({ dimension: 'age', label: b.value, reach: b.reach, leads: b.leads })
  }
  for (const b of gender) {
    if (b.reach > 0)
      candidates.push({
        dimension: 'gender',
        label: titleCase(b.value),
        reach: b.reach,
        leads: b.leads,
      })
  }
  for (const b of geo) {
    if (b.reach > 0)
      candidates.push({ dimension: 'region', label: b.value, reach: b.reach, leads: b.leads })
  }

  if (candidates.length === 0) return null

  const top = candidates.reduce((a, b) => (b.reach > a.reach ? b : a))
  const leadNote = top.leads > 0 ? ` and generated ${top.leads.toLocaleString()} leads` : ''
  const dimLabel =
    top.dimension === 'age'
      ? `${top.label} year-olds`
      : top.dimension === 'gender'
        ? `${top.label} audience`
        : `people in ${top.label}`

  return `Your best-performing segment is ${dimLabel}, reaching ${top.reach.toLocaleString()} people${leadNote} in this period.`
}

export default function AnalyticsAudiencePage() {
  const { days } = useAnalyticsFilters()
  const [demo, setDemo] = useState<Demographics | null>(null)
  const [geo, setGeo] = useState<Bucket[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [noMeta, setNoMeta] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    setNoMeta(false)
    const qs = `?from=${fromDate(days)}`
    Promise.all([
      api.get<Demographics>(`/meta/analytics/demographics${qs}`).catch(() => null),
      api.get<{ data: Bucket[] }>(`/meta/analytics/geography${qs}`).catch(() => ({ data: [] })),
    ])
      .then(([d, g]) => {
        const age = d?.age ?? []
        const gender = d?.gender ?? []
        const geography = g?.data ?? []
        if (age.length === 0 && gender.length === 0 && geography.length === 0) {
          setNoMeta(true)
        }
        setDemo({ age, gender })
        setGeo(geography)
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load audience data'),
      )
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const bestSegment = useMemo(
    () => bestSegmentSentence(demo?.age ?? [], demo?.gender ?? [], geo),
    [demo, geo],
  )

  const hasAge = (demo?.age.length ?? 0) > 0
  const hasGender = (demo?.gender.length ?? 0) > 0
  const hasGeo = geo.length > 0

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  if (loading) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <ChartSkeleton height={200} />
        <TableSkeleton cols={4} rows={5} />
      </div>
    )
  }

  if (noMeta || (!hasAge && !hasGender && !hasGeo)) {
    return (
      <FadeIn>
        <EmptyState
          icon="users"
          title="No audience data yet"
          hint="Age, gender, and location breakdowns come from Meta once your ad account is connected and campaigns are delivering. Last 7–90 days use the date filter above."
          action={
            <Link href="/app/connections" className="btn primary">
              Connect Meta
            </Link>
          }
        />
      </FadeIn>
    )
  }

  const geoSorted = [...geo].sort((a, b) => b.reach - a.reach)

  return (
    <FadeIn>
      <div className="stack" style={{ gap: 22 }}>
        {bestSegment ? (
          <div
            className="card"
            style={{
              padding: '14px 18px',
              borderLeft: '3px solid var(--cobalt-600, var(--chart-2))',
            }}
          >
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{bestSegment}</p>
          </div>
        ) : null}

        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          Audience data from Meta ad delivery · last {days} days
        </p>

        <div
          className="cols-2 split grid"
          style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch', gap: 16 }}
        >
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Age</div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
              Reach by age band
            </div>
            {hasAge ? (
              <HorizontalBarChart
                data={(demo?.age ?? []).map((b) => ({ label: b.value, value: b.reach }))}
                title="Audience by age"
              />
            ) : (
              <EmptyState
                icon="users"
                title="No age data"
                hint="Age bands appear once Meta reports delivery for your ads."
              />
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Gender</div>
            <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
              Reach by gender
            </div>
            {hasGender ? (
              <HorizontalBarChart
                data={(demo?.gender ?? []).map((b) => ({
                  label: titleCase(b.value),
                  value: b.reach,
                }))}
                title="Audience by gender"
              />
            ) : (
              <EmptyState
                icon="users"
                title="No gender data"
                hint="Gender splits appear once Meta reports delivery for your ads."
              />
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 4px', fontWeight: 600 }}>Geography</div>
          <p className="dim" style={{ padding: '0 18px 10px', fontSize: 12, margin: 0 }}>
            Top regions by reach — from /meta/analytics/geography
          </p>
          {hasGeo ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Reach</th>
                  <th>Impressions</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {geoSorted.map((b) => (
                  <tr key={b.value}>
                    <td style={{ fontWeight: 600 }}>{b.value}</td>
                    <td style={{ fontFamily: 'var(--font-code)' }}>{num(b.reach)}</td>
                    <td style={{ fontFamily: 'var(--font-code)' }}>{num(b.impressions)}</td>
                    <td style={{ fontFamily: 'var(--font-code)' }}>{num(b.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              className="dim"
              style={{ padding: '24px 18px', textAlign: 'center', fontSize: 13 }}
            >
              No geography data — connect Meta and run ads to populate regions.
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  )
}
