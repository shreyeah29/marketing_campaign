'use client'

import type { ReactNode } from 'react'

import { PlatformIcon } from '@/components/platform-icon'
import { kindLabel, StatusPill, StatusRail, toStatus } from '@/components/status'

export type AssetCardAspect = '1:1' | '9:16' | '16:9'

const ASPECT_CLASS: Record<AssetCardAspect, string> = {
  '1:1': 'asset-card__preview--square',
  '9:16': 'asset-card__preview--portrait',
  '16:9': 'asset-card__preview--landscape',
}

function aspectFor(platform: string, kind: string): AssetCardAspect {
  const k = kind.toUpperCase()
  const p = platform.toUpperCase()
  if (k === 'STORY' || k === 'REEL' || p === 'TIKTOK') return '9:16'
  if (k === 'EMAIL' || k === 'LANDING' || k === 'BLOG' || k === 'ARTICLE') return '16:9'
  return '1:1'
}

export function AssetCard({
  platform,
  kind,
  status,
  body,
  preview,
  actions,
  onClick,
  selected,
}: {
  platform: string
  kind: string
  status: string
  body: string
  preview?: ReactNode | undefined
  actions?: ReactNode | undefined
  onClick?: (() => void) | undefined
  selected?: boolean | undefined
}) {
  const kindStatus = toStatus(status)
  const aspect = aspectFor(platform, kind)
  const caption = body.trim() || '(empty)'
  const truncated = caption.length > 160 ? `${caption.slice(0, 160)}…` : caption

  return (
    <StatusRail status={kindStatus} className={`asset-card${selected ? 'is-selected' : ''}`}>
      <button type="button" className="asset-card__hit" onClick={onClick}>
        <div className={`asset-card__preview ${ASPECT_CLASS[aspect]}`}>
          {preview ?? (
            <div className="asset-card__preview-fallback">
              <PlatformIcon platform={platform} size={22} />
            </div>
          )}
        </div>
        <div className="asset-card__meta">
          <div className="asset-card__row">
            <span className="asset-card__channel">
              <PlatformIcon platform={platform} size={14} />
              <span>
                {platform.charAt(0) + platform.slice(1).toLowerCase()} · {kindLabel(kind)}
              </span>
            </span>
            <StatusPill status={kindStatus} />
          </div>
          <p className="asset-card__caption type-body">{truncated}</p>
        </div>
      </button>
      {actions ? <div className="asset-card__actions">{actions}</div> : null}
    </StatusRail>
  )
}
