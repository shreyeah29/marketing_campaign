'use client'

import { EmptyState } from '@/components/kit'
import { AssetCard } from '@/components/asset-card'
import { Icon, type IconName } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'

import { SECTIONS } from './constants'
import type { Asset, Campaign } from './types'

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

export function AnalyticsSection({ assets }: { assets: Asset[] | null }) {
  if (!assets) return <SkeletonList />
  const platforms = [...new Set(assets.map((a) => a.platform))]
  const max = Math.max(1, ...platforms.map((p) => assets.filter((a) => a.platform === p).length))
  return (
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
                }}
              >
                <div
                  style={{
                    width: `${(n / max) * 100}%`,
                    height: '100%',
                    background: 'var(--cobalt-600)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <span className="dim" style={{ fontSize: 13, width: 28, textAlign: 'right' }}>
                {n}
              </span>
            </div>
          )
        })}
      </div>
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

  const list = assets.filter((a) => {
    if (def.kinds) return def.kinds.includes(a.kind)
    if (def.statuses) return def.statuses.includes(a.status)
    if (def.scheduled) return Boolean(a.scheduledFor)
    return false
  })

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
