import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../../common/auth/principal.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'

/**
 * The API-side half of the workflow engine.
 *
 * It does not execute anything itself — execution is the worker's job. It owns
 * the *control plane*: saving a versioned graph, creating a `WorkflowRun` and
 * enqueueing it, firing event-triggered workflows, and pause/resume/retry. The
 * heavy, retryable, side-effecting execution happens out-of-process in the
 * BullMQ worker, so a slow or failing run never touches request latency.
 */
@Injectable()
export class WorkflowEngineService {
  private readonly queue: Queue
  private readonly connection: Redis

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {
    const env = loadEnv()
    this.connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    // Same queue name the worker consumes.
    this.queue = new Queue('workflow-execution', { connection: this.connection })
  }

  /** Saves a new version of a workflow's graph and points the workflow at it. */
  async saveGraph(
    principal: Principal,
    workflowId: string,
    graph: unknown,
  ): Promise<{ version: number }> {
    return withTenantTransaction(this.db, async (tx) => {
      const wf = await tx.workflow.findFirst({ where: { id: workflowId, deletedAt: null } })
      if (!wf) throw new NotFoundException('Workflow not found')
      const latest = await tx.workflowVersion.findFirst({
        where: { workflowId },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const version = (latest?.version ?? 0) + 1
      await tx.workflowVersion.create({ data: { workflowId, version, graph: graph as never } })
      await tx.workflow.updateMany({ where: { id: workflowId }, data: { activeVersion: version } })
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'workflow.version_saved',
          resourceType: 'workflow',
          resourceId: workflowId,
          after: { version },
        },
      })
      return { version }
    })
  }

  /** Creates a run for a workflow's active version and enqueues it. */
  async trigger(
    principal: Principal,
    workflowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<{ runId: string }> {
    const runId = await withTenantTransaction(this.db, async (tx) => {
      const wf = await tx.workflow.findFirst({ where: { id: workflowId, deletedAt: null } })
      if (!wf) throw new NotFoundException('Workflow not found')
      const version = await tx.workflowVersion.findFirst({
        where: { workflowId, version: wf.activeVersion },
      })
      if (!version) throw new NotFoundException('Workflow has no saved version to run')

      const run = await tx.workflowRun.create({
        data: {
          organizationId: principal.organizationId,
          workflowId,
          versionId: version.id,
          status: 'PENDING',
          triggeredBy: 'USER',
          triggerPayload: payload as never,
          context: { trigger: payload } as never,
        },
      })
      await tx.workflow.updateMany({
        where: { id: workflowId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      })
      return run.id
    })

    await this.enqueue(
      principal.organizationId,
      runId,
      principal.type === 'user' ? principal.id : undefined,
    )
    return { runId }
  }

  /**
   * Fires all ACTIVE workflows whose trigger matches an event. Called from the
   * places domain events happen (e.g. an asset is approved), so the engine reacts
   * to the product rather than only to manual runs.
   */
  async fireEvent(
    principal: Principal,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const matches = await withTenantTransaction(this.db, (tx) =>
      tx.workflow.findMany({
        where: { deletedAt: null, status: 'ACTIVE', triggerType: event },
        select: { id: true },
      }),
    )
    for (const wf of matches) {
      try {
        await this.trigger(principal, wf.id, { event, ...payload })
      } catch (err) {
        this.logger.warn({ err, workflowId: wf.id, event }, 'event trigger failed for workflow')
      }
    }
    return matches.length
  }

  /**
   * Like {@link fireEvent} but keyed by organisation id rather than a Principal —
   * for event sources with no authenticated user, such as an anonymous visitor
   * submitting a public lead-capture form. The organisation is trusted because it
   * was resolved server-side from the form's own record, never from the request.
   */
  async fireEventForOrg(
    organizationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const context = { organizationId }
    const matches = await withTenantTransaction(
      this.db,
      (tx) =>
        tx.workflow.findMany({
          where: { deletedAt: null, status: 'ACTIVE', triggerType: event },
          select: { id: true },
        }),
      context,
    )
    for (const wf of matches) {
      try {
        const runId = await withTenantTransaction(
          this.db,
          async (tx) => {
            const workflow = await tx.workflow.findFirst({ where: { id: wf.id, deletedAt: null } })
            if (!workflow) throw new NotFoundException('Workflow not found')
            const version = await tx.workflowVersion.findFirst({
              where: { workflowId: wf.id, version: workflow.activeVersion },
            })
            if (!version) throw new NotFoundException('Workflow has no saved version to run')
            const run = await tx.workflowRun.create({
              data: {
                organizationId,
                workflowId: wf.id,
                versionId: version.id,
                status: 'PENDING',
                triggeredBy: 'SYSTEM',
                triggerPayload: { event, ...payload } as never,
                context: { trigger: { event, ...payload } } as never,
              },
            })
            await tx.workflow.updateMany({
              where: { id: wf.id },
              data: { runCount: { increment: 1 }, lastRunAt: new Date() },
            })
            return run.id
          },
          context,
        )
        await this.enqueue(organizationId, runId)
      } catch (err) {
        this.logger.warn({ err, workflowId: wf.id, event }, 'org event trigger failed for workflow')
      }
    }
    return matches.length
  }

  /** Re-enqueues a failed run, resuming from the first failed node. */
  async retry(principal: Principal, runId: string): Promise<{ ok: true }> {
    const resumeNodeId = await withTenantTransaction(this.db, async (tx) => {
      const run = await tx.workflowRun.findFirst({ where: { id: runId } })
      if (!run) throw new NotFoundException('Run not found')
      const failed = await tx.workflowRunStep.findFirst({
        where: { runId, status: 'FAILED' },
        orderBy: { position: 'asc' },
        select: { nodeId: true },
      })
      await tx.workflowRun.updateMany({
        where: { id: runId },
        data: { status: 'PENDING', error: null },
      })
      return failed?.nodeId
    })
    await this.enqueue(
      principal.organizationId,
      runId,
      principal.type === 'user' ? principal.id : undefined,
      resumeNodeId ?? undefined,
    )
    return { ok: true }
  }

  private async enqueue(
    organizationId: string,
    runId: string,
    userId?: string,
    resumeNodeId?: string,
  ): Promise<void> {
    await this.queue.add('run', {
      organizationId,
      runId,
      ...(userId ? { userId } : {}),
      ...(resumeNodeId ? { resumeNodeId } : {}),
    })
  }

  async disconnect(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}
