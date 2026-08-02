'use client'

import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
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
  if (k === 'STORY' || k === 'REEL' || k === 'VIDEO_PROMPT' || p === 'TIKTOK') return '9:16'
  if (k === 'EMAIL' || k === 'LANDING' || k === 'BLOG' || k === 'ARTICLE') return '16:9'
  return '1:1'
}

function isConceptKind(kind: string) {
  const k = kind.toUpperCase()
  return k === 'IMAGE_PROMPT' || k === 'VIDEO_PROMPT'
}

/**
 * Visual preview for the card face. Prefers real media; otherwise shows a
 * channel-style post mock or an image/video concept stub (not an empty grey box).
 */
export function AssetCardPreview({
  platform,
  kind,
  body,
  title,
  mediaUrl,
}: {
  platform: string
  kind: string
  body: string
  title?: string | null | undefined
  mediaUrl?: string | null | undefined
}) {
  const k = kind.toUpperCase()
  const text = body.trim()

  if (mediaUrl) {
    if (k === 'VIDEO_PROMPT') {
      return <video src={mediaUrl} className="asset-card__media" muted playsInline />
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaUrl} alt="" className="asset-card__media" />
  }

  if (isConceptKind(kind)) {
    return (
      <div className="asset-preview asset-preview--concept">
        <Icon name={k === 'VIDEO_PROMPT' ? 'video' : 'image'} size={22} />
        <strong className="type-caption">{title?.trim() || kindLabel(kind)}</strong>
        <p className="type-caption">
          {text
            ? text.length > 120
              ? `${text.slice(0, 120)}…`
              : text
            : 'Approve to generate this creative'}
        </p>
        <span className="asset-preview__hint type-caption">Approve to generate</span>
      </div>
    )
  }

  return (
    <div className="asset-preview asset-preview--post" data-platform={platform.toUpperCase()}>
      <div className="asset-preview__head">
        <PlatformIcon platform={platform} size={14} />
        <span className="type-caption">{platform.charAt(0) + platform.slice(1).toLowerCase()}</span>
      </div>
      <p className="asset-preview__copy">
        {text
          ? text.length > 220
            ? `${text.slice(0, 220)}…`
            : text
          : `(Empty ${kindLabel(kind).toLowerCase()})`}
      </p>
    </div>
  )
}

export function AssetCard({
  platform,
  kind,
  status,
  body,
  title,
  mediaUrl,
  preview,
  actions,
  onClick,
  selected,
}: {
  platform: string
  kind: string
  status: string
  body: string
  title?: string | null | undefined
  mediaUrl?: string | null | undefined
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
    <StatusRail status={kindStatus} className={`asset-card${selected ? ' is-selected' : ''}`}>
      <button type="button" className="asset-card__hit" onClick={onClick}>
        <div className={`asset-card__preview ${ASPECT_CLASS[aspect]}`}>
          {preview ?? (
            <AssetCardPreview
              platform={platform}
              kind={kind}
              body={body}
              title={title}
              mediaUrl={mediaUrl}
            />
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
