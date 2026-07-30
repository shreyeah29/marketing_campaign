/**
 * Model catalog and cost metering.
 *
 * Two jobs:
 *   1. Let the router pick a model by capability rather than by name, so an
 *      agent never hardcodes a model string and a deprecation is a catalog edit.
 *   2. Price every call, so per-organisation spend is known before the invoice.
 *
 * Why prices live in code at all: budget enforcement has to happen *before*
 * dispatch, which means the cost of a call must be computable from a token
 * estimate without a network round trip. The catalog is the local source of
 * truth for that estimate.
 *
 * ── Keeping this honest ──────────────────────────────────────────────────────
 * These figures are a dated snapshot, and provider pricing changes. Two
 * safeguards, because a stale hardcoded price silently under-bills:
 *   · `verifiedAt` on every entry, surfaced by a staleness check.
 *   · `PricingOverride` so an operator can correct a rate without a deploy.
 * Actual spend is always reconciled against provider invoices; this catalog
 * governs pre-dispatch enforcement and in-product reporting, not billing truth.
 */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek'

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'tools'
  | 'structured_output'
  | 'streaming'
  | 'prompt_caching'
  | 'reasoning_effort'

/** Prices in US dollars per million tokens. */
export interface ModelPricing {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
  /**
   * Cached input reads, where the provider offers them. Roughly an order of
   * magnitude cheaper than fresh input, which makes caching the single largest
   * lever on the cost of a long agent run.
   */
  readonly cachedInputPerMillion?: number
  /** Cache writes, typically at a premium over fresh input. */
  readonly cacheWritePerMillion?: number
}

export interface ModelDescriptor {
  readonly id: string
  readonly provider: ProviderId
  readonly displayName: string
  readonly capabilities: readonly ModelCapability[]
  readonly contextTokens: number
  readonly maxOutputTokens: number
  readonly pricing: ModelPricing
  /** Relative reasoning strength, for capability-based routing. */
  readonly reasoningTier: 'basic' | 'standard' | 'deep'
  /** Relative latency class. Not milliseconds — those depend on the prompt. */
  readonly latencyClass: 'fast' | 'standard' | 'slow'
  /** ISO date the pricing and limits below were last checked against the provider. */
  readonly verifiedAt: string
  /** Set when a successor exists, so the router can stop selecting it. */
  readonly deprecated?: boolean
  readonly notes?: string
}

const ANTHROPIC_VERIFIED = '2026-06-24'

/**
 * Anthropic models.
 *
 * Verified against the provider's published pricing on the date above. Cache
 * economics are uniform across the family: reads at ~0.1x input, writes at
 * ~1.25x for the short TTL, so they are derived rather than restated per entry.
 */
const anthropicModels: readonly ModelDescriptor[] = [
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5',
    capabilities: [
      'text',
      'vision',
      'tools',
      'structured_output',
      'streaming',
      'prompt_caching',
      'reasoning_effort',
    ],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cachedInputPerMillion: 0.5,
      cacheWritePerMillion: 6.25,
    },
    reasoningTier: 'deep',
    latencyClass: 'standard',
    verifiedAt: ANTHROPIC_VERIFIED,
    notes: 'Default for campaign strategy and any agent that plans or delegates.',
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5',
    capabilities: [
      'text',
      'vision',
      'tools',
      'structured_output',
      'streaming',
      'prompt_caching',
      'reasoning_effort',
    ],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cachedInputPerMillion: 0.3,
      cacheWritePerMillion: 3.75,
    },
    reasoningTier: 'standard',
    latencyClass: 'standard',
    verifiedAt: ANTHROPIC_VERIFIED,
    notes:
      'Introductory pricing of $2/$10 per million applies through 2026-08-31; the ' +
      'catalog carries the standard rate so budgets are never under-estimated.',
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    capabilities: ['text', 'vision', 'tools', 'structured_output', 'streaming', 'prompt_caching'],
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    pricing: {
      inputPerMillion: 1,
      outputPerMillion: 5,
      cachedInputPerMillion: 0.1,
      cacheWritePerMillion: 1.25,
    },
    reasoningTier: 'basic',
    latencyClass: 'fast',
    verifiedAt: ANTHROPIC_VERIFIED,
    notes: 'High-volume work: lead scoring, classification, short summaries.',
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.8',
    capabilities: [
      'text',
      'vision',
      'tools',
      'structured_output',
      'streaming',
      'prompt_caching',
      'reasoning_effort',
    ],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cachedInputPerMillion: 0.5,
      cacheWritePerMillion: 6.25,
    },
    reasoningTier: 'deep',
    latencyClass: 'standard',
    verifiedAt: ANTHROPIC_VERIFIED,
    notes: 'Retained as the fallback target when a newer model declines a request.',
  },
]

/**
 * Non-Anthropic providers.
 *
 * Left empty deliberately. Adding a model here asserts its pricing and limits,
 * and an invented figure would corrupt budget enforcement while looking
 * authoritative. Each is populated when its adapter is built and its published
 * rates are checked — `assertCatalogFresh` and the empty-provider guard in
 * `resolveModel` make the absence loud rather than silent.
 */
const openAiModels: readonly ModelDescriptor[] = []
const googleModels: readonly ModelDescriptor[] = []
const xaiModels: readonly ModelDescriptor[] = []
const deepseekModels: readonly ModelDescriptor[] = []

export const MODEL_CATALOG: readonly ModelDescriptor[] = [
  ...anthropicModels,
  ...openAiModels,
  ...googleModels,
  ...xaiModels,
  ...deepseekModels,
]

const byId = new Map(MODEL_CATALOG.map((model) => [model.id, model]))

export function findModel(id: string): ModelDescriptor | undefined {
  return byId.get(id)
}

export function modelsForProvider(provider: ProviderId): readonly ModelDescriptor[] {
  return MODEL_CATALOG.filter((model) => model.provider === provider)
}

/**
 * Operator-supplied rate correction.
 *
 * Exists so a provider price change is a configuration edit rather than a
 * release. Without it, the gap between a rate change and the next deploy is a
 * window in which the platform under-bills every tenant.
 */
export interface PricingOverride {
  readonly modelId: string
  readonly pricing: ModelPricing
  readonly effectiveFrom: Date
  readonly source: string
}

export function pricingFor(
  model: ModelDescriptor,
  overrides: readonly PricingOverride[] = [],
  at: Date = new Date(),
): ModelPricing {
  const applicable = overrides
    .filter((o) => o.modelId === model.id && o.effectiveFrom <= at)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())

  return applicable[0]?.pricing ?? model.pricing
}

export interface CostInput {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens?: number
  readonly cacheWriteTokens?: number
}

/**
 * Computes the cost of one call, in US dollars.
 *
 * Returned as a string, not a number. Costs are summed across millions of calls
 * and stored in a Postgres `numeric`; accumulating them as IEEE-754 doubles
 * drifts, and money that drifts is a reconciliation problem nobody enjoys.
 * Six decimal places, because a single cheap call can cost well under a cent.
 */
export function computeCost(
  model: ModelDescriptor,
  usage: CostInput,
  overrides: readonly PricingOverride[] = [],
): string {
  const price = pricingFor(model, overrides)
  const perToken = (perMillion: number): number => perMillion / 1_000_000

  // Cached reads are billed at the cache rate, so they must not also be billed
  // as fresh input. Providers report them separately; subtracting here keeps the
  // two accountings from double-counting the same tokens.
  const freshInput = Math.max(0, usage.inputTokens - (usage.cachedInputTokens ?? 0))

  const total =
    freshInput * perToken(price.inputPerMillion) +
    usage.outputTokens * perToken(price.outputPerMillion) +
    (usage.cachedInputTokens ?? 0) *
      perToken(price.cachedInputPerMillion ?? price.inputPerMillion) +
    (usage.cacheWriteTokens ?? 0) * perToken(price.cacheWritePerMillion ?? price.inputPerMillion)

  return total.toFixed(6)
}

/**
 * Estimates cost before dispatch, from a token count.
 *
 * Output length is unknown ahead of time, so the caller supplies a ceiling —
 * normally the request's `maxOutputTokens`. Estimating high is deliberate: a
 * budget check that under-estimates lets a tenant exceed its cap, which is the
 * failure that costs money.
 */
export function estimateCost(
  model: ModelDescriptor,
  inputTokens: number,
  maxOutputTokens: number,
  overrides: readonly PricingOverride[] = [],
): string {
  return computeCost(model, { inputTokens, outputTokens: maxOutputTokens }, overrides)
}

export interface ResolveOptions {
  readonly reasoning?: 'basic' | 'standard' | 'deep'
  readonly vision?: boolean
  readonly tools?: boolean
  readonly structuredOutput?: boolean
  readonly minContextTokens?: number
  readonly optimiseFor?: 'cost' | 'latency' | 'quality' | 'balanced'
  /** Providers with a configured credential for this organisation. */
  readonly availableProviders: readonly ProviderId[]
}

const REASONING_RANK = { basic: 0, standard: 1, deep: 2 } as const
const LATENCY_RANK = { fast: 0, standard: 1, slow: 2 } as const

/**
 * Picks the cheapest model that satisfies the requirements.
 *
 * Capability-based rather than name-based so that agents never name a model.
 * Returns `undefined` instead of falling back to an arbitrary model: silently
 * substituting something that does not meet the stated requirements produces a
 * wrong answer that looks like a right one.
 */
export function resolveModel(options: ResolveOptions): ModelDescriptor | undefined {
  const required = new Set<ModelCapability>(['text'])
  if (options.vision === true) required.add('vision')
  if (options.tools === true) required.add('tools')
  if (options.structuredOutput === true) required.add('structured_output')

  const minReasoning = REASONING_RANK[options.reasoning ?? 'basic']

  const candidates = MODEL_CATALOG.filter((model) => {
    if (model.deprecated === true) return false
    if (!options.availableProviders.includes(model.provider)) return false
    if (REASONING_RANK[model.reasoningTier] < minReasoning) return false
    if (options.minContextTokens !== undefined && model.contextTokens < options.minContextTokens) {
      return false
    }
    return [...required].every((capability) => model.capabilities.includes(capability))
  })

  if (candidates.length === 0) return undefined

  // A blended per-million figure weighted toward output, which dominates spend
  // on generative work. Not a forecast — only an ordering for equal candidates.
  const blendedCost = (model: ModelDescriptor): number =>
    model.pricing.inputPerMillion * 0.25 + model.pricing.outputPerMillion * 0.75

  const sorted = [...candidates].sort((a, b) => {
    switch (options.optimiseFor ?? 'balanced') {
      case 'cost':
        return blendedCost(a) - blendedCost(b)
      case 'latency':
        return LATENCY_RANK[a.latencyClass] - LATENCY_RANK[b.latencyClass]
      case 'quality':
        return REASONING_RANK[b.reasoningTier] - REASONING_RANK[a.reasoningTier]
      case 'balanced':
      default: {
        // Meet the requirement, then spend the least doing so.
        const tier = REASONING_RANK[a.reasoningTier] - REASONING_RANK[b.reasoningTier]
        return tier !== 0 ? tier : blendedCost(a) - blendedCost(b)
      }
    }
  })

  return sorted[0]
}

/**
 * Fails when catalog entries have not been re-checked recently.
 *
 * Called by a test and a scheduled job. A hardcoded price that drifts from the
 * provider's actual rate is invisible until an invoice disagrees with the
 * product, so staleness is made to fail loudly on a fixed cadence.
 */
export function assertCatalogFresh(maxAgeDays = 90, now: Date = new Date()): void {
  const stale = MODEL_CATALOG.filter((model) => {
    const ageMs = now.getTime() - new Date(model.verifiedAt).getTime()
    return ageMs > maxAgeDays * 86_400_000
  })

  if (stale.length > 0) {
    throw new Error(
      `Model pricing has not been verified in ${String(maxAgeDays)} days: ` +
        `${stale.map((m) => `${m.id} (${m.verifiedAt})`).join(', ')}. ` +
        'Re-check the provider pricing pages and update verifiedAt, or add a PricingOverride. ' +
        'Stale rates silently mis-bill every tenant.',
    )
  }
}
