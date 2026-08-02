'use client'

import { useCallback, useState } from 'react'

import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'
import { EmptyState } from '@/components/kit'
import { AssetCard } from '@/components/asset-card'

import { SECTIONS } from './constants'
import { AssetEditor } from './asset-editor'
import { SaveTemplateButton } from './templates'
import {
  OverviewSection,
  StrategySection,
  AnalyticsSection,
  SkeletonList,
  SectionHeader,
} from './sections'
import type { Asset, Campaign } from './types'

// ── Phase 3: Campaign workspace ──────────────────────────────────────────────
export function WorkspaceView({
  campaign,
  assets,
  onReload,
  onNew,
}: {
  campaign: Campaign
  assets: Asset[] | null
  onReload: () => void
  onNew: () => void
}) {
  const [section, setSection] = useState('overview')
  const [active, setActive] = useState<Asset | null>(null)

  const countFor = useCallback(
    (s: (typeof SECTIONS)[number]): number => {
      if (!assets) return 0
      if (s.kinds) return assets.filter((a) => s.kinds!.includes(a.kind)).length
      if (s.statuses) return assets.filter((a) => s.statuses!.includes(a.status)).length
      if (s.scheduled) return assets.filter((a) => a.scheduledFor).length
      return 0
    },
    [assets],
  )

  return (
    <>
      <div className="spread" style={{ marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="btn ghost sm" onClick={onNew} style={{ marginBottom: 8 }}>
            <Icon name="arrow-left" size={14} /> New campaign
          </button>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>{campaign.name}</h1>
          {campaign.objective ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              {campaign.objective}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <SaveTemplateButton campaign={campaign} />
          {campaign.status ? <StatusPill status={toStatus(campaign.status)} /> : null}
        </div>
      </div>

      <FadeIn delay={0.12} className="cmp-ws">
        <nav className="cmp-ws-nav">
          {SECTIONS.map((s) => {
            const n = countFor(s)
            return (
              <button
                key={s.id}
                className={section === s.id ? 'on' : ''}
                onClick={() => {
                  setSection(s.id)
                  setActive(null)
                }}
              >
                <Icon name={s.icon} size={16} />
                {s.label}
                {n > 0 ? <span className="count">{n}</span> : null}
              </button>
            )
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          {active ? (
            <AssetEditor
              asset={active}
              onBack={() => setActive(null)}
              onChanged={() => {
                onReload()
                setActive(null)
              }}
            />
          ) : (
            <SectionView section={section} campaign={campaign} assets={assets} onOpen={setActive} />
          )}
        </div>
      </FadeIn>
    </>
  )
}

function SectionView({
  section,
  campaign,
  assets,
  onOpen,
}: {
  section: string
  campaign: Campaign
  assets: Asset[] | null
  onOpen: (a: Asset) => void
}) {
  const def = SECTIONS.find((s) => s.id === section)!

  if (section === 'overview') return <OverviewSection campaign={campaign} assets={assets} />
  if (section === 'strategy') return <StrategySection campaign={campaign} />
  if (section === 'analytics') return <AnalyticsSection assets={assets} />

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
