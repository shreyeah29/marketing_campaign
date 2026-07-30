import { describe, expect, it } from 'vitest'

import {
  AGENT_IDS,
  AGENT_MANIFESTS,
  addUsd,
  assertCatalogFresh,
  assertRosterValid,
  checkBudget,
  computeCost,
  DEFAULT_SPECIALIST_BUDGET,
  estimateCost,
  findModel,
  MODEL_CATALOG,
  resolveModel,
  type OrganizationBudget,
  type SpendSnapshot,
} from '../index.js'

const snapshot = (overrides: Partial<SpendSnapshot> = {}): SpendSnapshot => ({
  periodSpendUsd: '0.000000',
  runSpendUsd: '0.000000',
  modelCalls: 0,
  toolCalls: 0,
  runStartedAt: new Date(),
  ...overrides,
})

const uncapped: OrganizationBudget = { monthlyLimitUsd: null, hardStop: true }

describe('cost arithmetic', () => {
  it('bills cached input at the cache rate, not twice', () => {
    // The failure this guards: providers report cached tokens *within*
    // inputTokens, so naively adding both over-bills the customer for the same
    // tokens — at ten times the correct rate.
    const model = findModel('claude-opus-5')
    expect(model).toBeDefined()

    const allFresh = computeCost(model!, { inputTokens: 1_000_000, outputTokens: 0 })
    const allCached = computeCost(model!, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
    })

    expect(allFresh).toBe('5.000000')
    // $0.50 per million, a tenth of fresh input.
    expect(allCached).toBe('0.500000')
  })

  it('keeps precision on amounts far below a cent', () => {
    const model = findModel('claude-haiku-4-5')
    // A short classification call. Rounding this to two decimals would report
    // zero, and a million of them would report zero.
    const cost = computeCost(model!, { inputTokens: 800, outputTokens: 120 })
    expect(cost).toBe('0.001400')
  })

  it('does not drift when summed many times', () => {
    // Doubles accumulate error; fixed-point does not. Ten thousand small charges
    // is an ordinary day for one tenant.
    let total = '0.000000'
    for (let i = 0; i < 10_000; i += 1) total = addUsd(total, '0.000100')
    expect(total).toBe('1.000000')
  })

  it('estimates from the output ceiling, so the estimate is never under', () => {
    const model = findModel('claude-sonnet-5')
    const estimate = estimateCost(model!, 10_000, 4_000)
    const actual = computeCost(model!, { inputTokens: 10_000, outputTokens: 1_200 })
    expect(Number(estimate)).toBeGreaterThan(Number(actual))
  })
})

describe('model routing', () => {
  it('picks by capability, never by name', () => {
    const chosen = resolveModel({
      reasoning: 'deep',
      tools: true,
      availableProviders: ['anthropic'],
    })
    expect(chosen?.reasoningTier).toBe('deep')
  })

  it('prefers the cheapest model that clears the requirement', () => {
    const chosen = resolveModel({
      reasoning: 'basic',
      optimiseFor: 'cost',
      availableProviders: ['anthropic'],
    })
    expect(chosen?.id).toBe('claude-haiku-4-5')
  })

  it('returns undefined rather than substituting something unqualified', () => {
    // Silently downgrading produces a wrong answer that looks right. The caller
    // must handle "no model can do this" explicitly.
    const chosen = resolveModel({
      minContextTokens: 50_000_000,
      availableProviders: ['anthropic'],
    })
    expect(chosen).toBeUndefined()
  })

  it('will not select a provider the organisation has no credential for', () => {
    expect(resolveModel({ availableProviders: [] })).toBeUndefined()
    expect(resolveModel({ availableProviders: ['openai'] })).toBeUndefined()
  })

  it('never selects a deprecated model', () => {
    const deprecated = MODEL_CATALOG.filter((m) => m.deprecated === true).map((m) => m.id)
    const chosen = resolveModel({ availableProviders: ['anthropic', 'openai', 'google'] })
    expect(deprecated).not.toContain(chosen?.id)
  })
})

describe('catalog integrity', () => {
  it('has current pricing', () => {
    // Fails loudly on a fixed cadence. A stale rate silently mis-bills every
    // tenant and is invisible until an invoice disagrees with the product.
    expect(() => assertCatalogFresh(120)).not.toThrow()
  })

  it('prices output at least as high as input for every model', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.pricing.outputPerMillion).toBeGreaterThanOrEqual(model.pricing.inputPerMillion)
    }
  })

  it('prices cached reads below fresh input wherever caching is offered', () => {
    for (const model of MODEL_CATALOG.filter((m) => m.capabilities.includes('prompt_caching'))) {
      expect(model.pricing.cachedInputPerMillion).toBeDefined()
      expect(model.pricing.cachedInputPerMillion!).toBeLessThan(model.pricing.inputPerMillion)
    }
  })
})

describe('budget enforcement', () => {
  it('refuses before the spend, not after', () => {
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      uncapped,
      snapshot({ runSpendUsd: '1.950000' }),
      '0.200000',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.limit).toBe('run_cost')
  })

  it('stops a non-converging loop on call count', () => {
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      uncapped,
      snapshot({ modelCalls: DEFAULT_SPECIALIST_BUDGET.maxModelCalls }),
      '0.000100',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.limit).toBe('model_calls')
  })

  it('ends a run that stalls without spending', () => {
    const started = new Date(Date.now() - DEFAULT_SPECIALIST_BUDGET.maxDurationMs - 1000)
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      uncapped,
      snapshot({ runStartedAt: started }),
      '0.000100',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.limit).toBe('duration')
  })

  it('hard-stops at the organisation cap', () => {
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      { monthlyLimitUsd: '100.000000', hardStop: true },
      snapshot({ periodSpendUsd: '99.900000' }),
      '0.500000',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.limit).toBe('organization_monthly')
  })

  it('warns instead of refusing when hard stop is off', () => {
    // An agency mid campaign launch would rather overspend than stop. The choice
    // is the customer's, and both paths must be exercised.
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      { monthlyLimitUsd: '100.000000', hardStop: false },
      snapshot({ periodSpendUsd: '99.900000' }),
      '0.500000',
    )
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.warning).toContain('exceeded')
  })

  it('warns on approach so the cap is not a surprise', () => {
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      { monthlyLimitUsd: '100.000000', hardStop: true },
      snapshot({ periodSpendUsd: '85.000000' }),
      '0.100000',
    )
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.warning).toContain('80%')
  })

  it('names the limit it hit, so the UI can be specific', () => {
    const decision = checkBudget(
      DEFAULT_SPECIALIST_BUDGET,
      uncapped,
      snapshot({ toolCalls: 999 }),
      '0.000100',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toContain('tool calls')
  })
})

describe('agent roster', () => {
  it('declares a manifest for all twelve employees', () => {
    expect(AGENT_MANIFESTS).toHaveLength(AGENT_IDS.length)
    expect(() => assertRosterValid(AGENT_IDS)).not.toThrow()
  })

  it('keeps delegation one level deep', () => {
    // Specialists that spawn specialists make run cost unpredictable and traces
    // impossible to follow. Only the CMO fans out.
    for (const manifest of AGENT_MANIFESTS) {
      if (manifest.id !== 'CMO') expect(manifest.delegatesTo).toHaveLength(0)
    }
    expect(cmoDelegates()).toBe(AGENT_IDS.length - 1)
  })

  it('declares every prompt variable it interpolates', () => {
    // An undeclared placeholder reaches a customer-facing deliverable as the
    // literal string {{brandVoice}}.
    for (const manifest of AGENT_MANIFESTS) {
      const used = [...manifest.prompt.system.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
      for (const variable of used) {
        expect(manifest.prompt.variables).toContain(variable)
      }
    }
  })

  it('gives every agent a bounded budget', () => {
    for (const manifest of AGENT_MANIFESTS) {
      expect(Number(manifest.budget.maxCostPerRunUsd)).toBeGreaterThan(0)
      expect(manifest.budget.maxModelCalls).toBeGreaterThan(0)
      expect(manifest.budget.maxDurationMs).toBeGreaterThan(0)
    }
  })
})

function cmoDelegates(): number {
  return AGENT_MANIFESTS.find((m) => m.id === 'CMO')?.delegatesTo.length ?? 0
}
