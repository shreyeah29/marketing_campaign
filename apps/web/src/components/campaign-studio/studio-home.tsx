'use client'

import { useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'

import type { Campaign, CreateDraft } from './types'

/**
 * Create — step 1 only: campaign prompt.
 * Continue starts the wizard (platforms → media → audience → strategy).
 */
export function CampaignStudioHome({
  initialPrompt = '',
  onContinue,
  recent,
  onOpen,
  drafts,
  onOpenDraft,
}: {
  initialPrompt?: string
  onContinue: (prompt: string) => void
  recent: Campaign[]
  onOpen: (id: string) => void
  drafts: CreateDraft[]
  onOpenDraft: (id: string) => void
}) {
  const [prompt, setPrompt] = useState(initialPrompt)

  return (
    <div className="wiz">
      <header className="wiz__head">
        <p className="type-label" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
          Step 1 of 5
        </p>
        <h1 className="wiz__title">What campaign are we building?</h1>
        <p className="wiz__sub type-secondary">
          Describe it in plain language. Next we pick platforms, exact deliverables, and audience —
          then one poster per concept, reused across channels.
        </p>
      </header>

      <div className="wiz__layout">
        <section className="wiz__panel">
          <label className="type-label" htmlFor="wiz-prompt">
            Your brief
          </label>
          <textarea
            id="wiz-prompt"
            className="input wiz__prompt"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Generate a marketing campaign for my new skincare product…"
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim().length >= 4) {
                onContinue(prompt.trim())
              }
            }}
          />
          <div className="wiz__footer">
            <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
              ⌘↵ to continue
            </p>
            <button
              type="button"
              className="btn primary"
              disabled={prompt.trim().length < 4}
              onClick={() => onContinue(prompt.trim())}
            >
              Continue
              <Icon name="arrow-left" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
        </section>

        <aside className="wiz__rail">
          <div className="wiz__rail-block">
            <h2 className="wiz__rail-title">Your campaigns</h2>
            {recent.length === 0 ? (
              <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                After generation, campaigns appear here for review and publish.
              </p>
            ) : (
              <ul className="wiz__camp-list">
                {recent.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" className="wiz__camp" onClick={() => onOpen(c.id)}>
                      <span className="wiz__camp-name">{c.name}</span>
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
            <div className="wiz__rail-block">
              <h2 className="wiz__rail-title">In progress</h2>
              <ul className="wiz__camp-list">
                {drafts.slice(0, 6).map((d) => (
                  <li key={d.id}>
                    <button type="button" className="wiz__camp" onClick={() => onOpenDraft(d.id)}>
                      <span className="wiz__camp-name">
                        {d.plan?.campaignName || d.prompt?.slice(0, 42) || 'Untitled'}
                      </span>
                      <span className="type-caption">Resume</span>
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
