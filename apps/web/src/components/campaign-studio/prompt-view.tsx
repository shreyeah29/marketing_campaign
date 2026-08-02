'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Spinner } from '@/components/ui'
import { StatusPill, toStatus } from '@/components/status'

import { SUGGESTION_ROWS } from './constants'
import { TemplatePicker } from './templates'
import type { Campaign, CreateDraft } from './types'

/**
 * AI Command Center prompt surface (brief Part 3 §4).
 * Chips fill an editable full sentence — they are not output tags.
 */
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
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachUrl, setAttachUrl] = useState('')

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(320, Math.max(120, el.scrollHeight))}px`
  }, [prompt])

  function applySentence(sentence: string) {
    setPrompt(sentence)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  function addLink() {
    const url = attachUrl.trim()
    if (!url) return
    const line = `Reference: ${url}`
    setPrompt(prompt.trim() ? `${prompt.trim()}\n${line}` : line)
    setAttachUrl('')
    setAttachOpen(false)
    taRef.current?.focus()
  }

  return (
    <div className="cc">
      <FadeIn className="cc__hero">
        <h1 className="cc__title">What would you like to achieve today?</h1>

        <div className="cc__prompt">
          <textarea
            ref={taRef}
            className="cc__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Launch my new vitamin C serum to women 25-40 in Mumbai and Delhi"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit()
            }}
            autoFocus
          />
          <div className="cc__prompt-bar">
            <div className="cc__attach-wrap">
              <button
                type="button"
                className="btn ghost sm"
                aria-expanded={attachOpen}
                aria-label="Attach a brand or competitor link"
                onClick={() => setAttachOpen((v) => !v)}
              >
                <Icon name="plus" size={14} /> Attach
              </button>
              {attachOpen ? (
                <div className="cc__attach-pop" role="dialog" aria-label="Add a link">
                  <p className="type-caption" style={{ marginBottom: 8 }}>
                    Paste a brand asset or competitor URL — it is added to your prompt.
                  </p>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://"
                      value={attachUrl}
                      onChange={(e) => setAttachUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addLink()
                        }
                      }}
                    />
                    <button type="button" className="btn primary sm" onClick={addLink}>
                      Add
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
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
                  Continue → <span className="cc__kbd">⌘↵</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="cc__suggestions">
          {SUGGESTION_ROWS.map((row) => (
            <div key={row.id} className="cc__row">
              <div className="cc__row-label type-label">{row.label}</div>
              <div className="cc__row-chips">
                {row.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="cc__chip"
                    onClick={() => applySentence(item.sentence)}
                    title={item.sentence}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="cc__secondary">
          <TemplatePicker onPick={(text) => setPrompt(text)} />
          <button type="button" className="btn ghost sm" onClick={onGuidedIntake}>
            <Icon name="clipboard" size={14} /> Guided intake
          </button>
        </div>
      </FadeIn>

      {drafts.length > 0 || recent.length > 0 ? (
        <FadeIn delay={0.1} className="cc__recent">
          {drafts.length > 0 ? (
            <section>
              <h2 className="cc__recent-label type-label">Recent drafts</h2>
              <p
                className="type-caption"
                style={{ marginBottom: 10, color: 'var(--text-tertiary)' }}
              >
                Saved in this browser only
              </p>
              <div className="stack" style={{ gap: 8 }}>
                {drafts.slice(0, 5).map((d) => {
                  const label =
                    d.plan?.campaignName ||
                    d.prompt?.slice(0, 72) ||
                    d.brief.slice(0, 72) ||
                    'Untitled draft'
                  const hrefStep = d.plan ? 'strategy' : 'intake'
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="cc__recent-row"
                      onClick={() => onOpenDraft(d.id)}
                    >
                      <Icon name="file-text" size={15} style={{ color: 'var(--text-tertiary)' }} />
                      <span className="cc__recent-body">
                        <span className="type-body-strong">{label}</span>
                        <span className="type-caption">
                          {hrefStep === 'strategy' ? 'Strategy review' : 'Intake'} ·{' '}
                          {new Date(d.updatedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      <Icon
                        name="chevron-right"
                        size={16}
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section style={{ marginTop: drafts.length > 0 ? 28 : 0 }}>
              <h2 className="cc__recent-label type-label">Recent campaigns</h2>
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {recent.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cc__recent-row"
                    onClick={() => onOpen(c.id)}
                  >
                    <Icon name="megaphone" size={15} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="cc__recent-body">
                      <span className="type-body-strong">{c.name}</span>
                      <span className="type-caption">{c.objective ?? 'Open workspace'}</span>
                    </span>
                    {c.status ? <StatusPill status={toStatus(c.status)} /> : null}
                    <Icon
                      name="chevron-right"
                      size={16}
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </FadeIn>
      ) : null}
    </div>
  )
}
