'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { Chip, StatusRail } from '@/components/status'
import { PlatformIcon } from '@/components/platform-icon'
import { ApprovalWipe } from '@/components/motion'
import { estimateReach } from './draft'
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
  onSaveDraft,
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
  onSaveDraft: () => void
  onRequestChanges: (section: SectionId, comment: string) => void
  onGenerate: () => void
}) {
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeComment, setChangeComment] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const reach = estimateReach(draft)

  const glimpses = useMemo(() => buildGlimpses(plan), [plan])

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
                <p className="type-label" style={{ color: 'var(--text-secondary)' }}>
                  How this campaign will look
                </p>
                <h1 className="glimpse__title">{plan.campaignName || 'Untitled campaign'}</h1>
                <p className="type-body" style={{ color: 'var(--text-secondary)' }}>
                  {plan.objective}
                </p>
                <p className="type-caption" style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>
                  Glimpses below use your plan copy. After you approve, we generate posters, video
                  concepts, captions and channel assets — then you review and post.
                </p>
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
                  <GlimpseBody glimpse={g} plan={plan} />
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
              <h2 className="type-body-strong" style={{ margin: '0 0 12px', fontSize: 15 }}>
                Summary
              </h2>
              <dl className="glimpse-summary">
                <div>
                  <dt>Reach</dt>
                  <dd className="strat-mono">{reach.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd className="strat-mono">${plan.suggestedBudget.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd className="strat-mono">{plan.durationDays} days</dd>
                </div>
                <div>
                  <dt>Assets</dt>
                  <dd className="strat-mono">~{plan.estimatedAssets}</dd>
                </div>
              </dl>

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
                  <button type="button" className="btn ghost" onClick={onSaveDraft}>
                    Save draft
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

function buildGlimpses(plan: CampaignPlan): Glimpse[] {
  const platforms = plan.platforms.length ? plan.platforms : ['Instagram', 'Email']
  const caption = firstSentence(plan.strategy) || plan.objective
  const hook = plan.campaignName || 'Your campaign'
  const out: Glimpse[] = []

  for (const raw of platforms) {
    const p = raw.toLowerCase()
    if (p.includes('instagram') || p === 'ig') {
      out.push({
        id: 'ig-post',
        kind: 'instagram',
        platform: 'INSTAGRAM',
        label: 'Instagram',
        format: 'Feed post',
        headline: hook,
        caption: `${caption}\n\n#${slugTag(hook)} #launch`,
      })
      out.push({
        id: 'ig-reel',
        kind: 'video',
        platform: 'INSTAGRAM',
        label: 'Instagram',
        format: 'Reel / video',
        headline: hook,
        caption: `15–30s product story · ${plan.objective}`,
      })
    } else if (p.includes('facebook') || p === 'fb' || p.includes('meta')) {
      out.push({
        id: 'fb',
        kind: 'facebook',
        platform: 'FACEBOOK',
        label: 'Facebook',
        format: 'Feed + ad',
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
        format: 'Chatbot',
        caption: `Bot: Hi! Interested in ${hook}?\nUser: Tell me more\nBot: ${firstSentence(plan.audience) || plan.objective}`,
      })
    } else if (p.includes('linkedin')) {
      out.push({
        id: 'li',
        kind: 'linkedin',
        platform: 'LINKEDIN',
        label: 'LinkedIn',
        format: 'Post',
        headline: hook,
        caption,
      })
    } else if (p.includes('youtube') || p.includes('video')) {
      out.push({
        id: `yt-${raw}`,
        kind: 'video',
        platform: 'YOUTUBE',
        label: raw,
        format: 'Video',
        headline: hook,
        caption,
      })
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

  // Always show a poster slot when we have visual channels or none matched.
  if (!out.some((g) => g.kind === 'poster' || g.kind === 'instagram' || g.kind === 'video')) {
    out.unshift({
      id: 'poster',
      kind: 'poster',
      platform: 'IMAGE',
      label: 'Poster',
      format: 'Creative',
      headline: hook,
      caption,
    })
  } else if (!out.some((g) => g.kind === 'poster')) {
    out.push({
      id: 'poster',
      kind: 'poster',
      platform: 'IMAGE',
      label: 'Poster / static',
      format: 'Image concept',
      headline: hook,
      caption: `Visual direction from strategy · ${plan.deliverables.slice(0, 2).join(' · ') || plan.objective}`,
    })
  }

  return out
}

function GlimpseBody({ glimpse, plan }: { glimpse: Glimpse; plan: CampaignPlan }) {
  if (glimpse.kind === 'instagram' || glimpse.kind === 'facebook' || glimpse.kind === 'linkedin') {
    return (
      <div className="glimpse-social">
        <div className="glimpse-social__media" data-kind={glimpse.kind}>
          <span className="type-caption">{glimpse.headline}</span>
          <span className="glimpse-social__ph type-caption">Creative preview after generate</span>
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
        <span className="type-caption">{plan.estimatedAssets} assets planned</span>
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
