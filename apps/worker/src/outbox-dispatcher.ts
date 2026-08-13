import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import { isKnownEventName, type EventName } from '@marketing-os/contracts'
import { claimOutboxBatch, requeueOutboxEvent, type PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import { QUEUES, type QueueName } from './queues.js'

/**
 * Outbox dispatcher.
 *
 * The relay that makes the event bus trustworthy: a committed `outbox_event` row
 * is turned into a BullMQ job, and only then marked dispatched. Because the write
 * and the event committed together, and the relay is at-least-once, an event
 * cannot be lost — it can only be delivered more than once, which consumers
 * handle by deduplicating on event id.
 *
 * A polling loop rather than a Postgres `LISTEN/NOTIFY` subscription. `NOTIFY`
 * does not survive a disconnect: notifications raised while a listener is away
 * are gone, so a deploy or a network blip silently drops events and the failure
 * is invisible. Polling is less elegant and strictly more reliable, and at a
 * 500ms interval the added latency does not matter for anything asynchronous.
 */

/** Which queue handles each event. Unrouted events are logged, never dropped. */
const EVENT_ROUTES: Partial<Record<EventName, QueueName>> = {
  'crm.lead.created.v1': QUEUES.SCHEDULED_TRIGGERS,
  'crm.lead.qualified.v1': QUEUES.SCHEDULED_TRIGGERS,
  'crm.lead.status_changed.v1': QUEUES.SCHEDULED_TRIGGERS,
  'crm.deal.stage_changed.v1': QUEUES.ANALYTICS_ROLLUP,
  'crm.deal.won.v1': QUEUES.ANALYTICS_ROLLUP,

  'campaigns.campaign.launched.v1': QUEUES.SCHEDULED_TRIGGERS,
  'content.document.generated.v1': QUEUES.EMBEDDINGS,
  'content.document.approved.v1': QUEUES.SCHEDULED_TRIGGERS,
  'content.document.published.v1': QUEUES.EMBEDDINGS,

  'messaging.message.received.v1': QUEUES.AGENT_RUNS,
  'social.post.published.v1': QUEUES.ANALYTICS_ROLLUP,
  'telephony.call.completed.v1': QUEUES.ANALYTICS_ROLLUP,

  'agents.run.started.v1': QUEUES.WEBHOOK_DELIVERY,
  'agents.run.completed.v1': QUEUES.WEBHOOK_DELIVERY,
  'agents.approval.requested.v1': QUEUES.WEBHOOK_DELIVERY,
  'agents.budget.exceeded.v1': QUEUES.WEBHOOK_DELIVERY,

  'billing.subscription.changed.v1': QUEUES.WEBHOOK_DELIVERY,
  'billing.usage.recorded.v1': QUEUES.ANALYTICS_ROLLUP,

  'iam.organization.created.v1': QUEUES.WEBHOOK_DELIVERY,
  'iam.member.invited.v1': QUEUES.EMAIL_SEND,
  'iam.member.joined.v1': QUEUES.WEBHOOK_DELIVERY,
}

export interface DispatcherOptions {
  readonly batchSize: number
  readonly pollIntervalMs: number
  readonly idleBackoffMs: number
}

export const DEFAULT_DISPATCHER_OPTIONS: DispatcherOptions = {
  batchSize: 100,
  pollIntervalMs: 500,
  // Back off when the outbox is empty, which is the normal steady state. Polling
  // at full rate against an empty table is pure load on the primary.
  idleBackoffMs: 2_000,
}

export class OutboxDispatcher {
  private running = false
  private readonly queues = new Map<string, Queue>()

  constructor(
    /**
     * Unscoped client. The dispatcher relays events for every tenant, so it
     * cannot be tenant-scoped — see DIRECT_DATABASE_URL in config.ts.
     */
    private readonly db: PrismaClient,
    private readonly redis: Redis,
    private readonly logger: AppLogger,
    private readonly options: DispatcherOptions = DEFAULT_DISPATCHER_OPTIONS,
  ) {}

  private queue(name: string): Queue {
    let queue = this.queues.get(name)
    if (!queue) {
      queue = new Queue(name, { connection: this.redis })
      this.queues.set(name, queue)
    }
    return queue
  }

  async start(): Promise<void> {
    this.running = true
    this.logger.info({ options: this.options }, 'outbox dispatcher started')

    while (this.running) {
      let dispatched = 0
      try {
        dispatched = await this.tick()
      } catch (error) {
        // Never let the loop die. A dispatcher that exits on an error stops the
        // entire event bus, and nothing else notices until a customer does.
        this.logger.error({ err: error }, 'outbox dispatcher tick failed; continuing')
      }

      const delay = dispatched === 0 ? this.options.idleBackoffMs : this.options.pollIntervalMs
      await sleep(delay)
    }

    this.logger.info('outbox dispatcher stopped')
  }

  /**
   * Claims and relays one batch.
   *
   * The claim runs inside a tenant transaction because `claimOutboxEvent` uses
   * `FOR UPDATE SKIP LOCKED`, which needs a transaction to hold the locks — and
   * that is what lets several dispatcher instances run concurrently, each taking
   * a disjoint batch rather than serialising behind one lock.
   */
  private async tick(): Promise<number> {
    // No tenant context and no set_config: the batch spans tenants by definition.
    // Opening one would re-apply the filter that makes this impossible for the
    // application role. Each event's own tenant is opened by the worker that
    // handles the resulting job.
    const claimed = await this.db.$transaction(async (tx) =>
      claimOutboxBatch(tx as never, this.options.batchSize),
    )

    if (claimed.length === 0) return 0

    let relayed = 0

    for (const event of claimed) {
      const name = event.event_name

      if (!isKnownEventName(name)) {
        // An unknown name means the event was written by code that has since been
        // removed or renamed. Dead-letter it rather than retrying forever.
        this.logger.error({ eventId: event.id, name }, 'outbox event has an unknown name')
        await this.markFailed(event.id, `Unknown event name: ${name}`)
        continue
      }

      const target = EVENT_ROUTES[name]

      if (target === undefined) {
        // A known event with no consumer. Not an error — many events exist for
        // webhooks and audit only — but it must be visible so a missing route is
        // noticed rather than silently ignored.
        this.logger.debug({ eventId: event.id, name }, 'no queue route for event; acknowledged')
        relayed += 1
        continue
      }

      try {
        await this.queue(target).add(
          name,
          {
            eventId: event.id,
            eventName: name,
            organizationId: event.organization_id,
            payload: event.payload,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id,
            correlationId: event.correlation_id,
            occurredAt: event.occurred_at,
          },
          {
            // The event id is the job id, so BullMQ itself deduplicates a
            // re-delivered event. At-least-once relay plus this is effectively
            // once per consumer in the common case.
            jobId: event.id,
          },
        )
        relayed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error({ eventId: event.id, name, err: error }, 'failed to enqueue event')
        await this.markFailed(event.id, message)
      }
    }

    this.logger.debug({ claimed: claimed.length, relayed }, 'outbox batch relayed')
    return relayed
  }

  private async markFailed(eventId: string, error: string): Promise<void> {
    await this.db.$transaction(async (tx) => requeueOutboxEvent(tx as never, eventId, error))
  }

  async stop(): Promise<void> {
    this.running = false
    await Promise.all([...this.queues.values()].map((queue) => queue.close()))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
