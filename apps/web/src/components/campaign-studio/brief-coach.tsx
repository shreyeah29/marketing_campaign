'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * Brief coach — reads the brief as you type and says what is missing.
 *
 * Advisory, never a gate: Continue works at zero of five, and a failed call
 * changes nothing on the screen except one quiet line. The card exists because
 * the difference between a usable campaign and a generic one is almost always
 * four or five facts the person already knows and did not think to write down.
 *
 * Three rules shape it.
 *
 * **The textarea is the source of truth.** The coach never writes to it unasked.
 * "Use this brief" replaces the text and leaves a way back, because the thing
 * being replaced is something a person wrote.
 *
 * **The highlight is the feature.** A better paragraph is easy to produce and
 * impossible to trust. Showing exactly which words were added is what makes the
 * rewrite reviewable rather than a thing to accept on faith.
 *
 * **Last request wins by id, not by arrival.** Typing cancels the request in
 * flight, but an abort is a request to stop, not a guarantee of silence — a
 * response already on the wire still resolves. Each run carries a sequence
 * number and anything but the newest is dropped, so a slow answer about an
 * older draft cannot overwrite a fresh one.
 *
 * The cost boundary is enforced on the server: the prompt and the scrubber live
 * in `brief-coach.prompt.ts` because a rule shipped in a bundle is a suggestion.
 */

/**
 * Five, not six. "Look & feel" is gone on purpose.
 *
 * The look gallery is on intake, so a chip here could name the gap and offer no
 * way to close it — the only way to satisfy it from this screen was to describe
 * a mood in prose to appease a control that a later step answers properly. A
 * dead-end chip devalues the four beside it, and a meter that cannot reach 100%
 * on its own screen is worse than no meter.
 */
const DIMENSIONS = [
  { id: 'product', label: 'Product' },
  { id: 'offer', label: 'Offer' },
  { id: 'timing', label: 'Timing' },
  { id: 'audience', label: 'Audience' },
  { id: 'success', label: 'Success metric' },
] as const

type DimensionId = (typeof DIMENSIONS)[number]['id']

const SUGGESTED_QUESTIONS = [
  'Is 15 days long enough?',
  'Which channel suits this best?',
  'What would make this offer stronger?',
]

/**
 * Below this the brief is a fragment, and coaching a fragment produces confident
 * nonsense — every dimension missing, a rewrite invented from six words. The
 * chips sit greyed with an idle line instead, which is honest and costs nothing.
 */
const MIN_CHARS = 40
const DEBOUNCE_MS = 700

export interface CoachResult {
  coverage: Record<DimensionId, boolean>
  priority: DimensionId | null
  scaffolds: Partial<Record<DimensionId, string>>
  sharpened: string
  added: string[]
  summary: string
}

/**
 * Split the rewrite into plain and highlighted runs.
 *
 * The server guarantees every span in `added` occurs in `sharpened`, so this
 * only has to find them. Longest first: a short span that is a substring of a
 * longer one would otherwise cut the longer one in half and leave a fragment
 * unhighlighted in the middle of a highlighted phrase.
 */
function segment(text: string, added: readonly string[]): { text: string; added: boolean }[] {
  const spans = [...added].filter((a) => a.length > 0).sort((a, b) => b.length - a.length)
  if (spans.length === 0) return [{ text, added: false }]

  const marks = new Array<boolean>(text.length).fill(false)
  for (const span of spans) {
    let from = text.indexOf(span)
    while (from !== -1) {
      for (let i = from; i < from + span.length; i++) marks[i] = true
      from = text.indexOf(span, from + span.length)
    }
  }

  const out: { text: string; added: boolean }[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      out.push({ text: text.slice(start, i), added: marks[start] === true })
      start = i
    }
  }
  return out
}

/**
 * Validate a coach result restored from storage.
 *
 * sessionStorage is untrusted input like any other: it survives a deploy, so a
 * value written by an older shape can arrive at a newer component. Anything that
 * does not match is dropped and the coach simply re-reads the brief.
 */
export function parseStoredCoach(value: unknown): CoachResult | null {
  if (typeof value !== 'object' || value === null) return null
  const o = value as Record<string, unknown>
  if (typeof o['sharpened'] !== 'string' || o['sharpened'].trim().length === 0) return null

  const rawCoverage = o['coverage']
  if (typeof rawCoverage !== 'object' || rawCoverage === null) return null
  const cov = rawCoverage as Record<string, unknown>
  const coverage = {} as Record<DimensionId, boolean>
  for (const d of DIMENSIONS) coverage[d.id] = cov[d.id] === true

  const scaffolds: Partial<Record<DimensionId, string>> = {}
  const rawScaffolds = o['scaffolds']
  if (typeof rawScaffolds === 'object' && rawScaffolds !== null) {
    for (const [k, v] of Object.entries(rawScaffolds as Record<string, unknown>)) {
      if (DIMENSIONS.some((d) => d.id === k) && typeof v === 'string') {
        scaffolds[k as DimensionId] = v
      }
    }
  }

  const sharpened = o['sharpened']
  return {
    coverage,
    priority: DIMENSIONS.some((d) => d.id === o['priority'])
      ? (o['priority'] as DimensionId)
      : null,
    scaffolds,
    sharpened,
    added: Array.isArray(o['added'])
      ? o['added'].filter((a): a is string => typeof a === 'string' && sharpened.includes(a))
      : [],
    summary: typeof o['summary'] === 'string' ? o['summary'] : '',
  }
}

export function BriefCoach({
  brief,
  onReplace,
  focusBrief,
  lookChosen = false,
  initialResult = null,
  onResult,
}: {
  brief: string
  onReplace: (next: string) => void
  /** Focuses the textarea after a scaffold is appended, so typing continues there. */
  focusBrief?: (() => void) | undefined
  /**
   * True once a visual direction exists — from the intake gallery, or from a
   * gallery on this screen if one ever lands here.
   *
   * It is not a dimension: nothing is scored, charted or chipped from it. It is
   * sent to the model as context so the rewrite stops asking for a look the
   * client has already chosen, which is the one job left for it now that the
   * chip is gone. Kept wired rather than deleted because the socket is the
   * expensive part, not the wire.
   */
  lookChosen?: boolean
  /** Restored with the draft, so returning to a brief does not re-run the model. */
  initialResult?: CoachResult | null
  /** Called whenever a fresh result lands, so the page can save it. */
  onResult?: ((result: CoachResult | null) => void) | undefined
}) {
  const [result, setResult] = useState<CoachResult | null>(initialResult)
  const [reading, setReading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [keptMine, setKeptMine] = useState(false)
  const [previous, setPrevious] = useState<string | null>(null)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  /** Monotonic id per analysis. Only the newest may write state. */
  const runId = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const lastAnalysed = useRef<string>(initialResult ? brief.trim() : '')

  const publish = useCallback(
    (next: CoachResult | null) => {
      setResult(next)
      onResult?.(next)
    },
    [onResult],
  )

  const analyse = useCallback(
    async (text: string) => {
      inFlight.current?.abort()
      const ctrl = new AbortController()
      inFlight.current = ctrl
      const id = ++runId.current

      setReading(true)
      try {
        const res = await api.post<CoachResult>(
          '/ai/brief-coach',
          { brief: text, lookChosen },
          { signal: ctrl.signal },
        )
        // Not `ctrl.signal.aborted`: an abort asks a request to stop and does
        // not unsend one already answered. The id is what makes staleness
        // decidable — a slower earlier run can never win.
        if (id !== runId.current) return
        setUnavailable(false)
        setKeptMine(false)
        publish(res)
      } catch (e) {
        if (id !== runId.current) return
        // A cancelled request is not a failure and must not paint one.
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (e instanceof ApiError && e.status === 0) return
        setUnavailable(true)
        // The last good result stays on screen. Losing the coverage a person was
        // reading because one call timed out is worse than a slightly stale card.
      } finally {
        if (id === runId.current) setReading(false)
      }
    },
    [publish, lookChosen],
  )

  useEffect(() => {
    const text = brief.trim()
    if (text.length < MIN_CHARS) {
      // Below the floor the card idles. The previous result is cleared because
      // it describes a brief that no longer exists.
      if (result !== null) publish(null)
      setUnavailable(false)
      lastAnalysed.current = ''
      return
    }
    if (text === lastAnalysed.current) return

    const t = window.setTimeout(() => {
      lastAnalysed.current = text
      void analyse(text)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // `result` is read but must not retrigger: publishing null would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, analyse, publish])

  useEffect(() => () => inFlight.current?.abort(), [])

  async function ask(q: string) {
    const text = q.trim()
    if (!text || asking) return
    setAsking(true)
    setAnswer(null)
    try {
      const res = await api.post<{ answer: string }>('/ai/brief-coach/ask', {
        brief: brief.trim(),
        question: text,
      })
      setAnswer(res.answer)
    } catch {
      setAnswer('The coach could not answer that just now.')
    } finally {
      setAsking(false)
    }
  }

  function appendScaffold(dim: DimensionId) {
    const scaffold = result?.scaffolds[dim]
    if (!scaffold) return
    const base = brief.trimEnd()
    onReplace(base ? `${base} ${scaffold}` : scaffold)
    // The point of a scaffold is that it ends mid-thought — so the cursor has to
    // arrive where the sentence stops.
    focusBrief?.()
  }

  function useSharpened() {
    if (!result) return
    setPrevious(brief)
    onReplace(result.sharpened)
  }

  const coverage = useMemo(() => {
    const base = result?.coverage
    const map = {} as Record<DimensionId, boolean>
    for (const d of DIMENSIONS) map[d.id] = base?.[d.id] === true
    return map
  }, [result])

  const missing = DIMENSIONS.filter((d) => !coverage[d.id])
  const coveredCount = DIMENSIONS.length - missing.length
  const pct = result ? Math.round((coveredCount / DIMENSIONS.length) * 100) : 0
  const idle = brief.trim().length < MIN_CHARS
  const priority = result?.priority && !coverage[result.priority] ? result.priority : null

  const status = useMemo(() => {
    if (idle) return 'a sentence or two and it starts reading'
    if (reading && !result) return 'reading…'
    if (unavailable && !result) return 'coach unavailable'
    if (!result) return ''
    if (missing.length === 0) return 'this brief covers everything'
    return `${String(missing.length)} ${missing.length === 1 ? 'detail' : 'details'} would sharpen this`
  }, [idle, reading, unavailable, result, missing.length])

  return (
    <section className="coach" aria-label="Brief coach">
      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <header className="coach__head">
        <Icon name="sparkles" size={15} className="coach__spark" />
        <span className="coach__title">Brief coach</span>
        <span className="coach__sub">{reading ? 'reading…' : 'reading as you type'}</span>
        <span className="coach__status">{status}</span>
        <span className="coach__meter" aria-hidden="true">
          <span className="coach__meter-fill" style={{ width: `${String(pct)}%` }} />
        </span>
      </header>

      <div className="coach__body">
        {/* ── 2. Coverage chips ───────────────────────────────────────────── */}
        <div className="coach__chips" data-idle={idle ? '' : undefined}>
          {DIMENSIONS.map((d) => {
            const done = coverage[d.id]
            const scaffold = result?.scaffolds[d.id]
            if (done) {
              return (
                <span key={d.id} className="coach-chip" data-state="done">
                  <Icon name="check" size={12} />
                  {d.label}
                </span>
              )
            }
            return (
              <button
                key={d.id}
                type="button"
                className="coach-chip"
                data-state={d.id === priority ? 'next' : 'missing'}
                disabled={idle || !scaffold}
                onClick={() => appendScaffold(d.id)}
                title={scaffold ? `Add: ${scaffold}…` : d.label}
              >
                <Icon name="plus" size={12} />
                {d.label}
              </button>
            )
          })}
        </div>

        {idle ? (
          <p className="coach__idle">
            Write a little more and the coach will read it. Nothing is blocked either way — Continue
            works whenever you are ready.
          </p>
        ) : null}

        {unavailable && result === null && !idle ? (
          <p className="coach__idle">
            The coach could not read this brief just now. Nothing is blocked, and it tries again on
            your next edit.
          </p>
        ) : null}

        {/* ── 3. Sharpened brief ──────────────────────────────────────────── */}
        {result && !keptMine ? (
          <div className="coach__rewrite">
            <div className="coach__rewrite-head">
              <span className="coach__label">SHARPENED BRIEF</span>
              {result.summary ? <span className="coach__summary">{result.summary}</span> : null}
            </div>

            <p className="coach__prose">
              {segment(result.sharpened, result.added).map((part, i) =>
                part.added ? (
                  <mark key={i} className="coach__added">
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>

            <div className="coach__actions">
              <button type="button" className="btn primary sm" onClick={useSharpened}>
                <Icon name="arrow-u-up-left" size={14} /> Use this brief
              </button>
              <button type="button" className="btn sm" onClick={() => setKeptMine(true)}>
                Keep mine
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={reading}
                onClick={() => {
                  lastAnalysed.current = ''
                  void analyse(brief.trim())
                }}
              >
                {reading ? <Spinner /> : 'Try again'}
              </button>
              {previous !== null ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    onReplace(previous)
                    setPrevious(null)
                  }}
                >
                  Back to mine
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── 4. Ask ──────────────────────────────────────────────────────── */}
        <div className="coach__ask">
          <div className="coach__ask-row">
            <input
              className="input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask the coach — “${SUGGESTED_QUESTIONS[0] ?? 'is this enough?'}”`}
              aria-label="Ask the coach a question"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void ask(question)
                }
              }}
            />
            <button
              type="button"
              className="coach__send"
              aria-label="Ask"
              disabled={asking || question.trim().length === 0}
              onClick={() => void ask(question)}
            >
              {asking ? <Spinner /> : <Icon name="send" size={15} />}
            </button>
          </div>

          <div className="coach__suggestions">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="coach__suggestion"
                onClick={() => {
                  setQuestion(q)
                  void ask(q)
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {answer ? <p className="coach__answer">{answer}</p> : null}
        </div>
      </div>
    </section>
  )
}
