/**
 * The brief coach's contract with the model.
 *
 * Everything the coach says reaches a client, so the rules that matter are
 * enforced here rather than in the browser: a prompt shipped in a bundle is a
 * suggestion, and one held on the server is a boundary. The parsing and the
 * scrubbing live beside it so all three can be tested without a model.
 *
 * The cost boundary is the reason this file exists in the API at all. A coach
 * that helpfully writes "allocate ₹25,000 across the fortnight" has put our
 * media cost on a client's screen, in their own words, inside a brief they will
 * approve. The instruction below forbids it and `scrubMoney` assumes the
 * instruction will one day be ignored — models are agreeable, and "how much
 * should I spend?" is a direct request to break the rule.
 */

/**
 * The five things a brief needs before the plan stops guessing.
 *
 * "Look & feel" used to be a sixth and is deliberately gone. It is chosen from
 * the gallery on intake, not on the brief screen, so flagging it here produced a
 * chip that could name a gap and offer no way to close it — the client's only
 * option was to describe a mood in prose to satisfy a control that a later step
 * answers properly. Five dimensions that all act rank better than six where one
 * is a dead end, and a completeness meter that cannot reach 100% on the screen
 * it lives on is worse than no meter.
 *
 * The signal still exists as *input*: `lookChosen` tells the model the visual
 * direction is already settled, so the rewrite stops asking for it.
 */
export const COACH_DIMENSIONS = [
  { id: 'product', label: 'Product' },
  { id: 'offer', label: 'Offer' },
  { id: 'timing', label: 'Timing' },
  { id: 'audience', label: 'Audience' },
  { id: 'success', label: 'Success metric' },
] as const

export type CoachDimensionId = (typeof COACH_DIMENSIONS)[number]['id']

const DIMENSION_IDS = new Set<string>(COACH_DIMENSIONS.map((d) => d.id))

/**
 * The money rule, stated three times in three shapes.
 *
 * Repetition is not padding. A single "do not mention budgets" is reliably
 * followed until a user asks a direct question about spending, at which point
 * the model weighs one line against an explicit request and answers the request.
 * Naming the substitute — pace — matters more than the prohibition: a model told
 * only what it may not say tends to refuse, and a refusal on a coaching screen
 * reads as a broken feature.
 */
export const COST_BOUNDARY_RULES = [
  'MONEY IS FORBIDDEN. Never write a currency symbol (₹, $, €, £), a currency code (INR, USD), a number of rupees or dollars, or any amount of money.',
  'Never mention a budget, a spend, a cost, a price you were not given, credits, or how much anything is worth.',
  'The client never pays for advertising here and never sees what it costs. Ad delivery is funded for them.',
  'When asked anything about money — "how much should I spend", "what budget", "is this worth it" — answer in PACE instead: Light, Standard or Heavy. Light is a steady presence, Standard is the default with enough reach to read the results, Heavy is a hard push for a launch or a sale weekend. Say which pace suits and why, and do not translate pace into an amount.',
  "If the brief already contains the client's own product prices, leave them exactly as written — those are theirs. Never add a figure of your own.",
].join('\n')

export interface CoachGrounding {
  /** Product names only. Prices are deliberately excluded — see below. */
  readonly products: readonly string[]
  readonly brand: readonly string[]
  readonly campaigns: readonly string[]
  /**
   * True when a visual direction has already been chosen elsewhere.
   *
   * Not a dimension — it is not scored, not charted and has no chip. It exists
   * so the rewrite does not ask for something the client has already answered
   * on another step, which is the one way that fact is still useful here.
   */
  readonly lookChosen?: boolean
}

/**
 * Build the coaching prompt.
 *
 * Grounding carries product *names* and no prices. The catalogue holds both, and
 * handing the model a price list is an invitation to write one into the
 * sharpened brief — which would be the coach adding money of its own, however
 * true the figure. A price the user typed themselves survives because it is in
 * the brief, which is the distinction that matters.
 */
export function buildCoachPrompt(grounding: CoachGrounding): string {
  const facts = [
    grounding.products.length > 0 ? `PRODUCTS:\n${grounding.products.join('\n')}` : null,
    grounding.brand.length > 0 ? `BRAND:\n${grounding.brand.join('\n')}` : null,
    grounding.campaigns.length > 0 ? `RECENT CAMPAIGNS:\n${grounding.campaigns.join('\n')}` : null,
  ].filter((f): f is string => f !== null)

  return [
    'You review a marketing brief and report what it is missing, then rewrite it.',
    'Reply with STRICT JSON only. No prose, no explanation, no code fence.',
    '',
    'SHAPE:',
    '{',
    '  "coverage": { "product": bool, "offer": bool, "timing": bool, "audience": bool, "success": bool },',
    '  "priority": "<the id of the single most valuable missing dimension, or null>",',
    '  "scaffolds": { "<missing dimension id>": "<a short prompt the user can finish>" },',
    '  "sharpened": "<the rewritten brief, as prose>",',
    '  "added": ["<exact substring of sharpened that you added or changed>", …],',
    '  "summary": "<one line naming what you added, e.g. adds audience, success metric and visual direction>"',
    '}',
    '',
    'DIMENSIONS:',
    '- product: which specific thing is being marketed',
    '- offer: the discount, deal or hook',
    '- timing: dates, season, or how long it runs',
    '- audience: who it is for',
    '- success: what result would count as working',
    '',
    'RULES:',
    '1. Every dimension appears in "coverage" with a true or false. True only when the brief actually says it — not when it could be inferred.',
    '2. "scaffolds" holds one entry per FALSE dimension: a short sentence opener the user can complete in their own words, ending mid-thought. Example: "It is for " — not a placeholder like "[audience]", not a complete invented answer.',
    '3. "sharpened" keeps the user\'s voice and folds in only what is already known from the brief or the facts below. Never invent a statistic, a date or a number.',
    '4. "added" lists the exact substrings of "sharpened" that are new or changed, so they can be highlighted. Each entry must appear in "sharpened" character for character. If nothing was added, use an empty array.',
    '5. "priority" is the one missing dimension that would improve the plan most. Null when nothing is missing.',
    '6. Visual direction is NOT one of the dimensions and never appears in "coverage". Do not ask for a look, a mood or a style — a later step collects that.',
    ...(grounding.lookChosen
      ? ['7. A visual direction has already been chosen. Do not mention it or suggest changing it.']
      : []),
    '',
    COST_BOUNDARY_RULES,
    '',
    ...(facts.length > 0
      ? ['FACTS AVAILABLE (use only these for specifics):', ...facts]
      : [
          'FACTS AVAILABLE: none recorded. Ask for specifics through scaffolds rather than inventing any.',
        ]),
  ].join('\n')
}

/** The prompt for a typed question. Same boundary, shorter answer. */
export function buildCoachAnswerPrompt(): string {
  return [
    'You are a marketing coach helping someone write a campaign brief.',
    'Answer in at most three sentences, plainly, with no preamble and no bullet points.',
    'You may only use what is in the brief and the facts you are given. If you do not know, say so in one sentence.',
    '',
    COST_BOUNDARY_RULES,
  ].join('\n')
}

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface CoachResult {
  readonly coverage: Record<CoachDimensionId, boolean>
  readonly priority: CoachDimensionId | null
  readonly scaffolds: Partial<Record<CoachDimensionId, string>>
  readonly sharpened: string
  readonly added: readonly string[]
  readonly summary: string
}

/**
 * Parse the model's JSON, or reject it whole.
 *
 * Hand-rolled to match the rest of this codebase, and strict for a reason: a
 * half-parsed result renders a card that looks authoritative and is partly
 * fiction. Anything that does not match is a null, and the screen shows its last
 * good state instead.
 */
export function parseCoachResult(raw: string): CoachResult | null {
  let data: unknown
  try {
    data = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/, ''),
    )
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>

  const rawCoverage = o['coverage']
  if (typeof rawCoverage !== 'object' || rawCoverage === null) return null
  const cov = rawCoverage as Record<string, unknown>
  const coverage = {} as Record<CoachDimensionId, boolean>
  for (const d of COACH_DIMENSIONS) coverage[d.id] = cov[d.id] === true

  const sharpened = typeof o['sharpened'] === 'string' ? o['sharpened'].trim() : ''
  if (sharpened.length === 0) return null

  const priorityRaw = o['priority']
  const priority =
    typeof priorityRaw === 'string' && DIMENSION_IDS.has(priorityRaw)
      ? (priorityRaw as CoachDimensionId)
      : null

  const scaffolds: Partial<Record<CoachDimensionId, string>> = {}
  const rawScaffolds = o['scaffolds']
  if (typeof rawScaffolds === 'object' && rawScaffolds !== null) {
    for (const [k, v] of Object.entries(rawScaffolds as Record<string, unknown>)) {
      if (DIMENSION_IDS.has(k) && typeof v === 'string' && v.trim().length > 0) {
        scaffolds[k as CoachDimensionId] = v.trim()
      }
    }
  }

  // Only spans that genuinely occur in the rewrite. A highlight range that does
  // not match is worse than none: it either paints the wrong words or throws
  // during render, and the highlight is the part the client is meant to trust.
  const added = Array.isArray(o['added'])
    ? o['added'].filter(
        (a): a is string => typeof a === 'string' && a.trim().length > 0 && sharpened.includes(a),
      )
    : []

  const summary = typeof o['summary'] === 'string' ? o['summary'].trim() : ''

  return { coverage, priority, scaffolds, sharpened, added, summary }
}

// ── The scrubber ──────────────────────────────────────────────────────────────

/**
 * Anything that reads as an amount of money.
 *
 * Deliberately broad. A false positive costs a sentence its number; a false
 * negative puts our media spend in front of a client. The two are not
 * comparable, so this errs hard in one direction.
 */
const MONEY_PATTERNS: readonly RegExp[] = [
  // ₹25,000 · $1.2k · €300 — symbol then digits, with optional scale suffix.
  /[₹$€£]\s?\d[\d,.\s]*\s?(?:k|l|lakh|lakhs|cr|crore|crores|m|mn|million)?/gi,
  // 25,000 rupees · 300 dollars · 5 lakh · 1.2 crore
  /\b\d[\d,.]*\s?(?:rupees?|rs\.?|inr|usd|eur|gbp|dollars?|euros?|pounds?|lakhs?|crores?)\b/gi,
  // rupees 25,000 · INR 25000
  /\b(?:rupees?|rs\.?|inr|usd|eur|gbp)\s?\d[\d,.]*/gi,
]

/** Words that mean money even without a figure attached. */
const MONEY_WORDS =
  /\b(?:budgets?|budgeting|spends?|spending|costs?|costing|pricing|credits?|invoices?|billing)\b/gi

export interface ScrubResult {
  readonly text: string
  /** True when something was removed — the caller may want to log it. */
  readonly changed: boolean
}

/**
 * Remove money from a coach answer.
 *
 * The last line of defence, and the one that does not depend on a model
 * cooperating. Amounts are cut rather than masked with "[redacted]", because a
 * visible redaction tells the reader there is a figure they are not being shown,
 * which raises exactly the question the boundary exists to avoid.
 *
 * Money *words* are rewritten to pace vocabulary rather than deleted, so the
 * sentence still says something. "Increase your budget" becoming "Increase your
 * pace" is both true and the answer the client can act on.
 */
export function scrubMoney(input: string): ScrubResult {
  let text = input
  for (const pattern of MONEY_PATTERNS) text = text.replace(pattern, '')

  text = text.replace(MONEY_WORDS, (word) => {
    const lower = word.toLowerCase()
    if (lower.startsWith('budget') || lower.startsWith('spend')) {
      return word[0] === word[0]?.toUpperCase() ? 'Pace' : 'pace'
    }
    if (lower.startsWith('cost') || lower.startsWith('pricing')) {
      return word[0] === word[0]?.toUpperCase() ? 'Effort' : 'effort'
    }
    return ''
  })

  // Tidy the gaps the removals leave, without touching sentence structure.
  text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()

  return { text, changed: text !== input.trim() }
}

/** Applies the scrubber to every field of a parsed result that reaches a screen. */
export function scrubCoachResult(result: CoachResult): CoachResult {
  const sharpened = scrubMoney(result.sharpened).text
  return {
    ...result,
    sharpened,
    summary: scrubMoney(result.summary).text,
    // A highlight must still be findable in the scrubbed text, or it would paint
    // the wrong words.
    added: result.added
      .map((a) => scrubMoney(a).text)
      .filter((a) => a.length > 0 && sharpened.includes(a)),
    scaffolds: Object.fromEntries(
      Object.entries(result.scaffolds).map(([k, v]) => [k, scrubMoney(v ?? '').text]),
    ) as Partial<Record<CoachDimensionId, string>>,
  }
}
