import type { BudgetPolicy } from '../agents/agent.js'

/**
 * Budget enforcement.
 *
 * An AI SaaS without a per-tenant spend ceiling is an unbounded liability: a
 * single runaway agent loop, or one customer automating aggressively on a flat
 * plan, can cost more than the subscription earns. The guard has to run *before*
 * dispatch — checking after the call is accounting, not enforcement.
 *
 * Costs are decimal strings throughout. Summing thousands of six-decimal charges
 * as doubles drifts, and this is money.
 */

export interface SpendSnapshot {
  /** Spent this billing period, in US dollars. */
  readonly periodSpendUsd: string
  /** Spent so far in the current run, including any child runs. */
  readonly runSpendUsd: string
  readonly modelCalls: number
  readonly toolCalls: number
  readonly runStartedAt: Date
}

export interface OrganizationBudget {
  /** Monthly ceiling, or null for uncapped. */
  readonly monthlyLimitUsd: string | null
  /**
   * When true, reaching the cap refuses further work. When false it only warns.
   *
   * Configurable because the right answer differs by customer: an agency mid
   * campaign launch would rather overspend than stop, while a small firm wants a
   * hard stop. Defaulting to a hard stop is the safer choice for the platform.
   */
  readonly hardStop: boolean
}

export type BudgetDecision =
  | { readonly allowed: true; readonly warning?: string }
  | {
      readonly allowed: false
      readonly reason: string
      readonly limit:
        'organization_monthly' | 'run_cost' | 'model_calls' | 'tool_calls' | 'duration'
    }

/** Fixed-point arithmetic on decimal strings, to six places. */
const SCALE = 1_000_000

function toScaled(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid decimal amount: ${value}`)
  }
  return Math.round(parsed * SCALE)
}

function fromScaled(value: number): string {
  return (value / SCALE).toFixed(6)
}

export function addUsd(a: string, b: string): string {
  return fromScaled(toScaled(a) + toScaled(b))
}

export function compareUsd(a: string, b: string): number {
  return toScaled(a) - toScaled(b)
}

/**
 * Decides whether a unit of work may proceed.
 *
 * Ordered cheapest-check-first, and every refusal names the limit it hit so the
 * UI can say something better than "budget exceeded" — a customer who cannot see
 * which ceiling stopped them cannot act on it.
 */
export function checkBudget(
  policy: BudgetPolicy,
  organization: OrganizationBudget,
  snapshot: SpendSnapshot,
  estimatedCostUsd: string,
  now: Date = new Date(),
): BudgetDecision {
  if (snapshot.modelCalls >= policy.maxModelCalls) {
    return {
      allowed: false,
      limit: 'model_calls',
      reason:
        `Run reached its ceiling of ${String(policy.maxModelCalls)} model calls. This normally ` +
        'means the agent is not converging rather than that the task is large.',
    }
  }

  if (snapshot.toolCalls >= policy.maxToolCalls) {
    return {
      allowed: false,
      limit: 'tool_calls',
      reason: `Run reached its ceiling of ${String(policy.maxToolCalls)} tool calls.`,
    }
  }

  const elapsedMs = now.getTime() - snapshot.runStartedAt.getTime()
  if (elapsedMs >= policy.maxDurationMs) {
    return {
      allowed: false,
      limit: 'duration',
      reason:
        `Run exceeded its ceiling of ${String(Math.round(policy.maxDurationMs / 1000))}s. A run ` +
        'that stops making progress must still end.',
    }
  }

  const projectedRunSpend = addUsd(snapshot.runSpendUsd, estimatedCostUsd)
  if (compareUsd(projectedRunSpend, policy.maxCostPerRunUsd) > 0) {
    return {
      allowed: false,
      limit: 'run_cost',
      reason:
        `This step would take the run to $${projectedRunSpend}, past its $` +
        `${policy.maxCostPerRunUsd} ceiling.`,
    }
  }

  if (organization.monthlyLimitUsd !== null) {
    const projectedPeriodSpend = addUsd(snapshot.periodSpendUsd, estimatedCostUsd)
    const overLimit = compareUsd(projectedPeriodSpend, organization.monthlyLimitUsd) > 0

    if (overLimit && organization.hardStop) {
      return {
        allowed: false,
        limit: 'organization_monthly',
        reason:
          `This step would take monthly AI spend to $${projectedPeriodSpend}, past the $` +
          `${organization.monthlyLimitUsd} limit for this workspace. Raise the limit in ` +
          'Settings, or wait for the next billing period.',
      }
    }

    if (overLimit) {
      return {
        allowed: true,
        warning:
          `Monthly AI budget of $${organization.monthlyLimitUsd} is exceeded ` +
          `($${projectedPeriodSpend} projected). Proceeding because hard stop is disabled.`,
      }
    }

    // Warn on approach so the cap is not a surprise mid-campaign.
    const threshold = fromScaled(Math.round(toScaled(organization.monthlyLimitUsd) * 0.8))
    if (compareUsd(projectedPeriodSpend, threshold) > 0) {
      return {
        allowed: true,
        warning:
          `Monthly AI spend is at $${projectedPeriodSpend} of $${organization.monthlyLimitUsd} ` +
          '(over 80%).',
      }
    }
  }

  return { allowed: true }
}

/**
 * Records what a unit of work actually cost.
 *
 * Separate from the pre-dispatch check on purpose: the estimate bounds spend, the
 * record is what a customer is billed from. Reconciling the two is also how a bad
 * estimate gets noticed — a systematic gap means the estimator needs fixing.
 */
export interface UsageRecord {
  readonly organizationId: string
  readonly agentRunId?: string
  readonly userId?: string
  readonly provider: string
  readonly model: string
  readonly operation: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens: number
  readonly costUsd: string
  readonly latencyMs: number
  readonly succeeded: boolean
  readonly errorCode?: string
}

/**
 * Persists usage. Implemented against `@marketing-os/database` by the host.
 *
 * A port rather than a direct write so `ai-core` stays free of Prisma, and so
 * metering can be tested without a database.
 */
export interface UsageMeter {
  record(usage: UsageRecord): Promise<void>
  snapshot(organizationId: string, agentRunId: string): Promise<SpendSnapshot>
}
