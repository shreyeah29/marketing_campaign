'use client'

import { useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Spinner } from '@/components/ui'

import { BriefCoach, parseStoredCoach, type CoachResult } from './brief-coach'
import { SUGGESTION_ROWS } from './constants'
import type { Campaign, CreateDraft } from './types'

/**
 * Studio brief — step 1 of six.
 *
 * One question, one field. The suggestion rows below it are whole sentences
 * rather than tags: clicking one fills the field with something editable, so
 * the intake that follows is never fed two words and left to guess. That is the
 * same reason the field has no toolbar — a brief is prose, and chrome around it
 * invites people to fill in a form instead of writing.
 *
 * The step rail is present on every screen of this flow. Knowing four decisions
 * remain before anything is generated is what stops the first screen feeling
 * like a commitment.
 */

const STEPS = ['Brief', 'Intake', 'Plan', 'Generate', 'Review', 'Publish'] as const

interface DesignTemplate {
  slug: string
  name: string
}

/** Where a saved draft actually stopped, in the language of the step rail. */
function draftStop(d: CreateDraft): { step: number; label: string } {
  if (d.plan) return { step: 3, label: 'plan awaiting approval' }
  if (d.channels?.length) return { step: 2, label: `intake · ${d.step ?? 'platforms'}` }
  return { step: 1, label: 'brief' }
}

export function PromptView({
  prompt,
  setPrompt,
  planning,
  onSubmit,
  recent,
  onOpen,
  drafts,
  onOpenDraft,
  onGuidedIntake,
  restoredCoach = null,
  onCoachResult,
}: {
  prompt: string
  setPrompt: (v: string) => void
  planning: boolean
  onSubmit: () => void
  recent: Campaign[]
  onOpen: (id: string) => void
  drafts: CreateDraft[]
  onOpenDraft: (id: string) => void
  onGuidedIntake: () => void
  /** Coaching restored with the brief, so returning does not re-run the model. */
  restoredCoach?: unknown
  onCoachResult?: ((result: CoachResult | null) => void) | undefined
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [templates, setTemplates] = useState<DesignTemplate[]>([])

  // The coach is a copywriter-class call per analyse, so it only exists for a
  // workspace entitled to one. Without the feature the field is exactly as it
  // was — no placeholder, no upsell.
  // No feature check for the coach. It reads what is being typed on this screen
  // and belongs to the screen, so every client has it — the endpoint is ungated
  // for the same reason. Hiding it per plan made a whole section of the page
  // exist for some workspaces and not others, which reads as a bug rather than
  // as an upsell.

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${String(Math.min(320, Math.max(140, el.scrollHeight)))}px`
  }, [prompt])

  /**
   * Design templates, not the prompt library.
   *
   * `/prompts` sits behind the `ai.knowledge_base` feature and 403s for an
   * organisation without it, which would leave this panel permanently empty.
   * The built-in layouts are always available and are what "reuse a template"
   * means on the poster path anyway.
   */
  useEffect(() => {
    api
      .get<{ data: DesignTemplate[] }>('/design-templates')
      .then((r) => setTemplates(r.data ?? []))
      .catch(() => setTemplates([]))
  }, [])

  function applySentence(sentence: string) {
    setPrompt(sentence)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  return (
    <FadeIn className="today-layout">
      <div className="today-main">
        <div className="step-rail">
          {STEPS.map((label, i) => (
            <span key={label} className="step-chip" data-state={i === 0 ? 'current' : 'todo'}>
              {i + 1} {label.toUpperCase()}
            </span>
          ))}
        </div>

        <h1 className="brief-title">What are we building?</h1>
        <p className="brief-sub">
          Describe the campaign in plain language, or start from a suggestion. Next comes objective,
          channels, audience and duration — then the plan for you to approve before anything is
          generated.
        </p>

        <textarea
          ref={taRef}
          className="brief-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Run a festive Republic Day campaign for the cafe — brunch offers, high energy, Instagram first…"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit()
          }}
          aria-label="Campaign brief"
          autoFocus
        />

        <BriefCoach
          brief={prompt}
          onReplace={setPrompt}
          focusBrief={() => {
            // After the frame the new text has rendered, so the caret lands at
            // the end of the scaffold rather than where the old text ended.
            requestAnimationFrame(() => {
              const el = taRef.current
              if (!el) return
              el.focus()
              el.setSelectionRange(el.value.length, el.value.length)
            })
          }}
          initialResult={parseStoredCoach(restoredCoach)}
          onResult={onCoachResult}
        />

        <div className="row" style={{ flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={planning || prompt.trim().length < 4}
          >
            {planning ? (
              <Spinner />
            ) : (
              <>
                Continue
                <Icon name="arrow-right" size={15} />
              </>
            )}
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            ⌘↵ · drafts save automatically
          </span>
          <button type="button" className="btn ghost" onClick={onGuidedIntake}>
            <Icon name="clipboard" size={14} /> Skip to guided intake
          </button>
        </div>

        <div style={{ marginTop: 30 }}>
          {SUGGESTION_ROWS.map((row, i) => (
            <div key={row.id} style={i > 0 ? { marginTop: 22 } : undefined}>
              <div className="suggest-group-label">{row.label.toUpperCase()}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {row.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="suggest-row"
                    onClick={() => applySentence(item.sentence)}
                  >
                    <span className="suggest-row__label">{item.label}</span>
                    <span className="suggest-row__text">{item.sentence}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────────────────── */}
      <div className="today-rail">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-default)' }}>
            <div className="panel-head__title">Unfinished drafts</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {drafts.length === 0 ? 'Nothing in progress.' : 'Picks up exactly where you stopped.'}
            </div>
          </div>
          {drafts.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '14px 15px',
                fontSize: 12.5,
                color: 'var(--text-tertiary)',
              }}
            >
              Drafts are saved in this browser as you type.
            </p>
          ) : (
            drafts.slice(0, 5).map((d) => {
              const stop = draftStop(d)
              const title =
                d.plan?.campaignName ||
                d.prompt?.slice(0, 60) ||
                d.brief.slice(0, 60) ||
                'Untitled draft'
              return (
                <button
                  key={d.id}
                  type="button"
                  className="rail-row"
                  onClick={() => onOpenDraft(d.id)}
                >
                  <div className="rail-row__title">{title}</div>
                  <div className="rail-row__meta">
                    Step {stop.step} · {stop.label}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {templates.length > 0 ? (
          <div className="card">
            <div className="panel-head__title" style={{ marginBottom: 10 }}>
              Reuse a template
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.slice(0, 5).map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  className="rail-link"
                  onClick={() =>
                    applySentence(
                      `${prompt.trim() ? `${prompt.trim()}\n\n` : ''}Use the ${t.name} layout for the posters.`,
                    )
                  }
                >
                  <Icon name="layout" size={15} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-default)' }}>
              <div className="panel-head__title">Recent campaigns</div>
            </div>
            {recent.slice(0, 5).map((c) => (
              <button key={c.id} type="button" className="rail-row" onClick={() => onOpen(c.id)}>
                <div className="rail-row__title">{c.name}</div>
                <div className="rail-row__meta">
                  {(c.status ?? 'draft').toLowerCase()}
                  {c.objective ? ` · ${c.objective.toLowerCase()}` : ''}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FadeIn>
  )
}
