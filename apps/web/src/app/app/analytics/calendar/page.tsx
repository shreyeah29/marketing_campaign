'use client'

import { useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, TableSkeleton } from '@/components/kit'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { FadeIn } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * Content calendar — one month, every platform: what went out and what's
 * queued to go out, day by day.
 * ──────────────────────────────────────────────────────────────────────────── */

interface CalAsset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  scheduledFor?: string | null
  publishedAt?: string | null
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function ContentCalendarPage() {
  const [assets, setAssets] = useState<CalAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    api
      .get<{ data: CalAsset[] } | CalAsset[]>('/campaign-assets')
      .then((r) => setAssets(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load the calendar'),
      )
  }, [])

  // Assets bucketed to the day they go (or went) out.
  const byDay = useMemo(() => {
    const m = new Map<string, CalAsset[]>()
    for (const a of assets ?? []) {
      const when = a.publishedAt ?? a.scheduledFor
      if (!when) continue
      const key = when.slice(0, 10)
      const list = m.get(key) ?? []
      list.push(a)
      m.set(key, list)
    }
    return m
  }, [assets])

  if (error) {
    return (
      <>
        <PageHeader title="Content calendar" subtitle="What goes out, and when." />
        <ErrorState message={error} />
      </>
    )
  }

  // Build the month grid: pad to Monday, fill the weeks.
  const first = new Date(month)
  const startPad = (first.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = new Date().toISOString().slice(0, 10)
  const dayKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const monthTotal = cells.reduce((s, d) => s + (d ? (byDay.get(dayKey(d))?.length ?? 0) : 0), 0)

  return (
    <>
      <PageHeader
        title="Content calendar"
        subtitle="Every scheduled and published piece, across all platforms, in one month view."
        actions={
          <div className="row">
            <button
              className="btn sm"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span style={{ fontWeight: 700, minWidth: 140, textAlign: 'center' }}>
              {monthLabel(month)}
            </span>
            <button
              className="btn sm"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <Icon name="chevron-right" size={14} />
            </button>
          </div>
        }
      />

      {assets === null ? (
        <TableSkeleton rows={5} cols={7} />
      ) : (
        <FadeIn>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <span className="badge info">{monthTotal} items this month</span>
          </div>
          <div className="table-wrap" style={{ overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {DOW.map((d) => (
                <div
                  key={d}
                  className="dim"
                  style={{
                    padding: '10px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {cells.map((d, i) => {
                const items = d ? (byDay.get(dayKey(d)) ?? []) : []
                const isToday = d ? dayKey(d) === todayKey : false
                return (
                  <div
                    key={i}
                    style={{
                      minHeight: 96,
                      padding: 8,
                      borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      background: isToday ? 'var(--primary-soft)' : 'transparent',
                    }}
                  >
                    {d ? (
                      <>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: isToday ? 700 : 500,
                            color: isToday ? 'var(--color-primary)' : 'var(--text-dim)',
                            marginBottom: 6,
                          }}
                        >
                          {d.getDate()}
                        </div>
                        <div className="stack" style={{ gap: 4 }}>
                          {items.slice(0, 3).map((a) => (
                            <span
                              key={a.id}
                              className="row"
                              title={`${a.platform} · ${a.status} — ${a.title ?? a.body.slice(0, 80)}`}
                              style={{
                                gap: 5,
                                fontSize: 11,
                                padding: '3px 6px',
                                borderRadius: 6,
                                background:
                                  a.status === 'PUBLISHED'
                                    ? 'var(--ok-soft)'
                                    : a.status === 'FAILED'
                                      ? 'var(--danger-soft)'
                                      : 'var(--info-soft)',
                                color:
                                  a.status === 'PUBLISHED'
                                    ? 'var(--ok)'
                                    : a.status === 'FAILED'
                                      ? 'var(--danger)'
                                      : 'var(--info)',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <PlatformIcon platform={a.platform} size={11} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {a.title ?? a.kind}
                              </span>
                            </span>
                          ))}
                          {items.length > 3 ? (
                            <span className="dim" style={{ fontSize: 10 }}>
                              +{items.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>
            <span className="badge info" style={{ marginRight: 6 }}>
              scheduled
            </span>
            <span className="badge ok" style={{ marginRight: 6 }}>
              published
            </span>
            Items come from your campaigns — approve and publish a creative and it appears here.
          </p>
        </FadeIn>
      )}
    </>
  )
}
