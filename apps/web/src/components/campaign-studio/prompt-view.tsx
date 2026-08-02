'use client'

import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Spinner } from '@/components/ui'
import { StatusPill, toStatus } from '@/components/status'

import { CHIPS } from './constants'
import { TemplatePicker } from './templates'
import type { Campaign } from './types'

// ── Phase 1: Prompt workspace ────────────────────────────────────────────────
export function PromptView({
  prompt,
  setPrompt,
  selected,
  toggleChip,
  planning,
  onSubmit,
  recent,
  onOpen,
}: {
  prompt: string
  setPrompt: (v: string) => void
  selected: Set<string>
  toggleChip: (c: string) => void
  planning: boolean
  onSubmit: () => void
  recent: Campaign[]
  onOpen: (id: string) => void
}) {
  return (
    <div style={{ paddingBottom: 40 }}>
      <FadeIn className="cmp-hero">
        <span
          className="pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 13px',
            borderRadius: 999,
            background: 'var(--primary-soft)',
            color: 'var(--color-primary)',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <Icon name="sparkles" size={13} /> AI Campaign Studio
        </span>
        <h1>What would you like to create today?</h1>
        <div className="sub">
          Describe your campaign and pick the outputs — your AI marketing director will plan it.
        </div>

        <div className="cmp-prompt">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Launch our new luxury jewellery collection for Diwali with a festive, elegant tone across social and paid…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit()
            }}
            autoFocus
          />
          <div className="cmp-prompt-actions">
            <span className="dim" style={{ fontSize: 12 }}>
              {selected.size > 0
                ? `${selected.size} output${selected.size > 1 ? 's' : ''} selected`
                : 'Tip: ⌘⏎ to plan'}
            </span>
            <button
              className="btn primary"
              onClick={onSubmit}
              disabled={planning || prompt.trim().length < 4}
            >
              {planning ? (
                <Spinner />
              ) : (
                <>
                  <Icon name="sparkles" size={15} /> Create plan
                </>
              )}
            </button>
          </div>
        </div>

        <div className="chips">
          {CHIPS.map((c) => (
            <button
              key={c}
              className={`chip ${selected.has(c) ? 'on' : ''}`}
              onClick={() => toggleChip(c)}
            >
              {selected.has(c) ? <Icon name="check" size={13} /> : null}
              {c}
            </button>
          ))}
        </div>

        <TemplatePicker onPick={(text) => setPrompt(text)} />
      </FadeIn>

      {recent.length > 0 ? (
        <FadeIn delay={0.12} style={{ maxWidth: 760, margin: '48px auto 0', padding: '0 16px' }}>
          <div
            className="dim"
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            Recent campaigns
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {recent.slice(0, 6).map((c) => (
              <button
                key={c.id}
                className="asset-row"
                style={{ alignItems: 'center', padding: 14 }}
                onClick={() => onOpen(c.id)}
              >
                <div className="avatar" style={{ background: 'var(--primary-soft)' }}>
                  <Icon name="megaphone" size={15} />
                </div>
                <div className="body">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {c.objective ?? 'Open workspace'}
                  </div>
                </div>
                {c.status ? <StatusPill status={toStatus(c.status)} /> : null}
                <Icon name="chevron-right" size={16} className="dim" />
              </button>
            ))}
          </div>
        </FadeIn>
      ) : null}
    </div>
  )
}
