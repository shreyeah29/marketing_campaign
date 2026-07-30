import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'

import {
  assertRowLevelSecurityEnforced,
  createAdminClient,
  createDatabaseClient,
  withTenant,
  type DatabaseClient,
} from '@vsp/database'
import { createLogger, withLogContext, type AppLogger } from '@vsp/observability'

import { loadWorkerEnv } from './config.js'
import { createEmbeddingsHandler } from './embeddings/indexer.js'
import { OutboxDispatcher } from './outbox-dispatcher.js'
import { deadLetterQueue, QUEUE_POLICIES, QUEUES, type QueuePolicy, type TenantJobData } from './queues.js'
import { SchedulePoller } from './schedule-poller.js'
import { createWorkflowHandler } from './workflow/executor.js'

/**
 * Worker process.
 *
 * A separate process from the API, not a background thread inside it. Three
 * reasons, all of which show up in production:
 *
 *   · Agent runs are CPU- and IO-heavy and would compete with request handling,
 *     so a busy queue would degrade every user's latency.
 *   · They scale on different axes: the API scales with concurrent users, the
 *     workers with queued work.
 *   · A crash in a job handler must not take down the API.
 *
 * The same preflight guard applies: if this connection is not subject to
 * row-level security, the process refuses to start. A worker with a superuser
 * connection would be a hole in tenant isolation that no API-side check catches.
 */

async function runPreflight(databaseUrl: string, logger: AppLogger): Promise<void> {
  const probe = createAdminClient(databaseUrl)
  try {
    await assertRowLevelSecurityEnforced(probe)
    logger.info('row-level security enforced for the worker connection')
  } finally {
    await probe.$disconnect()
  }
}

/**
 * Moves an exhausted job onto its dead-letter queue.
 *
 * BullMQ's own failed set is enough to *see* a failure but not to act on one.
 * An explicit DLQ makes exhausted work alertable, replayable after a fix, and
 * drainable on purpose — and it stops a poisoned job from being retried forever
 * against capacity other tenants are waiting for.
 */
function attachDeadLetter(
  worker: Worker,
  policy: QueuePolicy,
  redis: Redis,
  logger: AppLogger,
): void {
  const dlq = new Queue(deadLetterQueue(policy.name), { connection: redis })

  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job) return

    const attemptsMade = job.attemptsMade
    const maxAttempts = policy.jobOptions.attempts ?? 1
    const exhausted = attemptsMade >= maxAttempts

    const context = {
      queue: policy.name,
      jobId: job.id,
      jobName: job.name,
      attemptsMade,
      maxAttempts,
      organizationId: (job.data as TenantJobData | undefined)?.organizationId,
      err: error,
    }

    if (!exhausted) {
      logger.warn(context, 'job failed; will retry')
      return
    }

    logger.error(context, 'job exhausted its attempts; dead-lettering')

    void dlq
      .add(
        job.name,
        {
          originalQueue: policy.name,
          originalJobId: job.id,
          data: job.data,
          failedReason: error.message,
          attemptsMade,
          deadLetteredAt: new Date().toISOString(),
        },
        // Never retried automatically. A DLQ that retries is just another queue,
        // and the point is to stop and require a decision.
        { attempts: 1, removeOnComplete: false, removeOnFail: false },
      )
      .catch((dlqError: unknown) => {
        // If even the DLQ write fails there is nowhere left to put it, so log
        // loudly with the full payload — this is the last chance to preserve it.
        logger.error(
          { ...context, dlqError, payload: job.data },
          'FAILED TO DEAD-LETTER: job payload preserved in this log line only',
        )
      })
  })
}

/**
 * Job handler signature.
 *
 * Every handler receives a tenant-scoped client, because the context is opened
 * from the job payload before the handler runs. A handler therefore cannot query
 * across tenants even by mistake.
 */
export type JobHandler = (job: Job, db: DatabaseClient, logger: AppLogger) => Promise<void>

/**
 * Placeholder handler.
 *
 * Acknowledges and logs. Real handlers land with their modules — deliberately not
 * stubbed out with fake side effects, because a handler that pretends to send an
 * email is worse than one that plainly does nothing.
 */
const acknowledge: JobHandler = async (job, _db, logger) => {
  logger.info(
    { jobId: job.id, jobName: job.name, queue: job.queueName },
    'job acknowledged (handler not yet implemented for this queue)',
  )
  await Promise.resolve()
}

function createWorker(
  policy: QueuePolicy,
  redis: Redis,
  db: DatabaseClient,
  logger: AppLogger,
  handler: JobHandler,
): Worker {
  const worker = new Worker(
    policy.name,
    async (job: Job) => {
      const data = job.data as TenantJobData | undefined
      const organizationId = data?.organizationId

      const jobLogger = withLogContext(logger, {
        ...(organizationId === undefined ? {} : { organizationId }),
        ...(data?.requestId === undefined ? {} : { requestId: data.requestId }),
      })

      // Without a tenant, a handler could only do platform work. Refusing is
      // safer than running unscoped: the payload is malformed, and guessing at
      // the tenant is how cross-tenant writes happen.
      if (organizationId === undefined) {
        throw new Error(
          `Job ${String(job.id)} on ${policy.name} has no organizationId. Every job payload must ` +
            'carry its tenant so the worker can scope its queries.',
        )
      }

      await withTenant({ organizationId, ...(data?.userId === undefined ? {} : { userId: data.userId }) }, () =>
        handler(job, db, jobLogger),
      )
    },
    {
      connection: redis,
      concurrency: policy.concurrency,
      // Reclaim jobs whose worker died mid-processing. Without this, a job held
      // by a crashed pod is stalled forever and the work silently never happens.
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  )

  attachDeadLetter(worker, policy, redis, logger)

  worker.on('error', (error: Error) => {
    logger.error({ queue: policy.name, err: error }, 'worker error')
  })

  return worker
}

async function bootstrap(): Promise<void> {
  const env = loadWorkerEnv()

  const logger = createLogger({
    service: 'worker',
    environment: env.NODE_ENV,
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  })

  await runPreflight(env.DATABASE_URL, logger)

  // Handler work: tenant-scoped, RLS applies.
  const db = createDatabaseClient({ url: env.DATABASE_URL })

  // Outbox claim/requeue only. See the DIRECT_DATABASE_URL note in config.ts for
  // why the dispatcher cannot use the application role.
  const dispatcherDb = createAdminClient(env.DIRECT_DATABASE_URL)

  // BullMQ needs its own connection settings: it blocks on long reads, and a
  // retry ceiling makes ioredis abort them, silently stopping consumption.
  const bullRedis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  // Producer for the workflow queue, so a `delay` node can enqueue its own
  // delayed continuation (the mechanism that makes waits real).
  const workflowQueue = new Queue(QUEUES.WORKFLOW_EXECUTION, { connection: bullRedis })
  const workflowHandler = createWorkflowHandler(workflowQueue)
  const embeddingsHandler = createEmbeddingsHandler(env)

  // Each queue gets its handler. Queues without a real handler acknowledge (never
  // with fake side effects) until their module lands.
  const handlerFor = (policy: QueuePolicy): JobHandler => {
    if (policy.name === QUEUES.WORKFLOW_EXECUTION) return workflowHandler
    if (policy.name === QUEUES.EMBEDDINGS) return embeddingsHandler
    return acknowledge
  }

  const workers = QUEUE_POLICIES.map((policy) =>
    createWorker(policy, bullRedis, db, logger, handlerFor(policy)),
  )

  logger.info(
    {
      queues: QUEUE_POLICIES.map((p) => ({ name: p.name, concurrency: p.concurrency })),
    },
    `worker started with ${String(workers.length)} queues`,
  )

  const dispatcher = new OutboxDispatcher(dispatcherDb, bullRedis, logger)
  void dispatcher.start()

  // Time-driven delivery: queued email sends and due social posts. Owner
  // connection for the same reason as the dispatcher — it must see due rows
  // across tenants. Reuses dispatcherDb (both are cross-tenant platform infra).
  const schedulePoller = new SchedulePoller(dispatcherDb, env, logger)
  schedulePoller.start()

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down worker')

    // Order matters: stop claiming new work, let in-flight jobs finish, then
    // close connections. Closing Redis first would abandon running jobs, and
    // BullMQ would only reclaim them after the stalled interval.
    await dispatcher.stop()
    await schedulePoller.stop()
    await Promise.all(workers.map((worker) => worker.close()))
    await bullRedis.quit()
    await db.$disconnect()
    await dispatcherDb.$disconnect()

    logger.info('worker stopped cleanly')
    process.exit(0)
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Worker failed to start:', error)
  process.exit(1)
})
