'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * Brief coach — reads the brief as you type and says what is missing.
 *
 * Advisory, never a gate: Continue works at zero of six. The panel exists
 * because the difference between a usable campaign and a generic one is almost
 * always four or five facts the person already knows and did not think to
 * write down.
 *
 * Two rules shape the whole component.
 *
 * The first is that it never invents. Every suggestion is grounded in the
 * workspace — real products, the brand profile, the objectives of recent
 * campaigns. If a fact is not in the workspace the coach asks for it through a
 * missing chip; it does not guess. A fabricated "420 covers" target reads as
 * authoritative and is worse than a blank, because a blank prompts a question
 * and a wrong number does not.
 *
 * The second is that it never overwrites silently. "Use this brief" replaces
 * the field and offers ten seconds of undo, because the thing being replaced
 * is something a person wrote.
 */

/** The six things a brief needs before the plan stops guessing. */
const DIMENSIONS = [
  { id: 'product', label: 'Product' },
  { id: 'offer', label: 'Offer' },
  { id: 'timing', label: 'Timing' },
  { id: 'audience', label: 'Who it is for' },
  { id: 'success', label: 'What success looks like' },
  { id: 'look', label: 'Look & feel' },
] as const

type DimensionId = (typeof DIMENSIONS)[number]['id']

const EXAMPLE_QUESTIONS = [
  'What did my last festive campaign get wrong?',
  'Which channel converts best for this product?',
  'Is this offer stronger than the last one?',
]

const MIN_CHARS = 25
const DEBOUNCE_MS = 800
const UNDO_MS = 10_000

interface Coaching {
  covered: DimensionId[]
  missing: DimensionId[]
  suggestions: Partial<Record<DimensionId, string>>
  sharpened: string
}

/**
 * Hand-rolled rather than zod: this app ships four runtime dependencies and
 * validates nothing else at the boundary, so one 4-field shape does not justify
 * a parser in every bundle. The contract is the same — anything that does not
 * match exactly is rejected whole, and the panel says so rather than rendering
 * half an answer.
 */
function parseCoaching(raw: string): Coaching | null {
  let data: unknown
  try {
    // Models fence JSON even when told not to.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/, '')
    data = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>

  const ids = new Set<string>(DIMENSIONS.map((d) => d.id))
  const asIds = (v: unknown): DimensionId[] =>
    Array.isArray(v) ? v.filter((x): x is DimensionId => typeof x === 'string' && ids.has(x)) : []

  const covered = asIds(o['covered'])
  const missing = asIds(o['missing']).filter((m) => !covered.includes(m))
  const sharpened = typeof o['sharpened'] === 'string' ? o['sharpened'].trim() : ''
  if (sharpened.length === 0) return null

  const suggestions: Partial<Record<DimensionId, string>> = {}
  const rawSug = o['suggestions']
  if (typeof rawSug === 'object' && rawSug !== null) {
    for (const [k, v] of Object.entries(rawSug as Record<string, unknown>)) {
      if (ids.has(k) && typeof v === 'string' && v.trim()) {
        suggestions[k as DimensionId] = v.trim()
      }
    }
  }
  return { covered, missing, suggestions, sharpened }
}

/** Workspace facts the rewrite is allowed to draw on. */
interface Grounding {
  products: string[]
  brand: string[]
  campaigns: string[]
}

function buildSystemPrompt(g: Grounding): string {
  const facts = [
    g.products.length ? `PRODUCTS IN THIS WORKSPACE:\n${g.products.join('\n')}` : null,
    g.brand.length ? `BRAND PROFILE:\n${g.brand.join('\n')}` : null,
    g.campaigns.length ? `RECENT CAMPAIGNS:\n${g.campaigns.join('\n')}` : null,
  ].filter(Boolean)

  return [
    'You review a marketing brief and report what it is missing. Reply with STRICT JSON only, no prose and no code fence.',
    '',
    'Shape:',
    '{"covered":[…],"missing":[…],"suggestions":{"<dimension>":"<clause>"},"sharpened":"<rewritten brief>"}',
    '',
    `Dimensions, use these ids exactly: ${DIMENSIONS.map((d) => d.id).join(', ')}.`,
    '- product: which specific thing is being marketed',
    '- offer: the discount, deal or hook',
    '- timing: dates, season, or how long it runs',
    '- audience: who it is for',
    '- success: what result would count as working',
    '- look: visual direction, mood or tone',
    '',
    'RULES:',
    '1. Every dimension goes in exactly one of covered or missing.',
    '2. "suggestions" holds one clause per MISSING dimension — a complete, concrete sentence fragment the user can append verbatim. Never a placeholder: no square brackets, no "[audience here]", no "TBD".',
    '3. Ground every specific in the workspace facts below. If a fact is not there, do NOT invent one — write the suggestion so it asks for the fact in plain language instead. A made-up number is worse than a blank.',
    '4. "sharpened" rewrites the brief keeping the user\'s voice, folding in only what is already known or already in the brief. Do not add invented figures.',
    ...(facts.length
      ? ['', 'WORKSPACE FACTS:', ...facts]
      : ['', 'WORKSPACE FACTS: none recorded — ask for specifics rather than inventing any.']),
  ].join('\n')
}

export function BriefCoach({
  brief,
  onReplace,
  canAsk,
}: {
  brief: string
  onReplace: (next: string) => void
  /**
   * The ask box calls `/ai/chat`, which is gated by `ai.chat` — a different
   * entitlement from the `ai.copywriter` one that gates the coach itself. A
   * workspace can have one and not the other, so the box is hidden rather than
   * left to 403 on first use.
   */
  canAsk: boolean
}) {
  const [coaching, setCoaching] = useState<Coaching | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const [undo, setUndo] = useState<string | null>(null)

  const grounding = useRef<Grounding>({ products: [], brand: [], campaigns: [] })
  /** The text of the last analysed brief — the skip-if-unchanged guard. */
  const lastAnalysed = useRef<string>('')
  const inFlight = useRef<AbortController | null>(null)

  // ── Grounding, fetched once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [prodRes, orgRes, campRes] = await Promise.allSettled([
        api.get<{
          data: {
            name: string
            brand?: string | null
            mrpMinor?: number | null
            salePriceMinor?: number | null
          }[]
        }>('/products'),
        api.get<{
          name?: string
          industry?: string | null
          settings?: {
            tagline?: string | null
            brandVoice?: string | null
            targetAudience?: string | null
          } | null
        }>('/organization'),
        api.get<
          | { data: { name: string; objective?: string | null }[] }
          | { name: string; objective?: string | null }[]
        >('/campaigns'),
      ])
      if (cancelled) return

      const g: Grounding = { products: [], brand: [], campaigns: [] }

      if (prodRes.status === 'fulfilled') {
        g.products = (prodRes.value.data ?? []).slice(0, 20).map((p) => {
          const price = p.salePriceMinor ? ` — ₹${String(Math.round(p.salePriceMinor / 100))}` : ''
          return `- ${p.brand ? `${p.brand} ` : ''}${p.name}${price}`
        })
      }
      if (orgRes.status === 'fulfilled') {
        const o = orgRes.value
        const s = o.settings ?? {}
        g.brand = [
          o.name ? `- Business: ${o.name}` : null,
          o.industry ? `- Industry: ${o.industry}` : null,
          s.tagline ? `- Tagline: ${s.tagline}` : null,
          s.brandVoice ? `- Voice: ${s.brandVoice}` : null,
          s.targetAudience ? `- Target audience: ${s.targetAudience}` : null,
        ].filter((x): x is string => x !== null)
      }
      if (campRes.status === 'fulfilled') {
        const list = Array.isArray(campRes.value) ? campRes.value : (campRes.value.data ?? [])
        g.campaigns = list
          .slice(0, 3)
          .map((c) => `- ${c.name}${c.objective ? ` (objective: ${c.objective})` : ''}`)
      }
      grounding.current = g
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Analyse, debounced ───────────────────────────────────────────────────
  const analyse = useCallback(async (text: string) => {
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl

    setAnalysing(true)
    setUnavailable(false)
    try {
      const res = await api.post<{ content: string }>(
        '/ai/generate',
        {
          prompt: `${buildSystemPrompt(grounding.current)}\n\nBRIEF:\n${text}`,
          format: 'json',
        },
        { signal: ctrl.signal },
      )
      if (ctrl.signal.aborted) return
      const parsed = parseCoaching(res.content)
      if (!parsed) {
        setUnavailable(true)
        setCoaching(null)
        return
      }
      setCoaching(parsed)
      setDismissed(false)
    } catch {
      if (!ctrl.signal.aborted) {
        setUnavailable(true)
        setCoaching(null)
      }
    } finally {
      if (!ctrl.signal.aborted) setAnalysing(false)
    }
  }, [])

  useEffect(() => {
    const text = brief.trim()
    if (text.length < MIN_CHARS) {
      setCoaching(null)
      setUnavailable(false)
      return
    }
    // One call per window per draft: an unchanged brief never spends a credit,
    // however often the component re-renders.
    if (text === lastAnalysed.current) return

    const t = window.setTimeout(() => {
      lastAnalysed.current = text
      void analyse(text)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [brief, analyse])

  useEffect(() => () => inFlight.current?.abort(), [])

  // ── Undo window ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (undo === null) return
    const t = window.setTimeout(() => setUndo(null), UNDO_MS)
    return () => window.clearTimeout(t)
  }, [undo])

  async function ask(q: string) {
    const text = q.trim()
    if (!text) return
    setAsking(true)
    setAnswer(null)
    try {
      // /ai/chat, not /ai/generate: chat runs the question through the
      // knowledge base, which is what lets it answer from last quarter's export
      // rather than from the brief alone.
      const res = await api.post<{ role: 'assistant'; content: string }>('/ai/chat', {
        messages: [
          {
            role: 'user',
            content: `Current campaign brief:\n${brief.trim() || '(empty)'}\n\nQuestion: ${text}`,
          },
        ],
      })
      setAnswer(res.content.trim() || 'No answer came back.')
    } catch {
      setAnswer('The assistant could not answer that just now.')
    } finally {
      setAsking(false)
    }
  }

  function appendSuggestion(dim: DimensionId) {
    const clause = coaching?.suggestions[dim]
    if (!clause) return
    const base = brief.trim()
    onReplace(base ? `${base} ${clause}` : clause)
  }

  function useSharpened() {
    if (!coaching) return
    setUndo(brief)
    onReplace(coaching.sharpened)
  }

  const covered = coaching?.covered ?? []
  const missingCount = coaching ? DIMENSIONS.length - covered.length : 0
  const pct = coaching ? Math.round((covered.length / DIMENSIONS.length) * 100) : 0

  const statusLine = useMemo(() => {
    if (analysing) return 'reading…'
    if (unavailable) return 'coach unavailable'
    if (!coaching) return brief.trim().length < MIN_CHARS ? 'waiting for a sentence or two' : ''
    if (missingCount === 0) return 'this brief covers everything'
    return `${String(missingCount)} ${missingCount === 1 ? 'detail' : 'details'} would sharpen this`
  }, [analysing, unavailable, coaching, missingCount, brief])

  return (
    <div className="card coach">
      <div className="coach__head">
        <span className="coach__title">Brief coach</span>
        <span className="coach__status">· reading as you type</span>
        <span className="coach__status">{statusLine}</span>
        <span className="coach__meter" aria-hidden>
          <span className="coach__meter-fill" style={{ width: `${String(pct)}%` }} />
        </span>
      </div>

      {undo !== null ? (
        <div className="coach__undo">
          <Icon name="check" size={14} />
          Brief replaced.
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              onReplace(undo)
              setUndo(null)
            }}
          >
            Undo
          </button>
        </div>
      ) : null}

      <div className="coach__body">
        {unavailable ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            The coach could not read this brief just now. Nothing is blocked — Continue still works,
            and it will try again on your next edit.
          </p>
        ) : (
          <>
            <div className="coach__section-label">COVERAGE</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {DIMENSIONS.map((d) => {
                const isCovered = covered.includes(d.id)
                const clause = coaching?.suggestions[d.id]
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="chip sm coach__chip"
                    aria-pressed={isCovered}
                    {...(isCovered ? { 'data-covered': '' } : { 'data-suggest': '' })}
                    disabled={isCovered || !clause}
                    onClick={() => appendSuggestion(d.id)}
                    title={isCovered ? `${d.label} is covered` : (clause ?? d.label)}
                  >
                    {isCovered ? <Icon name="check" size={12} /> : null}
                    {d.label}
                  </button>
                )
              })}
            </div>

            {coaching && !dismissed ? (
              <>
                <div className="coach__section-label" style={{ marginTop: 16 }}>
                  SHARPENED BRIEF
                </div>
                <div className="coach__rewrite">{coaching.sharpened}</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn primary" onClick={useSharpened}>
                    Use this brief
                  </button>
                  <button type="button" className="btn" onClick={() => setDismissed(true)}>
                    Keep mine
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={analysing}
                    onClick={() => {
                      lastAnalysed.current = ''
                      void analyse(brief.trim())
                    }}
                  >
                    {analysing ? <Spinner /> : 'Try again'}
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {/* ── Ask ─────────────────────────────────────────────────────── */}
        {canAsk ? (
          <div className="coach__ask">
            <div className="coach__section-label">ASK ABOUT THIS CAMPAIGN</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything about this brief or your past campaigns…"
                aria-label="Ask the coach a question"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void ask(question)
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                disabled={asking || question.trim().length === 0}
                onClick={() => void ask(question)}
              >
                {asking ? <Spinner /> : 'Ask'}
              </button>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chip sm"
                  data-suggest=""
                  onClick={() => {
                    setQuestion(q)
                    void ask(q)
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            {answer ? <div className="coach__answer">{answer}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
