import { z } from 'zod'

/**
 * Domain event contracts.
 *
 * These are the only thing modules know about each other. `crm` never imports
 * from `campaigns`; it emits `crm.lead.created.v1` and whoever cares subscribes.
 * That is what makes each module extractable into its own service later without
 * renegotiating an interface — the contract is already explicit and already
 * serialised.
 *
 * Naming: `<module>.<aggregate>.<action>.<version>`.
 *
 * Versioning is in the name, not a field, and events are additive-only. When a
 * payload must change incompatibly, `...v2` is introduced and both are published
 * until every consumer has moved. Editing a `v1` payload in place would break
 * consumers that are mid-deploy, and would silently corrupt any event already
 * sitting in the outbox awaiting dispatch.
 */

/** Fields present on every event, added by the publisher rather than by hand. */
export const eventEnvelopeSchema = z.object({
  /** Event id. Consumers use it to deduplicate, since delivery is at-least-once. */
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  /** Tenant. Null only for platform-level events with no owning organisation. */
  organizationId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  /** Shared by every event and log record produced by one originating request. */
  correlationId: z.string().min(1).optional(),
  /** The event that caused this one, forming a causal chain for debugging. */
  causationId: z.string().min(1).optional(),
  /** Who or what caused it, so an agent's effects are attributable. */
  actor: z
    .object({
      type: z.enum(['USER', 'AGENT', 'SYSTEM', 'API_KEY']),
      id: z.string().optional(),
      agentRunId: z.string().optional(),
    })
    .optional(),
})

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>

// ─── IAM ─────────────────────────────────────────────────────────────────────

export const organizationCreatedV1 = z.object({
  organizationId: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
})

export const memberInvitedV1 = z.object({
  invitationId: z.string(),
  email: z.string().email(),
  role: z.string(),
  invitedByUserId: z.string(),
})

export const memberJoinedV1 = z.object({
  userId: z.string(),
  role: z.string(),
})

// ─── CRM ─────────────────────────────────────────────────────────────────────

export const leadCreatedV1 = z.object({
  leadId: z.string(),
  contactId: z.string().nullable(),
  source: z.string().nullable(),
  campaignId: z.string().nullable(),
})

export const leadQualifiedV1 = z.object({
  leadId: z.string(),
  score: z.number().int(),
  /** Recorded so a human can audit why the sales agent qualified this lead. */
  reason: z.string().nullable(),
  qualifiedBy: z.enum(['USER', 'AGENT']),
})

export const leadStatusChangedV1 = z.object({
  leadId: z.string(),
  from: z.string(),
  to: z.string(),
})

export const dealStageChangedV1 = z.object({
  dealId: z.string(),
  fromStageId: z.string().nullable(),
  toStageId: z.string(),
  value: z.string(),
})

export const dealWonV1 = z.object({
  dealId: z.string(),
  value: z.string(),
  currency: z.string(),
  contactId: z.string().nullable(),
})

// ─── Campaigns and content ───────────────────────────────────────────────────

export const campaignLaunchedV1 = z.object({
  campaignId: z.string(),
  channels: z.array(z.string()),
  budgetTotal: z.string().nullable(),
})

export const contentGeneratedV1 = z.object({
  documentId: z.string(),
  type: z.string(),
  generatedByAgent: z.string(),
  agentRunId: z.string(),
})

export const contentApprovedV1 = z.object({
  documentId: z.string(),
  reviewerId: z.string(),
})

export const contentPublishedV1 = z.object({
  documentId: z.string(),
  url: z.string().nullable(),
})

// ─── Messaging, social, telephony ────────────────────────────────────────────

export const messageReceivedV1 = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  channel: z.string(),
  contactId: z.string().nullable(),
})

export const socialPostPublishedV1 = z.object({
  postId: z.string(),
  targets: z.array(z.object({ platform: z.string(), externalPostId: z.string().nullable() })),
})

export const callCompletedV1 = z.object({
  callId: z.string(),
  contactId: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  disposition: z.string().nullable(),
})

// ─── Agents ──────────────────────────────────────────────────────────────────

export const agentRunStartedV1 = z.object({
  runId: z.string(),
  agentId: z.string(),
  goal: z.string(),
  parentRunId: z.string().nullable(),
})

export const agentRunCompletedV1 = z.object({
  runId: z.string(),
  agentId: z.string(),
  status: z.string(),
  /** Included so billing and budget enforcement need no second lookup. */
  totalCostUsd: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  durationMs: z.number().int().nullable(),
})

export const agentApprovalRequestedV1 = z.object({
  runId: z.string(),
  stepId: z.string(),
  summary: z.string(),
})

export const aiBudgetExceededV1 = z.object({
  /** Emitted when work is refused, not merely when the cap is neared. */
  periodStart: z.string().datetime(),
  budgetUsd: z.string(),
  spentUsd: z.string(),
  refusedAgentId: z.string().nullable(),
})

// ─── Billing ─────────────────────────────────────────────────────────────────

export const subscriptionChangedV1 = z.object({
  subscriptionId: z.string(),
  tier: z.string(),
  status: z.string(),
  seats: z.number().int(),
})

export const usageRecordedV1 = z.object({
  metric: z.string(),
  quantity: z.string(),
  periodStart: z.string().datetime(),
})

/**
 * The registry. Every publishable event and its payload schema.
 *
 * A single map means the publisher can validate a payload before it reaches the
 * outbox, and the dispatcher can validate again before handing it to a consumer —
 * so a malformed event is caught at the boundary it was produced at, not three
 * services later where the cause is unrecoverable.
 */
export const EVENT_REGISTRY = {
  'iam.organization.created.v1': organizationCreatedV1,
  'iam.member.invited.v1': memberInvitedV1,
  'iam.member.joined.v1': memberJoinedV1,

  'crm.lead.created.v1': leadCreatedV1,
  'crm.lead.qualified.v1': leadQualifiedV1,
  'crm.lead.status_changed.v1': leadStatusChangedV1,
  'crm.deal.stage_changed.v1': dealStageChangedV1,
  'crm.deal.won.v1': dealWonV1,

  'campaigns.campaign.launched.v1': campaignLaunchedV1,
  'content.document.generated.v1': contentGeneratedV1,
  'content.document.approved.v1': contentApprovedV1,
  'content.document.published.v1': contentPublishedV1,

  'messaging.message.received.v1': messageReceivedV1,
  'social.post.published.v1': socialPostPublishedV1,
  'telephony.call.completed.v1': callCompletedV1,

  'agents.run.started.v1': agentRunStartedV1,
  'agents.run.completed.v1': agentRunCompletedV1,
  'agents.approval.requested.v1': agentApprovalRequestedV1,
  'agents.budget.exceeded.v1': aiBudgetExceededV1,

  'billing.subscription.changed.v1': subscriptionChangedV1,
  'billing.usage.recorded.v1': usageRecordedV1,
} as const

export type EventName = keyof typeof EVENT_REGISTRY

export type EventPayload<N extends EventName> = z.infer<(typeof EVENT_REGISTRY)[N]>

/** A fully-formed event: envelope plus its validated payload. */
export type DomainEvent<N extends EventName = EventName> = EventEnvelope & {
  readonly name: N
  readonly payload: EventPayload<N>
}

export const EVENT_NAMES = Object.keys(EVENT_REGISTRY) as EventName[]

export function isKnownEventName(name: string): name is EventName {
  return name in EVENT_REGISTRY
}

/**
 * Validates a payload against its registered schema.
 *
 * Called by the publisher before writing to the outbox. Rejecting at publish time
 * keeps the outbox free of events that can never be delivered — a poisoned row
 * there blocks or dead-letters repeatedly and has to be cleaned up by hand.
 */
export function parseEventPayload<N extends EventName>(name: N, payload: unknown): EventPayload<N> {
  return EVENT_REGISTRY[name].parse(payload) as EventPayload<N>
}

/** Extracts the version encoded in an event name. */
export function eventVersion(name: EventName): number {
  const match = /\.v(\d+)$/.exec(name)
  return match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10)
}
