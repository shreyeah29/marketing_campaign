import { parseEventPayload, type EventName, type EventPayload } from '@vsp/contracts'

import type { TenantTransactionClient } from './client.js'
import { getTenantContext } from './tenant-context.js'

/**
 * Transactional outbox.
 *
 * The problem it solves: a handler that writes to the database and then publishes
 * to a queue has two commits and no atomicity between them. If the process dies
 * in the gap — a deploy, an OOM kill, a network blip — the state change is durable
 * and the event is gone forever. Nothing retries it, because from the database's
 * point of view the work succeeded. In a marketing platform that means a lead
 * created but never nurtured, a deal won but never invoiced. Silent, and only
 * discovered when a customer asks why the follow-up never arrived.
 *
 * The fix is to write the event into the same transaction as the state change, so
 * they commit or roll back together, and have a separate worker relay it to
 * BullMQ. Delivery becomes at-least-once rather than at-most-once, which is why
 * every event carries an id consumers deduplicate on.
 *
 * The rule this enforces: never publish from application code. Emit into the
 * outbox, inside the transaction that made the change.
 */

export interface PublishOptions {
  /** Aggregate the event concerns, for tracing and replay. */
  readonly aggregateType?: string
  readonly aggregateId?: string
  /** Shared by everything produced by one originating request. */
  readonly correlationId?: string
  /** The event that caused this one, forming a causal chain. */
  readonly causationId?: string
  /**
   * Delays availability to the dispatcher. For events whose consumers need the
   * committing transaction to be visible to a read replica first.
   */
  readonly availableAt?: Date
  /**
   * Overrides the tenant. Required for platform events emitted with no tenant
   * context — a Stripe webhook, for instance, which must resolve the organisation
   * before it can be scoped to it.
   */
  readonly organizationId?: string | null
}

/**
 * Writes an event to the outbox inside the caller's transaction.
 *
 * Takes a transaction client, not the root client, so it is impossible to call
 * outside a transaction — which would reintroduce the exact dual-write problem
 * this exists to remove.
 *
 * The payload is validated against its registered schema before being written.
 * Rejecting here keeps undeliverable events out of the outbox: a malformed row
 * cannot be dispatched, so it either blocks its queue or dead-letters repeatedly
 * and has to be cleaned up by hand.
 */
export async function publishEvent<N extends EventName>(
  tx: TenantTransactionClient,
  name: N,
  payload: EventPayload<N>,
  options: PublishOptions = {},
): Promise<void> {
  // Throws on a malformed payload, before anything is persisted.
  const validated = parseEventPayload(name, payload)

  const organizationId =
    options.organizationId !== undefined
      ? options.organizationId
      : (getTenantContext()?.organizationId ?? null)

  const context = getTenantContext()

  await tx.outboxEvent.create({
    data: {
      // Explicit rather than relying on the tenant-scope extension: this value
      // may legitimately be null for platform events, which the extension would
      // otherwise refuse.
      organizationId: organizationId as string,
      eventName: name,
      eventVersion: extractVersion(name),
      payload: {
        ...validated,
        // The envelope travels with the payload so the dispatcher needs no join
        // to build a complete event.
        __actor: context
          ? {
              type: context.agentRunId === undefined ? 'USER' : 'AGENT',
              ...(context.userId === undefined ? {} : { id: context.userId }),
              ...(context.agentRunId === undefined ? {} : { agentRunId: context.agentRunId }),
            }
          : { type: 'SYSTEM' },
      },
      ...(options.aggregateType === undefined ? {} : { aggregateType: options.aggregateType }),
      ...(options.aggregateId === undefined ? {} : { aggregateId: options.aggregateId }),
      ...(options.correlationId === undefined
        ? context?.requestId === undefined
          ? {}
          : { correlationId: context.requestId }
        : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      ...(options.availableAt === undefined ? {} : { availableAt: options.availableAt }),
    },
  })
}

function extractVersion(name: string): number {
  const match = /\.v(\d+)$/.exec(name)
  return match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10)
}

/**
 * Claims a batch of pending events for dispatch.
 *
 * `FOR UPDATE SKIP LOCKED` is the important part: several dispatcher instances can
 * run concurrently and each takes a disjoint batch without blocking on the others.
 * Without `SKIP LOCKED` they would serialise behind one lock, and a single slow
 * dispatch would stall the whole pipeline.
 *
 * Rows are marked DISPATCHED in the same transaction that claims them, so a
 * crash mid-flight leaves them PENDING and they are simply picked up again. That
 * is at-least-once by design — consumers deduplicate on event id.
 */
export async function claimOutboxBatch(
  tx: TenantTransactionClient,
  batchSize: number,
): Promise<
  Array<{
    id: string
    organization_id: string | null
    event_name: string
    event_version: number
    payload: unknown
    aggregate_type: string | null
    aggregate_id: string | null
    correlation_id: string | null
    causation_id: string | null
    occurred_at: Date
    attempts: number
  }>
> {
  return tx.$queryRaw`
    WITH claimed AS (
      SELECT id
      FROM "outbox_event"
      WHERE status = 'PENDING' AND available_at <= now()
      ORDER BY occurred_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "outbox_event" o
    SET status = 'DISPATCHED', dispatched_at = now(), attempts = o.attempts + 1
    FROM claimed
    WHERE o.id = claimed.id
    RETURNING o.id, o.organization_id, o.event_name, o.event_version, o.payload,
              o.aggregate_type, o.aggregate_id, o.correlation_id, o.causation_id,
              o.occurred_at, o.attempts
  `
}

/**
 * Returns a failed event to PENDING with exponential backoff, or dead-letters it.
 *
 * Dead-lettering after a bounded number of attempts is deliberate: an event that
 * cannot be delivered must stop consuming dispatcher capacity, and must remain
 * visible for a human to inspect rather than being deleted. Retrying forever turns
 * one poisoned row into an outage for every other event behind it.
 */
export async function requeueOutboxEvent(
  tx: TenantTransactionClient,
  eventId: string,
  error: string,
  maxAttempts = 10,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "outbox_event"
    SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'DEAD_LETTERED'::outbox_status
                      ELSE 'PENDING'::outbox_status END,
        last_error = ${error},
        available_at = now() + (interval '1 second' * least(power(2, attempts)::int, 3600))
    WHERE id = ${eventId}
  `
}
