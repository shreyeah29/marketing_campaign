'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useCampaign } from './campaign-context'
import { LIVE_ASSET_STATUSES } from './constants'

const STAGES = [
  { id: 'strategy', label: 'Strategy', href: 'strategy' },
  { id: 'assets', label: 'Assets', href: 'assets' },
  { id: 'approval', label: 'Approval', href: 'assets' },
  { id: 'scheduling', label: 'Scheduling', href: 'schedule' },
  { id: 'publishing', label: 'Publishing', href: 'schedule' },
  { id: 'analytics', label: 'Analytics', href: 'performance' },
] as const

type StageId = (typeof STAGES)[number]['id']

/**
 * Campaign progress — Strategy → Assets → Approval → Scheduling → Publishing → Analytics.
 * Derived from real campaign/asset statuses (no mocks).
 */
export function CampaignProgress() {
  const { campaignId, campaign, assets, showPerformance } = useCampaign()
  const pathname = usePathname()
  const base = `/app/campaigns/${campaignId}`

  const current = useMemo((): StageId => {
    const list = assets ?? []
    const status = (campaign?.status ?? '').toUpperCase()
    const hasLive = list.some((a) => (LIVE_ASSET_STATUSES as readonly string[]).includes(a.status))
    const hasScheduled = list.some((a) => a.status === 'SCHEDULED' || a.status === 'PUBLISHING')
    const allApproved =
      list.length > 0 &&
      list.every((a) => ['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'].includes(a.status))
    const anyApproved = list.some((a) =>
      ['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'].includes(a.status),
    )
    const needsReview = list.some((a) =>
      ['GENERATED', 'NEEDS_REVIEW', 'DRAFT', 'REJECTED'].includes(a.status),
    )

    if (hasLive || ['LIVE', 'ACTIVE', 'PUBLISHED'].includes(status)) return 'analytics'
    if (hasScheduled || status === 'PUBLISHING') return 'publishing'
    if (allApproved) return 'scheduling'
    if (anyApproved && needsReview) return 'approval'
    if (list.length > 0) return needsReview ? 'approval' : 'assets'
    if (campaign?.strategy) return 'assets'
    return 'strategy'
  }, [campaign, assets])

  const currentIdx = STAGES.findIndex((s) => s.id === current)

  return (
    <nav className="cprog" aria-label="Campaign progress">
      {STAGES.map((stage, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const href =
          stage.id === 'analytics' && !showPerformance ? `${base}/report` : `${base}/${stage.href}`
        const onPath =
          pathname.startsWith(`${base}/${stage.href}`) ||
          (stage.id === 'analytics' && pathname.includes('/performance'))
        return (
          <Link
            key={stage.id}
            href={href}
            className={`cprog__step${done ? ' is-done' : ''}${active || onPath ? ' is-active' : ''}`}
          >
            <span className="cprog__n strat-mono">{String(i + 1).padStart(2, '0')}</span>
            <span className="cprog__label">{stage.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
