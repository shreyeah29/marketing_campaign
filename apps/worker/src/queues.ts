import type { JobsOptions } from 'bullmq'

/**
 * Queue topology and retry policy.
 *
 * Retry behaviour is per queue rather than global, because the right policy
 * depends entirely on what a failure means and what a retry costs:
 *
 *   · An **email send** that fails on a 500 from the provider should retry
 *     patiently — the recipient still needs the message.
 *   · A **model call** costs money on every attempt, so its ceiling is low.
 *   · A **social publish** must retry cautiously: the platform may have accepted
 *     the post and failed to acknowledge, so an eager retry double-posts publicly.
 *
 * A single global policy would be wrong for most of these, and "wrong" here means
 * either abandoned work or duplicated outbound messages.
 */

export const QUEUES = {
  /** Relays committed outbox rows to their handlers. The spine of the event bus. */
  OUTBOX_DISPATCH: 'outbox-dispatch',
  /** Agent runs: planning, delegation, tool execution. Long-lived and expensive. */
  AGENT_RUNS: 'agent-runs',
  CONTENT_GENERATION: 'content-generation',
  MEDIA_GENERATION: 'media-generation',
  EMAIL_SEND: 'email-send',
  SOCIAL_PUBLISH: 'social-publish',
  WHATSAPP_SEND: 'whatsapp-send',
  TELEPHONY: 'telephony',
  EMBEDDINGS: 'embeddings',
  ANALYTICS_ROLLUP: 'analytics-rollup',
  SCHEDULED_TRIGGERS: 'scheduled-triggers',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  /** Executes workflow runs node-by-node. Delays re-enqueue with a BullMQ delay. */
  WORKFLOW_EXECUTION: 'workflow-execution',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export interface QueuePolicy {
  readonly name: QueueName
  /** Jobs processed in parallel by one worker process. */
  readonly concurrency: number
  readonly jobOptions: JobsOptions
  readonly rationale: string
}

/**
 * Exponential backoff. Every queue uses it; only the ceiling differs.
 *
 * Typed as a concrete object rather than `JobsOptions['backoff']`, which is
 * optional and therefore includes `undefined` — assigning that back into a
 * required field fails under exactOptionalPropertyTypes.
 */
const backoff = (delayMs: number): { type: 'exponential'; delay: number } => ({
  type: 'exponential',
  delay: delayMs,
})

/**
 * Completed and failed jobs are retained, not discarded.
 *
 * `removeOnComplete: true` is the BullMQ default and it destroys the audit trail:
 * once a job is gone there is no way to answer "did that email actually send?".
 * A bounded count keeps Redis from growing without losing recent history.
 */
const RETAIN = { removeOnComplete: 1_000, removeOnFail: 5_000 } as const

export const QUEUE_POLICIES: readonly QueuePolicy[] = [
  {
    name: QUEUES.OUTBOX_DISPATCH,
    concurrency: 5,
    jobOptions: { ...RETAIN, attempts: 5, backoff: backoff(1_000) },
    rationale:
      'Relay only. A failure here is usually a transient handler error, and the row stays PENDING ' +
      'in the outbox regardless, so the dispatcher itself can retry cheaply.',
  },
  {
    name: QUEUES.AGENT_RUNS,
    concurrency: 3,
    // Two attempts, not five. Every attempt re-runs model calls and re-spends
    // real money; a systematically failing run must stop rather than burn budget.
    jobOptions: { ...RETAIN, attempts: 2, backoff: backoff(5_000) },
    rationale:
      'Each attempt costs money. Low ceiling and low concurrency, because a run fans out to child ' +
      'runs and unbounded parallelism multiplies spend.',
  },
  {
    name: QUEUES.CONTENT_GENERATION,
    concurrency: 5,
    jobOptions: { ...RETAIN, attempts: 3, backoff: backoff(3_000) },
    rationale: 'Model-backed and therefore costly, but cheaper than a full agent run.',
  },
  {
    name: QUEUES.MEDIA_GENERATION,
    concurrency: 2,
    jobOptions: { ...RETAIN, attempts: 2, backoff: backoff(10_000) },
    rationale:
      'Image and video generation are the most expensive operations per attempt and the slowest. ' +
      'Low concurrency also respects provider rate limits.',
  },
  {
    name: QUEUES.EMAIL_SEND,
    concurrency: 10,
    // Patient: the recipient still needs the message, and a provider outage
    // should not silently drop a campaign.
    jobOptions: { ...RETAIN, attempts: 5, backoff: backoff(30_000) },
    rationale: 'Idempotent at the provider via a message key, so retries are safe and worth it.',
  },
  {
    name: QUEUES.SOCIAL_PUBLISH,
    concurrency: 3,
    // Two attempts only. A platform may have accepted the post and failed to
    // acknowledge it; an eager retry double-posts in public, which is worse than
    // a failure someone can see and fix.
    jobOptions: { ...RETAIN, attempts: 2, backoff: backoff(60_000) },
    rationale:
      'Not reliably idempotent across platforms. A duplicate is publicly visible, so failing is ' +
      'preferable to retrying hard.',
  },
  {
    name: QUEUES.WHATSAPP_SEND,
    concurrency: 10,
    jobOptions: { ...RETAIN, attempts: 3, backoff: backoff(15_000) },
    rationale: 'Provider deduplicates on a client message id, so bounded retries are safe.',
  },
  {
    name: QUEUES.TELEPHONY,
    concurrency: 5,
    // One attempt. Retrying a call means phoning a person twice.
    jobOptions: { ...RETAIN, attempts: 1 },
    rationale:
      'A retry places a second real phone call. Never automatic — a failed call surfaces for a ' +
      'human to decide about.',
  },
  {
    name: QUEUES.EMBEDDINGS,
    concurrency: 8,
    jobOptions: { ...RETAIN, attempts: 4, backoff: backoff(2_000) },
    rationale: 'Cheap, idempotent and fully re-runnable — the friendliest retry profile here.',
  },
  {
    name: QUEUES.ANALYTICS_ROLLUP,
    concurrency: 2,
    jobOptions: { ...RETAIN, attempts: 3, backoff: backoff(5_000) },
    rationale: 'Recomputes from source data, so a retry converges on the same answer.',
  },
  {
    name: QUEUES.SCHEDULED_TRIGGERS,
    concurrency: 5,
    jobOptions: { ...RETAIN, attempts: 3, backoff: backoff(5_000) },
    rationale: 'Evaluates workflow triggers. Side effects are enqueued, not performed here.',
  },
  {
    name: QUEUES.WEBHOOK_DELIVERY,
    concurrency: 10,
    jobOptions: { ...RETAIN, attempts: 5, backoff: backoff(10_000) },
    rationale: 'Customer endpoints are frequently flaky; patience is expected of a webhook sender.',
  },
  {
    name: QUEUES.WORKFLOW_EXECUTION,
    concurrency: 5,
    // Three attempts with backoff. Re-execution is safe: the executor tracks
    // completed nodes on the run, so a retry resumes at the failed node rather
    // than repeating side effects. Exhaustion dead-letters the run.
    jobOptions: { ...RETAIN, attempts: 3, backoff: backoff(4_000) },
    rationale:
      "Orchestration. Each node is idempotent via the run's completed-node set, so retries do not " +
      'duplicate actions; delays re-enqueue with a BullMQ delay rather than blocking a worker.',
  },
]

export function policyFor(name: QueueName): QueuePolicy {
  const policy = QUEUE_POLICIES.find((candidate) => candidate.name === name)
  if (!policy) {
    throw new Error(`No queue policy declared for ${name}. Add one to QUEUE_POLICIES.`)
  }
  return policy
}

/**
 * Dead-letter queue name for a queue.
 *
 * BullMQ keeps exhausted jobs in its own failed set, which is enough to inspect
 * them but not to act on them. Moving them onto an explicit DLQ means a failure
 * can be alerted on, replayed after a fix, or drained deliberately — and a
 * poisoned job stops consuming worker capacity while it waits.
 */
export function deadLetterQueue(name: QueueName): string {
  return `${name}.dlq`
}

/** Every job payload carries its tenant, so a worker can open the same context. */
export interface TenantJobData {
  readonly organizationId: string
  readonly userId?: string
  readonly requestId?: string
}
