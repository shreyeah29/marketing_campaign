'use client'

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { EmptyState } from '@/components/kit'
import { AssetCard } from '@/components/asset-card'
import { Icon, type IconName } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'

import { SECTIONS } from './constants'
import type { Asset, Campaign } from './types'

/**
 * Whether an asset belongs to a section.
 *
 * Exported so the rail's count and the panel's list are the same predicate. Two
 * copies would eventually disagree, and a rail saying "Social 6" over a panel
 * showing four is the kind of wrongness that makes people stop believing the
 * rest of the numbers.
 */
export function sectionMatches(def: (typeof SECTIONS)[number], asset: Asset): boolean {
  if (def.kinds) return def.kinds.includes(asset.kind)
  if (def.statuses) return def.statuses.includes(asset.status)
  if (def.scheduled) return Boolean(asset.scheduledFor)
  return false
}

/**
 * The count for a section's rail badge, or null when there is nothing honest to
 * show.
 *
 * Null for sections that do not derive from assets (Overview, Strategy,
 * Analytics) and null while assets are still loading. Deliberately not zero: a
 * zero reads as "nothing here" and nobody opens that tab again, so an unknown
 * count must look unknown.
 */
export function sectionCount(
  def: (typeof SECTIONS)[number],
  assets: Asset[] | null,
): number | null {
  if (!def.kinds && !def.statuses && !def.scheduled) return null
  if (assets === null) return null
  return assets.filter((a) => sectionMatches(def, a)).length
}

export function SectionHeader({ def, count }: { def: (typeof SECTIONS)[number]; count: number }) {
  return (
    <div className="row" style={{ gap: 10, marginBottom: 16 }}>
      <div className="avatar" style={{ background: 'var(--surface-selected)' }}>
        <Icon name={def.icon} size={16} />
      </div>
      <div>
        <h2 style={{ fontSize: 18 }}>{def.label}</h2>
        <div className="dim" style={{ fontSize: 12 }}>
          {count} item{count === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

// ── Overview / Strategy / Analytics ──────────────────────────────────────────
export function OverviewSection({
  campaign,
  assets,
}: {
  campaign: Campaign
  assets: Asset[] | null
}) {
  const total = assets?.length ?? 0
  const byStatus = (s: string) => assets?.filter((a) => a.status === s).length ?? 0
  const stats = [
    { label: 'Total assets', value: total, icon: 'layout' as IconName },
    {
      label: 'Needs review',
      value: byStatus('GENERATED') + byStatus('NEEDS_REVIEW'),
      icon: 'check-square' as IconName,
    },
    { label: 'Approved', value: byStatus('APPROVED'), icon: 'check' as IconName },
    {
      label: 'Scheduled',
      value: byStatus('SCHEDULED') + byStatus('PUBLISHED'),
      icon: 'send' as IconName,
    },
  ]
  return (
    <>
      <div className="cols-4 grid" style={{ marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div
              className="dim"
              style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              <Icon name={s.icon} size={14} /> {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Objective</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.objective ?? '—'}
        </p>
        {campaign.strategy?.summary ? (
          <>
            <h3 style={{ margin: '16px 0 8px' }}>Strategy</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {campaign.strategy.summary}
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

export function StrategySection({ campaign }: { campaign: Campaign }) {
  const goals = campaign.strategy?.goals ?? []
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Approach</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.strategy?.summary ?? '—'}
        </p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Target audience</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.targetAudience?.description ?? '—'}
        </p>
      </div>
      {goals.length > 0 ? (
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Goals</h3>
          <div className="stack" style={{ gap: 8 }}>
            {goals.map((g, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <Icon name="check" size={15} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontSize: 14 }}>{g}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Performance, with no money in it.
 *
 * Impressions, reach, clicks, leads, CTR, and leads per 1,000 impressions. No
 * spend, no CPL, no ROAS: ads run on the client's own ad account but are funded
 * by us, so what was spent is our position rather than theirs. Leads per 1,000
 * ranks the same campaigns in the same order as cost per lead — only the
 * denominator differs — while being a figure a client is allowed to act on.
 *
 * The endpoint is organisation-wide rather than campaign-scoped; the API has no
 * per-campaign insights route, and inventing one client-side by filtering
 * something that was never scoped would be worse than saying so.
 */
export function AnalyticsSection({ assets }: { assets: Asset[] | null }) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api
      .get<Record<string, number>>('/meta/analytics/summary')
      .then(setSummary)
      .catch(() => setFailed(true))
  }, [])

  if (!assets) return <SkeletonList />

  const platforms = [...new Set(assets.map((a) => a.platform))]
  const max = Math.max(1, ...platforms.map((p) => assets.filter((a) => a.platform === p).length))
  const hasDelivery = summary !== null && (summary['impressions'] ?? 0) > 0

  const metrics: { label: string; value: string }[] = hasDelivery
    ? [
        { label: 'Impressions', value: (summary['impressions'] ?? 0).toLocaleString() },
        { label: 'Reach', value: (summary['reach'] ?? 0).toLocaleString() },
        { label: 'Clicks', value: (summary['clicks'] ?? 0).toLocaleString() },
        { label: 'Leads', value: (summary['leads'] ?? 0).toLocaleString() },
        {
          label: 'Click-through rate',
          value: `${((summary['ctr'] ?? 0) * 100).toFixed(2)}%`,
        },
        {
          label: 'Leads per 1,000 impressions',
          value: (summary['leadsPer1kImpressions'] ?? 0).toFixed(2),
        },
      ]
    : []

  return (
    <div className="stack" style={{ gap: 16 }}>
      {hasDelivery ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))', gap: 10 }}
        >
          {metrics.map((m) => (
            <div key={m.label} className="card kpi">
              <div className="k">{m.label}</div>
              <div className="v">{m.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="bar-chart"
          title={failed ? 'Performance could not be loaded' : 'No delivery data yet'}
          hint={
            failed
              ? 'The Meta insights request failed. Nothing is wrong with the campaign — this panel will fill in once it succeeds.'
              : 'Figures appear once ads have been delivering for a day. Reach and leads sync from Meta each hour.'
          }
        />
      )}

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Assets by platform</h3>
        <div className="stack" style={{ gap: 12 }}>
          {platforms.map((p) => {
            const n = assets.filter((a) => a.platform === p).length
            return (
              <div key={p} className="row" style={{ gap: 12 }}>
                <span className="row" style={{ width: 90, fontSize: 13, gap: 6 }}>
                  <PlatformIcon platform={p} size={14} /> {p}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: 'var(--surface-sunken)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${String(Math.round((n / max) * 100))}%`,
                      height: '100%',
                      background: 'var(--cobalt-600)',
                    }}
                  />
                </div>
                <span className="mono" style={{ fontSize: 13, width: 28, textAlign: 'right' }}>
                  {n}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {hasDelivery ? (
        <p className="dim" style={{ fontSize: 11.5, margin: 0 }}>
          Delivery figures are organisation-wide: the Meta insights API is not campaign-scoped.
          Asset counts above are this campaign only.
        </p>
      ) : null}
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card skeleton" style={{ height: 88 }} />
      ))}
    </div>
  )
}

export function AssetListSection({
  def,
  assets,
  onOpen,
}: {
  def: (typeof SECTIONS)[number]
  assets: Asset[] | null
  onOpen: (a: Asset) => void
}) {
  if (assets === null) return <SkeletonList />

  const list = assets.filter((a) => sectionMatches(def, a))

  if (list.length === 0) {
    return (
      <EmptyState
        icon={def.icon}
        title={`No ${def.label.toLowerCase()} yet`}
        hint="Generate a campaign or add assets — they'll appear here, organised by type."
      />
    )
  }

  return (
    <>
      <SectionHeader def={def} count={list.length} />
      <div className="stack" style={{ gap: 10 }}>
        {list.map((a) => (
          <AssetCard
            key={a.id}
            platform={a.platform}
            kind={a.kind}
            status={a.status}
            body={a.caption || a.body}
            title={a.title}
            mediaUrl={a.mediaUrl}
            onClick={() => onOpen(a)}
          />
        ))}
      </div>
    </>
  )
}
