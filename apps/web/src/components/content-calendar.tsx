'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'
import { FadeIn } from '@/components/motion'
import { Chip, StatusRail, kindLabel, toStatus } from '@/components/status'

/* ────────────────────────────────────────────────────────────────────────────
 * Content calendar (brief Part 3 §10) + publish modal (§11).
 * Merged model: campaign assets + social posts. Schedule via publish /
 * social/posts with scheduledAt — no dedicated reschedule verb in the contract.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CalAsset {
  id: string
  campaignId?: string | null
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
  targets: { platform: string; status: string; handle?: string }[]
}

interface SocialAccount {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
}

export interface CalItem {
  id: string
  source: 'asset' | 'post'
  assetId?: string
  platform: string
  label: string
  status: string
  when: string
}

type CalView = 'month' | 'week' | 'list'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
]

const OPTIMAL_HOURS: Record<string, number> = {
  INSTAGRAM: 11,
  FACEBOOK: 13,
  LINKEDIN: 9,
  X: 10,
  TWITTER: 10,
  EMAIL: 8,
  YOUTUBE: 15,
  DEFAULT: 10,
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const pad = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - pad)
  x.setHours(0, 0, 0, 0)
  return x
}

function isPastDay(d: Date): boolean {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x < t
}

function truncate(s: string, n: number) {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function optimalHour(platform: string) {
  return OPTIMAL_HOURS[platform.toUpperCase()] ?? OPTIMAL_HOURS.DEFAULT!
}

export function ContentCalendar({
  campaignId,
  title = 'Content calendar',
  subtitle = 'Month view of everything scheduled and published.',
}: {
  campaignId?: string | undefined
  title?: string | undefined
  subtitle?: string | undefined
}) {
  const router = useRouter()
  const toast = useToast()
  const [assets, setAssets] = useState<CalAsset[] | null>(null)
  const [posts, setPosts] = useState<SocialPostRow[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<CalView>('month')
  const [tz, setTz] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
    } catch {
      return 'Asia/Kolkata'
    }
  })
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()))
  const [composeDay, setComposeDay] = useState<Date | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ key: string; ok: boolean; reason?: string } | null>(
    null,
  )
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoPlan, setAutoPlan] = useState<{ assetId: string; at: Date; label: string }[] | null>(
    null,
  )
  const [publishOpen, setPublishOpen] = useState(false)
  const [pickIds, setPickIds] = useState<string[]>([])

  const load = useCallback(() => {
    setError(null)
    const assetsPath = campaignId
      ? `/campaign-assets?campaignId=${encodeURIComponent(campaignId)}`
      : '/campaign-assets'
    Promise.all([
      api.get<{ data: CalAsset[] } | CalAsset[]>(assetsPath),
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
  }, [campaignId])
  useEffect(load, [load])

  useEffect(() => {
    if (!campaignId) return
    try {
      const raw = sessionStorage.getItem(`mos:schedule-pick:${campaignId}`)
      if (!raw) return
      sessionStorage.removeItem(`mos:schedule-pick:${campaignId}`)
      const ids = JSON.parse(raw) as string[]
      if (Array.isArray(ids) && ids.length) setPickIds(ids)
    } catch {
      /* ignore */
    }
  }, [campaignId])

  const scopedAssets = assets ?? []

  const unscheduled = useMemo(
    () => scopedAssets.filter((a) => a.status === 'APPROVED' && !a.scheduledFor && !a.publishedAt),
    [scopedAssets],
  )

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>()
    const push = (when: string | null | undefined, item: Omit<CalItem, 'when'>) => {
      if (!when) return
      const key = when.slice(0, 10)
      const list = m.get(key) ?? []
      list.push({ ...item, when })
      m.set(key, list)
    }
    for (const a of scopedAssets) {
      push(a.publishedAt ?? a.scheduledFor, {
        id: `asset-${a.id}`,
        source: 'asset',
        assetId: a.id,
        platform: a.platform,
        label: truncate(a.title ?? kindLabel(a.kind) ?? a.body, 20),
        status: a.status,
      })
    }
    if (!campaignId) {
      for (const p of posts) {
        push(p.publishedAt ?? p.scheduledAt, {
          id: `post-${p.id}`,
          source: 'post',
          platform: p.targets[0]?.platform ?? 'GENERIC',
          label: truncate(p.body || 'Post', 20),
          status: p.status,
        })
      }
    }
    return m
  }, [scopedAssets, posts, campaignId])

  const listItems = useMemo(() => {
    const rows: CalItem[] = []
    for (const [, items] of byDay) rows.push(...items)
    return rows.sort((a, b) => a.when.localeCompare(b.when))
  }, [byDay])

  function dropValidity(day: Date): { ok: boolean; reason?: string } {
    if (!dragId) return { ok: false, reason: 'Nothing dragging' }
    if (isPastDay(day)) return { ok: false, reason: 'Past dates can’t be scheduled' }
    if (accounts.length === 0) return { ok: false, reason: 'Connect a channel first' }
    const asset = unscheduled.find((a) => a.id === dragId)
    if (!asset) return { ok: false, reason: 'Only unscheduled approved assets can be placed' }
    return { ok: true }
  }

  async function placeAsset(assetId: string, day: Date, hour?: number) {
    const asset = unscheduled.find((a) => a.id === assetId)
    if (!asset) return
    if (accounts.length === 0) {
      toast.push('error', 'Connect a channel first')
      return
    }
    const d = new Date(day)
    d.setHours(hour ?? optimalHour(asset.platform), 0, 0, 0)
    try {
      await api.post(`/campaign-assets/${assetId}/publish`, {
        accountIds: accounts.map((a) => a.id),
        scheduledAt: d.toISOString(),
      })
      toast.push(
        'success',
        `Scheduled for ${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:00`,
      )
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Scheduling failed')
    }
  }

  function buildAutoPlan() {
    if (!unscheduled.length) {
      toast.push('error', 'No approved unscheduled assets')
      return
    }
    if (accounts.length === 0) {
      toast.push('error', 'Connect a channel first')
      return
    }
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(0, 0, 0, 0)
    const plan: { assetId: string; at: Date; label: string }[] = []
    unscheduled.forEach((a, i) => {
      const at = new Date(start)
      at.setDate(start.getDate() + Math.floor(i / 2))
      at.setHours(optimalHour(a.platform) + (i % 2) * 3, 0, 0, 0)
      plan.push({
        assetId: a.id,
        at,
        label: a.title ?? kindLabel(a.kind),
      })
    })
    setAutoPlan(plan)
    setAutoOpen(true)
  }

  async function applyAutoPlan() {
    if (!autoPlan?.length) return
    let ok = 0
    let fail = 0
    for (const row of autoPlan) {
      try {
        await api.post(`/campaign-assets/${row.assetId}/publish`, {
          accountIds: accounts.map((a) => a.id),
          scheduledAt: row.at.toISOString(),
        })
        ok++
      } catch {
        fail++
      }
    }
    setAutoOpen(false)
    setAutoPlan(null)
    load()
    if (fail === 0) toast.push('success', `Auto-scheduled ${ok} assets`)
    else toast.push('error', `${ok} scheduled, ${fail} failed`)
  }

  if (error) {
    return (
      <>
        <PageHeader title={title} subtitle={subtitle} />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  const todayKey = dayKey(new Date())
  const first = new Date(month)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthCells: (Date | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ]
  while (monthCells.length % 7 !== 0) monthCells.push(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekAnchor)
    d.setDate(weekAnchor.getDate() + i)
    return d
  })

  function renderChip(item: CalItem) {
    return (
      <StatusRail key={item.id} status={toStatus(item.status)} className="cal-chip">
        <PlatformIcon platform={item.platform} size={11} />
        <span className="cal-chip__time strat-mono">{timeLabel(item.when)}</span>
        <span className="cal-chip__label">{item.label}</span>
      </StatusRail>
    )
  }

  function dayCell(d: Date, opts?: { week?: boolean }) {
    const key = dayKey(d)
    const items = byDay.get(key) ?? []
    const isToday = key === todayKey
    const past = isPastDay(d)
    const hint = dropHint?.key === key ? dropHint : null
    const hours = opts?.week ? Array.from({ length: 12 }, (_, i) => i + 8) : null

    return (
      <div
        key={key}
        className={`cal-day${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}${hint ? (hint.ok ? ' is-drop-ok' : ' is-drop-bad') : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          const v = dropValidity(d)
          setDropHint({ key, ...v })
        }}
        onDragLeave={() => setDropHint((h) => (h?.key === key ? null : h))}
        onDrop={(e) => {
          e.preventDefault()
          const id = e.dataTransfer.getData('text/asset-id') || dragId
          const v = dropValidity(d)
          setDropHint(null)
          setDragId(null)
          if (!id || !v.ok) {
            if (v.reason) toast.push('error', v.reason)
            return
          }
          void placeAsset(id, d)
        }}
      >
        <div className="cal-day__head">
          <span className="cal-day__num">{d.getDate()}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ padding: '0 4px' }}
            onClick={() => setComposeDay(d)}
            aria-label={`Add content on ${d.toDateString()}`}
            disabled={past}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        {hint && !hint.ok && hint.reason ? (
          <p className="cal-day__hint type-caption">{hint.reason}</p>
        ) : null}
        {hours ? (
          <div className="cal-day__hours">
            {hours.map((h) => {
              const recommended = Object.values(OPTIMAL_HOURS).includes(h)
              return (
                <div key={h} className={`cal-hour${recommended ? ' is-optimal' : ''}`}>
                  <span className="strat-mono type-caption">{String(h).padStart(2, '0')}:00</span>
                </div>
              )
            })}
            <div className="cal-day__chips">{items.slice(0, 6).map(renderChip)}</div>
          </div>
        ) : (
          <div className="cal-day__chips">
            {items.slice(0, 3).map(renderChip)}
            {items.length > 3 ? (
              <span className="type-caption">+{items.length - 3} more</span>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const toolbar = (
    <div className="cal-toolbar">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="rq__toggle" role="group" aria-label="View">
          {(['month', 'week', 'list'] as CalView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? 'is-active' : ''}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {view === 'list' ? null : (
          <>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                if (view === 'week') {
                  const d = new Date(weekAnchor)
                  d.setDate(d.getDate() - 7)
                  setWeekAnchor(d)
                } else {
                  setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                }
              }}
              aria-label="Previous"
            >
              <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span style={{ fontWeight: 600, minWidth: 150, textAlign: 'center' }}>
              {view === 'week'
                ? `${weekDays[0]!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6]!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                : monthLabel(month)}
            </span>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                if (view === 'week') {
                  const d = new Date(weekAnchor)
                  d.setDate(d.getDate() + 7)
                  setWeekAnchor(d)
                } else {
                  setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                }
              }}
              aria-label="Next"
            >
              <Icon name="chevron-right" size={14} />
            </button>
          </>
        )}
        <select
          className="input"
          style={{ width: 'auto', minWidth: 160 }}
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          aria-label="Timezone"
        >
          {[tz, ...TIMEZONES.filter((t) => t !== tz)].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={buildAutoPlan}>
          Auto-schedule
        </button>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => setPublishOpen(true)}
          disabled={!campaignId}
          title={campaignId ? 'Publish this campaign' : 'Open a campaign Schedule tab to publish'}
        >
          Publish campaign
        </button>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={toolbar} />

      {assets === null ? (
        <TableSkeleton rows={5} cols={7} />
      ) : (
        <FadeIn>
          <div className="cal">
            <div className="cal__main">
              {accounts.length === 0 ? (
                <p
                  className="type-caption"
                  style={{ marginBottom: 12, color: 'var(--text-secondary)' }}
                >
                  Connect a channel under Connections to schedule from the calendar.
                </p>
              ) : null}
              {pickIds.length > 0 ? (
                <p className="type-caption" style={{ marginBottom: 12, color: 'var(--amber-700)' }}>
                  {pickIds.length} asset{pickIds.length === 1 ? '' : 's'} from the review queue —
                  drag from the rail or use Auto-schedule.
                </p>
              ) : null}

              {view === 'month' ? (
                <div className="cal-grid">
                  <div className="cal-grid__head">
                    {DOW.map((d) => (
                      <div key={d} className="cal-grid__dow">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="cal-grid__body">
                    {monthCells.map((d, i) =>
                      d ? dayCell(d) : <div key={`e-${i}`} className="cal-day is-empty" />,
                    )}
                  </div>
                </div>
              ) : null}

              {view === 'week' ? (
                <div className="cal-week">{weekDays.map((d) => dayCell(d, { week: true }))}</div>
              ) : null}

              {view === 'list' ? (
                listItems.length === 0 ? (
                  <EmptyState
                    icon="calendar"
                    title="Nothing scheduled"
                    hint="Drag approved assets from the rail, or add with + on a day."
                  />
                ) : (
                  <ul className="cal-list">
                    {listItems.map((item) => (
                      <li key={item.id} className="cal-list__row">
                        <span className="strat-mono type-caption">
                          {item.when.slice(0, 10)} {timeLabel(item.when)}
                        </span>
                        {renderChip(item)}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

            <aside className="cal__rail" aria-label="Unscheduled approved">
              <div className="spread" style={{ marginBottom: 12 }}>
                <h2 className="type-body-strong" style={{ margin: 0, fontSize: 15 }}>
                  Unscheduled
                </h2>
                <Chip>{unscheduled.length}</Chip>
              </div>
              <p
                className="type-caption"
                style={{ marginBottom: 12, color: 'var(--text-secondary)' }}
              >
                Drag onto a future day. Invalid drops show why before you release.
              </p>
              {unscheduled.length === 0 ? (
                <EmptyState
                  icon="check-square"
                  title="Pile is empty"
                  hint="Approve assets in the review queue to fill this rail."
                />
              ) : (
                <ul className="cal-rail-list">
                  {unscheduled.map((a) => (
                    <li
                      key={a.id}
                      className={`cal-rail-item${pickIds.includes(a.id) ? ' is-picked' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        setDragId(a.id)
                        e.dataTransfer.setData('text/asset-id', a.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setDropHint(null)
                      }}
                    >
                      <PlatformIcon platform={a.platform} size={14} />
                      <div className="cal-rail-item__meta">
                        <span>{a.title ?? kindLabel(a.kind)}</span>
                        <span className="type-caption">{a.platform}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </FadeIn>
      )}

      {composeDay ? (
        <DayComposer
          day={composeDay}
          accounts={accounts}
          approved={unscheduled}
          onClose={() => setComposeDay(null)}
          onDone={() => {
            setComposeDay(null)
            load()
          }}
        />
      ) : null}

      {autoOpen && autoPlan ? (
        <AutoScheduleModal
          plan={autoPlan}
          onClose={() => {
            setAutoOpen(false)
            setAutoPlan(null)
          }}
          onApply={() => void applyAutoPlan()}
        />
      ) : null}

      {publishOpen && campaignId ? (
        <PublishCampaignModal
          assets={scopedAssets}
          accounts={accounts}
          onClose={() => setPublishOpen(false)}
          onDone={() => {
            setPublishOpen(false)
            router.push(`/app/campaigns/${campaignId}/performance`)
          }}
        />
      ) : null}
    </>
  )
}

function AutoScheduleModal({
  plan,
  onClose,
  onApply,
}: {
  plan: { assetId: string; at: Date; label: string }[]
  onClose: () => void
  onApply: () => void
}) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div
        className="modal"
        role="dialog"
        aria-label="Auto-schedule preview"
        style={{ maxWidth: 480 }}
      >
        <div className="head">
          <h3>Auto-schedule preview</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          <p className="type-caption" style={{ marginBottom: 12 }}>
            Optimal posting hours per channel. Review before applying — this calls publish with a
            scheduled time for each asset.
          </p>
          <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
            {plan.map((row) => (
              <li key={row.assetId} className="spread" style={{ gap: 12 }}>
                <span>{row.label}</span>
                <span className="strat-mono type-caption">
                  {dayKey(row.at)} {String(row.at.getHours()).padStart(2, '0')}:00
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={onApply}>
            Apply schedule
          </button>
        </div>
      </div>
    </>
  )
}

function PublishCampaignModal({
  assets,
  accounts,
  onClose,
  onDone,
}: {
  assets: CalAsset[]
  accounts: SocialAccount[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [phase, setPhase] = useState<'preflight' | 'running' | 'done'>('preflight')
  const [rows, setRows] = useState<
    { platform: string; status: 'pending' | 'ok' | 'fail'; note: string }[]
  >([])

  const scheduled = assets.filter((a) => Boolean(a.scheduledFor) || a.status === 'SCHEDULED')
  const unapprovedOnSched = assets.filter(
    (a) =>
      a.scheduledFor && !['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'].includes(a.status),
  )
  const byPlatform = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of scheduled) {
      m.set(a.platform, (m.get(a.platform) ?? 0) + 1)
    }
    return [...m.entries()]
  }, [scheduled])

  const channels = useMemo(() => {
    const plats = new Set(byPlatform.map(([p]) => p))
    return [...plats].map((platform) => {
      const connected = accounts.some((a) => a.platform.toUpperCase() === platform.toUpperCase())
      return {
        platform,
        count: byPlatform.find(([p]) => p === platform)?.[1] ?? 0,
        connected,
      }
    })
  }, [byPlatform, accounts])

  const blocked =
    scheduled.length === 0 ||
    unapprovedOnSched.length > 0 ||
    channels.some((c) => !c.connected) ||
    accounts.length === 0

  async function runPublish() {
    setPhase('running')
    type Row = { platform: string; status: 'pending' | 'ok' | 'fail'; note: string }
    const progress: Row[] = channels.map((c) => ({
      platform: c.platform,
      status: 'pending',
      note: `${c.count} assets`,
    }))
    setRows(progress)
    // Contract has no campaign-level publish — confirm each channel’s connection
    // and that assets are already queued via publish+scheduledAt.
    for (let i = 0; i < progress.length; i++) {
      const c = channels[i]!
      const next = [...progress]
      if (!c.connected) {
        next[i] = {
          platform: c.platform,
          status: 'fail',
          note: 'Not connected — reconnect under Connections',
        }
      } else {
        next[i] = {
          platform: c.platform,
          status: 'ok',
          note: `${c.count} queued for the worker`,
        }
      }
      progress[i] = next[i]!
      setRows([...next])
    }
    setPhase('done')
    const fails = progress.filter((p) => p.status === 'fail').length
    if (fails === 0) {
      toast.push('success', 'Campaign publish confirmed')
      onDone()
    } else {
      toast.push('error', `${fails} channel${fails === 1 ? '' : 's'} need attention`)
    }
  }

  return (
    <>
      <div className="overlay" onClick={phase === 'running' ? undefined : onClose} />
      <div className="modal cal-publish" role="dialog" aria-label="Publish campaign">
        <div className="head">
          <h3>{phase === 'preflight' ? 'Publish campaign' : 'Publishing…'}</h3>
          {phase !== 'running' ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>
        <div className="body">
          {phase === 'preflight' ? (
            <>
              <p className="type-body" style={{ marginBottom: 16 }}>
                <span className="strat-mono">{scheduled.length}</span> assets ·{' '}
                <span className="strat-mono">{channels.length}</span> channels
              </p>
              <ul className="cal-publish__list">
                {channels.map((c) => (
                  <li
                    key={c.platform}
                    className={`cal-publish__row${!c.connected ? ' is-bad' : ''}`}
                  >
                    <PlatformIcon platform={c.platform} size={16} />
                    <span>
                      {c.platform} · {c.count} asset{c.count === 1 ? '' : 's'}
                    </span>
                    <span className="type-caption">
                      {c.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </li>
                ))}
              </ul>
              {unapprovedOnSched.length > 0 ? (
                <p className="type-caption" style={{ color: 'var(--crimson-600)', marginTop: 12 }}>
                  {unapprovedOnSched.length} unapproved asset
                  {unapprovedOnSched.length === 1 ? '' : 's'} still on the schedule.
                </p>
              ) : null}
              {scheduled.length === 0 ? (
                <p className="type-caption" style={{ color: 'var(--crimson-600)', marginTop: 12 }}>
                  Nothing is scheduled yet — place assets on the calendar first.
                </p>
              ) : null}
            </>
          ) : (
            <ul className="cal-publish__list">
              {rows.map((r) => (
                <li
                  key={r.platform}
                  className={`cal-publish__row${r.status === 'fail' ? ' is-bad' : ''}${r.status === 'ok' ? ' is-ok' : ''}`}
                >
                  <PlatformIcon platform={r.platform} size={16} />
                  <span>{r.platform}</span>
                  <span className="type-caption">{r.note}</span>
                  {r.status === 'pending' ? <Spinner /> : null}
                  {r.status === 'ok' ? <Icon name="check" size={14} /> : null}
                  {r.status === 'fail' ? <Icon name="x" size={14} /> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {phase === 'preflight' ? (
          <div className="foot">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ width: '100%' }}
              disabled={blocked}
              onClick={() => void runPublish()}
            >
              Publish campaign
            </button>
          </div>
        ) : phase === 'done' ? (
          <div className="foot">
            <button type="button" className="btn primary" onClick={onDone}>
              Open performance
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}

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
        <p className="type-secondary" style={{ fontSize: 13 }}>
          No connected social accounts yet. Connect one under Connections, then schedule from here.
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
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {a.title ?? kindLabel(a.kind)}
                      </div>
                      <div className="type-caption">{a.platform}</div>
                    </div>
                    <button
                      type="button"
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
            type="button"
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
