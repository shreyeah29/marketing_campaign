'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { StatusPill, toStatus } from '@/components/status'
import { PlatformIcon } from '@/components/platform-icon'

import type { Campaign, CreateDraft } from './types'

const GOALS = [
  { id: 'leads', label: 'Leads', hint: 'Forms, CTAs, nurture' },
  { id: 'sales', label: 'Sales', hint: 'Conversion and offers' },
  { id: 'awareness', label: 'Awareness', hint: 'Reach and brand' },
  { id: 'launch', label: 'Product launch', hint: 'New product push' },
] as const

const CHANNELS = [
  { id: 'Instagram', label: 'Instagram', kinds: 'Posts · Reels · Stories' },
  { id: 'Facebook', label: 'Facebook', kinds: 'Feed · Ads' },
  { id: 'Email', label: 'Email', kinds: 'Sequences · newsletters' },
  { id: 'WhatsApp', label: 'WhatsApp', kinds: 'Chatbot · broadcasts' },
  { id: 'LinkedIn', label: 'LinkedIn', kinds: 'Posts · thought leadership' },
  { id: 'YouTube', label: 'YouTube', kinds: 'Shorts · ads' },
] as const

/**
 * Create home — campaign studio.
 * Structured brief (product, goal, channels) instead of a lone typing box.
 * Still sends one brief string to POST /campaign-assets/plan.
 */
export function CampaignStudioHome({
  planning,
  onSubmit,
  recent,
  onOpen,
  drafts,
  onOpenDraft,
}: {
  planning: boolean
  onSubmit: (brief: string) => void
  recent: Campaign[]
  onOpen: (id: string) => void
  drafts: CreateDraft[]
  onOpenDraft: (id: string) => void
}) {
  const [product, setProduct] = useState('')
  const [audience, setAudience] = useState('')
  const [goal, setGoal] = useState<(typeof GOALS)[number]['id']>('launch')
  const [channels, setChannels] = useState<string[]>(['Instagram', 'Email', 'WhatsApp'])
  const [notes, setNotes] = useState('')

  const brief = useMemo(() => {
    const goalLabel = GOALS.find((g) => g.id === goal)?.label ?? goal
    const ch = channels.length ? channels.join(', ') : 'core social channels'
    const parts = [
      `Create a marketing campaign for ${product.trim() || 'my product'}.`,
      `Goal: ${goalLabel}.`,
      audience.trim() ? `Audience: ${audience.trim()}.` : null,
      `Channels to cover with creatives and copy: ${ch}.`,
      'For each channel, plan posters or video concepts, captions, and posting approach.',
      channels.includes('Email') ? 'Include email subject lines and body direction.' : null,
      channels.includes('WhatsApp') ? 'Include WhatsApp chatbot conversation outline.' : null,
      notes.trim() ? `Extra context: ${notes.trim()}` : null,
    ]
    return parts.filter(Boolean).join(' ')
  }, [product, audience, goal, channels, notes])

  function toggleChannel(id: string) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const canGo = product.trim().length >= 2 && channels.length > 0

  return (
    <div className="studio">
      <header className="studio__head">
        <div>
          <p className="type-label" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
            Campaign studio
          </p>
          <h1 className="studio__title">Build the next campaign</h1>
          <p className="studio__sub type-secondary">
            Describe the product and channels. You will preview how Instagram, email, WhatsApp and
            ads will look — then generate creatives and publish.
          </p>
        </div>
      </header>

      <div className="studio__layout">
        <section className="studio__compose" aria-label="New campaign">
          <div className="studio__field">
            <label className="type-label" htmlFor="studio-product">
              Product or offer
            </label>
            <input
              id="studio-product"
              className="input studio__input"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. New vitamin C serum"
              autoFocus
            />
          </div>

          <div className="studio__field">
            <label className="type-label" htmlFor="studio-audience">
              Who is it for?
            </label>
            <input
              id="studio-audience"
              className="input studio__input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Women 25–40 in Mumbai and Delhi"
            />
          </div>

          <div className="studio__field">
            <span className="type-label">Goal</span>
            <div className="studio__goal-grid">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`studio__goal${goal === g.id ? 'is-on' : ''}`}
                  onClick={() => setGoal(g.id)}
                >
                  <strong>{g.label}</strong>
                  <span className="type-caption">{g.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio__field">
            <span className="type-label">Channels to preview</span>
            <div className="studio__channel-grid">
              {CHANNELS.map((c) => {
                const on = channels.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`studio__channel${on ? 'is-on' : ''}`}
                    onClick={() => toggleChannel(c.id)}
                    aria-pressed={on}
                  >
                    <PlatformIcon platform={c.id.toUpperCase()} size={18} />
                    <span>
                      <strong>{c.label}</strong>
                      <span className="type-caption">{c.kinds}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="studio__field">
            <label className="type-label" htmlFor="studio-notes">
              Extra direction <span className="type-caption">(optional)</span>
            </label>
            <textarea
              id="studio-notes"
              className="input studio__notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tone, offer, must-include claims…"
            />
          </div>

          <div className="studio__actions">
            <button
              type="button"
              className="btn primary"
              disabled={!canGo || planning}
              onClick={() => onSubmit(brief)}
            >
              {planning ? (
                <>
                  <Spinner /> Building channel preview…
                </>
              ) : (
                <>
                  Preview across channels{' '}
                  <Icon name="arrow-left" size={14} style={{ transform: 'rotate(180deg)' }} />
                </>
              )}
            </button>
            <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
              Next: glimpse of posts, email, WhatsApp and creatives — then generate and publish.
            </p>
          </div>
        </section>

        <aside className="studio__rail">
          <div className="studio__rail-block">
            <h2 className="studio__rail-title">Your campaigns</h2>
            {recent.length === 0 ? (
              <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                Generated campaigns land here for review and publish.
              </p>
            ) : (
              <ul className="studio__camp-list">
                {recent.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" className="studio__camp" onClick={() => onOpen(c.id)}>
                      <span className="studio__camp-name">{c.name}</span>
                      {c.status ? <StatusPill status={toStatus(c.status)} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/campaigns" className="btn ghost sm" style={{ marginTop: 8 }}>
              All campaigns
            </Link>
          </div>

          {drafts.length > 0 ? (
            <div className="studio__rail-block">
              <h2 className="studio__rail-title">Browser drafts</h2>
              <ul className="studio__camp-list">
                {drafts.slice(0, 6).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="studio__camp"
                      onClick={() => onOpenDraft(d.id)}
                    >
                      <span className="studio__camp-name">
                        {d.plan?.campaignName || d.prompt || d.brief.slice(0, 40) || 'Untitled'}
                      </span>
                      <span className="type-caption">Draft</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
