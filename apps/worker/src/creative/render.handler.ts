import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'
import {
  findTemplate,
  renderCreative,
  resolveImages,
  type AspectRatio,
  type CreativeData,
} from '@marketing-os/creative-engine'

import type { WorkerEnv } from '../config.js'

import { putObject } from './storage.js'

/**
 * Rendering one creative, off the request path.
 *
 * A fifty-product campaign is fifty of these. Each is CPU-bound and cheap —
 * roughly 200ms — so the queue runs them eight at a time and a batch finishes in
 * seconds rather than the minutes an AI generation would take. That gap is the
 * entire argument for separating the generated visual from the composed poster.
 *
 * Two properties make retries free, which is why this queue is allowed five
 * attempts where the model-backed queues get two:
 *
 *   · **Deterministic.** The same inputs produce the same bytes at the same
 *     storage key, so a replay overwrites itself with an identical object.
 *   · **Idempotent by hash.** A creative whose stored render already matches is
 *     recognised and skipped before anything is uploaded.
 *
 * Every database call goes through `withTenantTransaction` with the job's own
 * organisation id. The worker could use the owner connection, as the pollers do
 * — but a queue job carries its tenant with it, so there is no reason to switch
 * off row-level security to do this work.
 */

export interface RenderJob {
  readonly creativeId: string
  readonly organizationId: string
}

/** A guard rather than a cast: a malformed job must fail loudly and once. */
function isRenderJob(data: unknown): data is RenderJob {
  const d = data as Partial<RenderJob> | null
  return typeof d?.creativeId === 'string' && typeof d.organizationId === 'string'
}

export function createCreativeRenderHandler(
  env: WorkerEnv,
  db: DatabaseClient,
  logger: AppLogger,
): (data: unknown) => Promise<void> {
  return async (data: unknown): Promise<void> => {
    if (!isRenderJob(data)) throw new Error('creative-render job is missing ids')
    const { creativeId, organizationId } = data
    const ctx = { organizationId }

    const creative = await withTenantTransaction(
      db,
      (tx) => tx.creative.findFirst({ where: { id: creativeId, deletedAt: null } }),
      ctx,
    )

    // Deleted between enqueue and execution. Not an error, but the batch counter
    // still advances — otherwise one cancelled item leaves progress stuck at
    // 49/50 forever.
    if (!creative) {
      await settle(db, ctx, null, 'completed')
      return
    }

    const template = findTemplate(creative.templateSlug)
    if (!template) {
      await markFailed(
        db,
        ctx,
        creative.id,
        creative.batchId,
        `Unknown template "${creative.templateSlug}"`,
      )
      return
    }

    try {
      await withTenantTransaction(
        db,
        (tx) =>
          tx.creative.updateMany({
            where: { id: creative.id },
            data: { status: 'RENDERING', failureReason: null },
          }),
        ctx,
      )

      // `content` is the snapshot frozen when the creative was created. Nothing
      // here re-reads the product: the price on an approved poster must not
      // change because someone edited the catalogue afterwards.
      const snapshot = creative.content as CreativeData

      // Image fetching and rendering both happen outside any transaction.
      // Holding a connection open across eight concurrent renders would starve
      // the pool for the sake of work that touches no rows.
      const resolved = await resolveImages(snapshot)
      const result = await renderCreative(
        template.document,
        resolved,
        creative.aspectRatio as AspectRatio,
      )

      if (creative.renderHash === result.hash && creative.renderedUrl) {
        await withTenantTransaction(
          db,
          (tx) => tx.creative.updateMany({ where: { id: creative.id }, data: { status: 'READY' } }),
          ctx,
        )
        await settle(db, ctx, creative.batchId, 'completed')
        return
      }

      const stored = await putObject(
        env,
        new Uint8Array(result.png),
        'image/png',
        `${organizationId}/creatives/${creative.id}/${result.hash}`,
      )

      await withTenantTransaction(
        db,
        (tx) =>
          tx.creative.updateMany({
            where: { id: creative.id },
            data: { status: 'READY', renderedUrl: stored.url, renderHash: result.hash },
          }),
        ctx,
      )
      await settle(db, ctx, creative.batchId, 'completed')

      logger.info({ creativeId: creative.id, organizationId }, 'creative rendered')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await markFailed(db, ctx, creative.id, creative.batchId, message)
      // Rethrown so BullMQ records the attempt and applies its backoff. The row
      // already carries the reason, so a job that exhausts its retries leaves an
      // explanation on the creative rather than only in a dead-letter queue.
      throw err
    }
  }
}

async function markFailed(
  db: DatabaseClient,
  ctx: { organizationId: string },
  creativeId: string,
  batchId: string | null,
  reason: string,
): Promise<void> {
  await withTenantTransaction(
    db,
    (tx) =>
      tx.creative.updateMany({
        where: { id: creativeId },
        data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
      }),
    ctx,
  ).catch(() => undefined)
  await settle(db, ctx, batchId, 'failed')
}

/**
 * Advance a batch's counters, and close it once everything has landed.
 *
 * `increment` rather than read-modify-write: eight workers finish concurrently,
 * and counting in application code would lose updates and leave a batch that
 * never reaches its total.
 */
async function settle(
  db: DatabaseClient,
  ctx: { organizationId: string },
  batchId: string | null,
  outcome: 'completed' | 'failed',
): Promise<void> {
  if (!batchId) return

  await withTenantTransaction(
    db,
    async (tx) => {
      await tx.batchJob.updateMany({
        where: { id: batchId },
        data:
          outcome === 'completed' ? { completed: { increment: 1 } } : { failed: { increment: 1 } },
      })

      const batch = await tx.batchJob.findFirst({ where: { id: batchId } })
      if (!batch || batch.completed + batch.failed < batch.total) return

      await tx.batchJob.updateMany({
        where: { id: batchId },
        data: {
          // A batch where everything failed is a failed batch. A batch where
          // some succeeded still produced posters, and calling that failed
          // would hide them.
          status: batch.completed > 0 ? 'COMPLETED' : 'FAILED',
          finishedAt: new Date(),
        },
      })
    },
    ctx,
  ).catch(() => undefined)
}
