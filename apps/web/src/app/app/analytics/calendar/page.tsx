'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { Drawer, ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { FadeIn } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * Content calendar — one month, every platform: what went out, what's queued,
 * and an add button on every day. Adding schedules real work: an approved
 * creative goes through the publish pipeline, a quick post goes through the
 * social scheduler — both delivered by the worker at the chosen time.
 * ──────────────────────────────────────────────────────────────────────────── */

interface CalAsset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  mediaUrl?: string | null
  scheduledFor?: string | null
  publishedAt?: string | null
}

interface SocialPostRow {
  id: string
  status: string
  body: string
  scheduledAt: string | null
  publishedAt: string | null
  targets: { platform: string; status: string }[]
}

interface SocialAccount {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
}

interface CalItem {
  id: string
  platform: string
  label: string
  status: string
  when: string
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const monthLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const dayKey = (d: Date): string =>
  `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function ContentCalendarPage() {
  const toast = useToast()
  const [assets, setAssets] = useState<CalAsset[] | null>(null)
  const [posts, setPosts] = useState<SocialPostRow[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [composeDay, setComposeDay] = useState<Date | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      api.get<{ data: CalAsset[] } | CalAsset[]>('/campaign-assets'),
      api.get<SocialPostRow[]>('/social/posts').catch(() => [] as SocialPostRow[]),
      api.get<SocialAccount[]>('/social/accounts').catch(() => [] as SocialAccount[]),
    ])
      .then(([a, p, acc]) => {
        setAssets(Array.isArray(a) ? a : (a.data ?? []))
        setPosts(p)
        setAccounts(acc.filter((x) => x.status === 'CONNECTED'))
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load the calendar'),
      )
  }, [])
  useEffect(load, [load])

  // Everything with a date lands on the board: campaign assets AND social posts.
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>()
    const push = (when: string | null | undefined, item: Omit<CalItem, 'when'>) => {
      if (!when) return
      const key = when.slice(0, 10)
      const list = m.get(key) ?? []
      list.push({ ...item, when })
      m.set(key, list)
    }
    for (const a of assets ?? []) {
      push(a.publishedAt ?? a.scheduledFor, {
        id: `asset-${a.id}`,
        platform: a.platform,
        label: a.title ?? a.kind,
        status: a.status,
      })
    }
    for (const p of posts) {
      push(p.publishedAt ?? p.scheduledAt, {
        id: `post-${p.id}`,
        platform: p.targets[0]?.platform ?? 'GENERIC',
        label: p.body.slice(0, 40) || 'Post',
        status: p.status,
      })
    }
    return m
  }, [assets, posts])

  if (error) {
    return (
      <>
        <PageHeader title="Content calendar" subtitle="What goes out, and when." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  const first = new Date(month)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = dayKey(new Date())
  const monthTotal = cells.reduce((s, d) => s + (d ? (byDay.get(dayKey(d))?.length ?? 0) : 0), 0)

  return (
    <>
      <PageHeader
        title="Content calendar"
        subtitle="Everything scheduled and published — and a plus on every day to add more."
        actions={
          <div className="row">
            <button
              className="btn sm"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span style={{ fontWeight: 600, minWidth: 150, textAlign: 'center' }}>
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
            {accounts.length === 0 ? (
              <span className="dim" style={{ fontSize: 12 }}>
                Connect a social account (Marketing → Social) to schedule from the calendar.
              </span>
            ) : null}
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
                    fontWeight: 600,
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
                      minHeight: 104,
                      padding: 8,
                      borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      background: isToday ? 'var(--bg-subtle)' : 'transparent',
                      position: 'relative',
                    }}
                  >
                    {d ? (
                      <>
                        <div className="spread" style={{ marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isToday ? 700 : 500,
                              color: isToday ? 'var(--text)' : 'var(--text-dim)',
                            }}
                          >
                            {d.getDate()}
                          </span>
                          <button
                            className="icon-btn"
                            style={{ padding: '0 4px', fontSize: 14, lineHeight: 1 }}
                            onClick={() => setComposeDay(d)}
                            aria-label={`Add content on ${d.toDateString()}`}
                            title="Schedule content on this day"
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        </div>
                        <div className="stack" style={{ gap: 4 }}>
                          {items.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className="row"
                              title={`${item.platform} · ${item.status} — ${item.label}`}
                              style={{
                                gap: 5,
                                fontSize: 11,
                                padding: '3px 6px',
                                borderRadius: 6,
                                background:
                                  item.status === 'PUBLISHED'
                                    ? 'var(--ok-soft)'
                                    : item.status === 'FAILED'
                                      ? 'var(--danger-soft)'
                                      : 'var(--info-soft)',
                                color:
                                  item.status === 'PUBLISHED'
                                    ? 'var(--ok)'
                                    : item.status === 'FAILED'
                                      ? 'var(--danger)'
                                      : 'var(--info)',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <PlatformIcon platform={item.platform} size={11} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.label}
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
        </FadeIn>
      )}

      {composeDay ? (
        <DayComposer
          day={composeDay}
          accounts={accounts}
          approved={(assets ?? []).filter((a) => a.status === 'APPROVED')}
          onClose={() => setComposeDay(null)}
          onDone={() => {
            setComposeDay(null)
            load()
          }}
        />
      ) : null}
    </>
  )
}

// ── Day composer: schedule an approved creative, or write a quick post ────────

function DayComposer({
  day,
  accounts,
  approved,
  onClose,
  onDone,
}: {
  day: Date
  accounts: SocialAccount[]
  approved: CalAsset[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [time, setTime] = useState('10:00')
  const [chosen, setChosen] = useState<Set<string>>(new Set(accounts.map((a) => a.id)))
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const when = (): string => {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(day)
    d.setHours(h ?? 10, m ?? 0, 0, 0)
    return d.toISOString()
  }

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function scheduleAsset(asset: CalAsset) {
    if (chosen.size === 0) {
      toast.push('error', 'Pick at least one account')
      return
    }
    setBusy(asset.id)
    try {
      await api.post(`/campaign-assets/${asset.id}/publish`, {
        accountIds: [...chosen],
        scheduledAt: when(),
      })
      toast.push('success', 'Scheduled — the worker publishes it at the chosen time')
      onDone()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Scheduling failed')
      setBusy(null)
    }
  }

  async function schedulePost() {
    if (!body.trim() || chosen.size === 0) return
    setBusy('compose')
    try {
      await api.post('/social/posts', {
        body: body.trim(),
        accountIds: [...chosen],
        scheduledAt: when(),
      })
      toast.push('success', 'Post scheduled')
      onDone()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Scheduling failed')
      setBusy(null)
    }
  }

  return (
    <Drawer
      open
      title={`Schedule for ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
      onClose={onClose}
    >
      {accounts.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No connected social accounts yet. Connect one under Marketing → Social, then schedule from
          here.
        </p>
      ) : (
        <>
          <Field label="Time">
            <input
              className="input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ maxWidth: 140 }}
            />
          </Field>

          <Field label="Post to">
            <div className="stack" style={{ gap: 6 }}>
              {accounts.map((a) => (
                <label
                  key={a.id}
                  className="row"
                  style={{ gap: 10, cursor: 'pointer', padding: '4px 2px' }}
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(a.id)}
                    onChange={() => toggle(a.id)}
                    style={{ margin: 0 }}
                  />
                  <PlatformIcon platform={a.platform} size={15} />
                  <span style={{ fontSize: 13 }}>{a.displayName ?? a.handle ?? a.platform}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Ready-to-go creatives from the AI Engine. */}
          {approved.length > 0 ? (
            <Field label="Schedule an approved creative">
              <div className="stack" style={{ gap: 8 }}>
                {approved.slice(0, 8).map((a) => (
                  <div key={a.id} className="asset-row" style={{ padding: 10, cursor: 'default' }}>
                    {a.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.mediaUrl}
                        alt=""
                        style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 8 }}
                      />
                    ) : (
                      <PlatformIcon platform={a.platform} size={18} />
                    )}
                    <div className="body">
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title ?? a.kind}</div>
                      <div className="dim" style={{ fontSize: 11 }}>
                        {a.platform}
                      </div>
                    </div>
                    <button
                      className="btn sm primary"
                      disabled={busy !== null}
                      onClick={() => void scheduleAsset(a)}
                    >
                      {busy === a.id ? <Spinner /> : 'Schedule'}
                    </button>
                  </div>
                ))}
              </div>
            </Field>
          ) : null}

          <Field
            label="Or write a quick post"
            hint="Goes out on the selected accounts at the chosen time."
          >
            <textarea
              className="input"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What do you want to say?"
            />
          </Field>
          <button
            className="btn primary"
            disabled={busy !== null || !body.trim() || chosen.size === 0}
            onClick={() => void schedulePost()}
          >
            {busy === 'compose' ? <Spinner /> : 'Schedule post'}
          </button>
        </>
      )}
    </Drawer>
  )
}
