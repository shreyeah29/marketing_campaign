'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { Chip, StatusRail } from '@/components/status'
import { PlatformIcon } from '@/components/platform-icon'
import { ApprovalWipe } from '@/components/motion'
import type { CampaignPlan, CreateDraft } from './types'

export type SectionId =
  'overview' | 'audience' | 'funnel' | 'channels' | 'budget' | 'timeline' | 'metrics'

type GlimpseKind =
  'instagram' | 'facebook' | 'email' | 'whatsapp' | 'poster' | 'video' | 'linkedin' | 'generic'

/**
 * Channel glimpse board — replaces the text-wall strategy review.
 * Previews use real plan fields (name, objective, audience, strategy, platforms).
 * Approve → generate creatives; then review assets and publish to connected channels.
 */
export function PlanView({
  plan,
  draft,
  approved,
  generating,
  regenerating,
  onBack,
  onPlanChange,
  onApprove,
  onRequestChanges,
  onGenerate,
}: {
  plan: CampaignPlan
  draft: CreateDraft
  approved: boolean
  generating: boolean
  regenerating: boolean
  onBack: () => void
  onPlanChange: (next: CampaignPlan) => void
  onApprove: () => void
  onRequestChanges: (section: SectionId, comment: string) => void
  onGenerate: () => void
}) {
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeComment, setChangeComment] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const glimpses = useMemo(() => buildGlimpses(plan, draft), [plan, draft])

  function approveAndGenerate() {
    onApprove()
    onGenerate()
  }

  return (
    <ApprovalWipe approved={approved}>
      <div className={`glimpse${approved ? 'is-approved' : ''}`}>
        <div className="glimpse__top">
          <button type="button" className="btn ghost sm" onClick={onBack}>
            <Icon name="arrow-left" size={14} /> Back
          </button>
          {!approved ? (
            <span className="status-pill" data-hue="iris">
              Channel preview
            </span>
          ) : (
            <span className="status-pill" data-hue="jade">
              Approved
            </span>
          )}
        </div>

        <div className="glimpse__layout">
          <div className="glimpse__main">
            <StatusRail status={approved ? 'approved' : 'ai-draft'}>
              <header className="glimpse__header">
                <h1 className="glimpse__title">{plan.campaignName || 'Untitled campaign'}</h1>
              </header>
            </StatusRail>

            <div className="glimpse__grid">
              {glimpses.map((g) => (
                <article key={g.id} className={`glimpse-card glimpse-card--${g.kind}`}>
                  <div className="glimpse-card__head">
                    <PlatformIcon platform={g.platform} size={16} />
                    <span>{g.label}</span>
                    <Chip>{g.format}</Chip>
                  </div>
                  <GlimpseBody glimpse={g} />
                </article>
              ))}
            </div>

            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 16 }}
              onClick={() => setDetailsOpen((v) => !v)}
            >
              {detailsOpen ? 'Hide plan details' : 'Show plan details'}
            </button>

            {detailsOpen ? (
              <div className="glimpse__details">
                <label className="type-label">Audience</label>
                <textarea
                  className="input"
                  rows={3}
                  value={plan.audience}
                  onChange={(e) => onPlanChange({ ...plan, audience: e.target.value })}
                />
                <label className="type-label">Strategy</label>
                <textarea
                  className="input"
                  rows={4}
                  value={plan.strategy}
                  onChange={(e) => onPlanChange({ ...plan, strategy: e.target.value })}
                />
                <label className="type-label">Campaign name</label>
                <input
                  className="input"
                  value={plan.campaignName}
                  onChange={(e) => onPlanChange({ ...plan, campaignName: e.target.value })}
                />
              </div>
            ) : null}
          </div>

          <aside className="glimpse__rail">
            <div className="glimpse__rail-card">
              {!approved ? (
                <div className="glimpse__rail-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={generating || regenerating}
                    onClick={approveAndGenerate}
                  >
                    {generating ? (
                      <>
                        <Spinner /> Generating…
                      </>
                    ) : (
                      <>Approve & generate creatives</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={regenerating}
                    onClick={() => setChangeOpen((v) => !v)}
                  >
                    Request changes
                  </button>
                </div>
              ) : (
                <div className="glimpse__rail-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={generating}
                    onClick={onGenerate}
                  >
                    {generating ? (
                      <>
                        <Spinner /> Generating…
                      </>
                    ) : (
                      <>Generate creatives</>
                    )}
                  </button>
                  <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                    After generation: review posters &amp; copy, then publish to connected
                    Instagram, Facebook and more.
                  </p>
                </div>
              )}

              {changeOpen ? (
                <div className="glimpse__changes">
                  <textarea
                    className="input"
                    rows={3}
                    value={changeComment}
                    onChange={(e) => setChangeComment(e.target.value)}
                    placeholder="What should change across channels?"
                  />
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!changeComment.trim() || regenerating}
                    onClick={() => {
                      onRequestChanges('overview', changeComment.trim())
                      setChangeComment('')
                      setChangeOpen(false)
                    }}
                  >
                    {regenerating ? <Spinner /> : 'Regenerate preview'}
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </ApprovalWipe>
  )
}

type Glimpse = {
  id: string
  kind: GlimpseKind
  platform: string
  label: string
  format: string
  caption: string
  headline?: string
}

function buildGlimpses(plan: CampaignPlan, draft: CreateDraft): Glimpse[] {
  const platforms = (draft.channels?.length ? draft.channels : plan.platforms).length
    ? draft.channels?.length
      ? draft.channels
      : plan.platforms
    : ['Instagram', 'Email']
  const formats = new Set(
    (draft.formats?.length ? draft.formats : ['posts']).map((f) => f.toLowerCase()),
  )
  const wantPosters = draft.wantPosters !== false
  const wantVideos = Boolean(draft.wantVideos)
  const caption = firstSentence(plan.strategy) || plan.objective
  const hook = plan.campaignName || 'Your campaign'
  const out: Glimpse[] = []

  for (const raw of platforms) {
    const p = raw.toLowerCase()
    if (p.includes('instagram') || p === 'ig') {
      if (formats.has('posts') || formats.has('stories')) {
        out.push({
          id: 'ig-post',
          kind: 'instagram',
          platform: 'INSTAGRAM',
          label: 'Instagram',
          format: formats.has('stories') && !formats.has('posts') ? 'Story' : 'Feed post',
          headline: hook,
          caption: `${caption}\n\n#${slugTag(hook)} #launch`,
        })
      }
      if (formats.has('reels') || wantVideos) {
        out.push({
          id: 'ig-reel',
          kind: 'video',
          platform: 'INSTAGRAM',
          label: 'Instagram',
          format: formats.has('reels') ? 'Reel / video' : 'Video concept',
          headline: hook,
          caption: `15–30s product story · ${plan.objective}`,
        })
      }
      if (formats.has('ads')) {
        out.push({
          id: 'ig-ad',
          kind: 'instagram',
          platform: 'INSTAGRAM',
          label: 'Instagram',
          format: 'Ad',
          headline: hook,
          caption: `Paid placement · ${caption}`,
        })
      }
    } else if (p.includes('facebook') || p === 'fb' || p.includes('meta')) {
      out.push({
        id: 'fb',
        kind: 'facebook',
        platform: 'FACEBOOK',
        label: 'Facebook',
        format: formats.has('ads') ? 'Feed + ad' : 'Feed',
        headline: hook,
        caption,
      })
    } else if (p.includes('email')) {
      out.push({
        id: 'email',
        kind: 'email',
        platform: 'EMAIL',
        label: 'Email',
        format: 'Sequence',
        headline: `Subject: ${hook} — for you`,
        caption: `Opening: ${caption}\n\nCTA aligned to: ${plan.objective}`,
      })
    } else if (p.includes('whatsapp')) {
      out.push({
        id: 'wa',
        kind: 'whatsapp',
        platform: 'WHATSAPP',
        label: 'WhatsApp',
        format: 'Broadcast',
        caption: `Bot: Hi! Interested in ${hook}?\nUser: Tell me more\nBot: ${firstSentence(plan.audience) || plan.objective}`,
      })
    } else if (p.includes('linkedin')) {
      out.push({
        id: 'li',
        kind: 'linkedin',
        platform: 'LINKEDIN',
        label: 'LinkedIn',
        format: formats.has('ads') ? 'Post + ad' : 'Post',
        headline: hook,
        caption,
      })
    } else if (p.includes('youtube') || p.includes('video')) {
      if (wantVideos || formats.has('reels') || formats.has('ads')) {
        out.push({
          id: `yt-${raw}`,
          kind: 'video',
          platform: 'YOUTUBE',
          label: raw,
          format: 'Video',
          headline: hook,
          caption,
        })
      }
    } else {
      out.push({
        id: `gen-${raw}`,
        kind: 'generic',
        platform: raw.toUpperCase(),
        label: raw,
        format: 'Creative',
        headline: hook,
        caption,
      })
    }
  }

  if (wantPosters) {
    out.push({
      id: 'poster',
      kind: 'poster',
      platform: 'IMAGE',
      label: 'AI poster',
      format: 'Image concept',
      headline: hook,
      caption: `Visual direction · ${draft.lookFeel || plan.deliverables.slice(0, 2).join(' · ') || plan.objective}`,
    })
  }

  if (wantVideos && !out.some((g) => g.kind === 'video')) {
    out.push({
      id: 'video-concept',
      kind: 'video',
      platform: 'VIDEO',
      label: 'AI video',
      format: 'Video concept',
      headline: hook,
      caption: `Runway video concept · ${plan.objective}`,
    })
  }

  if (out.length === 0) {
    out.push({
      id: 'poster',
      kind: 'poster',
      platform: 'IMAGE',
      label: 'Creative',
      format: 'Concept',
      headline: hook,
      caption,
    })
  }

  return out
}

function GlimpseBody({ glimpse }: { glimpse: Glimpse }) {
  if (glimpse.kind === 'instagram' || glimpse.kind === 'facebook' || glimpse.kind === 'linkedin') {
    return (
      <div className="glimpse-social">
        <div className="glimpse-social__media" data-kind={glimpse.kind}>
          <PlatformIcon platform={glimpse.platform} size={22} />
          <span className="glimpse-social__headline">{glimpse.headline}</span>
        </div>
        <p className="glimpse-social__caption">{glimpse.caption}</p>
      </div>
    )
  }
  if (glimpse.kind === 'video') {
    return (
      <div className="glimpse-video">
        <div className="glimpse-video__frame">
          <Icon name="play" size={22} />
          <span className="type-caption">{glimpse.format}</span>
        </div>
        <p className="type-caption">{glimpse.caption}</p>
      </div>
    )
  }
  if (glimpse.kind === 'email') {
    return (
      <div className="glimpse-email">
        <p className="glimpse-email__subject">{glimpse.headline}</p>
        <p className="glimpse-email__body">{glimpse.caption}</p>
        <span className="btn sm primary" style={{ pointerEvents: 'none', alignSelf: 'flex-start' }}>
          Primary CTA
        </span>
      </div>
    )
  }
  if (glimpse.kind === 'whatsapp') {
    return (
      <div className="glimpse-wa">
        {glimpse.caption.split('\n').map((line, i) => (
          <div key={i} className={`glimpse-wa__bubble${line.startsWith('User') ? 'is-user' : ''}`}>
            {line}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="glimpse-poster">
      <div className="glimpse-poster__art">
        <PlatformIcon platform={glimpse.platform} size={28} />
      </div>
      <p className="type-caption">{glimpse.caption}</p>
    </div>
  )
}

function firstSentence(text: string): string {
  const t = text.trim()
  if (!t) return ''
  const m = t.match(/^[^.!?]+[.!?]?/)
  return (m?.[0] ?? t).trim()
}

function slugTag(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 18) || 'campaign'
  )
}
