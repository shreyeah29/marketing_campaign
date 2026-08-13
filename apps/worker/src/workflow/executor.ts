import type { Job, Queue } from 'bullmq'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

/**
 * The workflow execution engine.
 *
 * This is a real orchestrator, not a CRUD editor: it walks a versioned node graph,
 * runs each node's action for real, branches on conditions, and implements delays
 * by re-enqueueing the run with a BullMQ delay rather than blocking a worker. Every
 * node writes a `WorkflowRunStep` (the execution log), and the run tracks the set of
 * completed node ids so a BullMQ retry resumes at the failed node instead of
 * repeating side effects. Exhausted runs dead-letter through the shared DLQ.
 *
 * All database work runs inside `withTenantTransaction`: the worker opens the
 * AsyncLocalStorage tenant context from the job payload, but only the transaction
 * sets the `app.organization_id` variable that row-level security reads.
 */

export interface WfNode {
  readonly id: string
  readonly type: 'action' | 'delay' | 'condition'
  readonly label?: string
  readonly action?: string
  readonly config?: Record<string, unknown>
  readonly delayMs?: number
  readonly condition?: {
    left: string
    op: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'truthy'
    right?: unknown
  }
  readonly next?: string | null
  readonly onTrue?: string | null
  readonly onFalse?: string | null
}

export interface WfGraph {
  readonly start: string
  readonly nodes: WfNode[]
}

export interface WorkflowJobData {
  readonly organizationId: string
  readonly userId?: string
  readonly runId: string
  /** Node to resume from (a delay continuation); otherwise the graph start. */
  readonly resumeNodeId?: string
}

interface RunContext {
  [key: string]: unknown
  _done?: string[]
}

/**
 * Builds the WORKFLOW_EXECUTION job handler.
 *
 * Needs the queue itself so a `delay` node can enqueue its own delayed
 * continuation — the mechanism that makes waits real without holding a worker.
 */
export function createWorkflowHandler(queue: Queue) {
  return async function handle(job: Job, db: DatabaseClient, logger: AppLogger): Promise<void> {
    const { runId, resumeNodeId } = job.data as WorkflowJobData

    // Load the run + its versioned graph, and check the workflow is not paused.
    const loaded = await withTenantTransaction(db, async (tx) => {
      const run = await tx.workflowRun.findFirst({
        where: { id: runId },
        include: { version: true, workflow: { select: { status: true } } },
      })
      if (!run) return null
      return run
    })
    if (!loaded) {
      logger.warn({ runId }, 'workflow run not found; skipping')
      return
    }
    if (loaded.status === 'CANCELED') {
      logger.info({ runId }, 'run canceled; skipping')
      return
    }
    if (loaded.workflow.status === 'PAUSED') {
      await this_setStatus(db, runId, 'WAITING')
      logger.info({ runId }, 'workflow paused; run left WAITING')
      return
    }

    const graph = parseGraph(loaded.version.graph)
    if (!graph) {
      await this_fail(db, runId, 'Invalid workflow graph')
      return
    }

    const context = ((loaded.context as RunContext | null) ?? {}) as RunContext
    const done = new Set(context._done ?? [])

    await withTenantTransaction(db, (tx) =>
      tx.workflowRun.updateMany({
        where: { id: runId },
        data: { status: 'RUNNING', ...(loaded.startedAt ? {} : { startedAt: new Date() }) },
      }),
    )

    let nodeId: string | null | undefined = resumeNodeId ?? graph.start
    let position = await this_stepCount(db, runId)

    // Cycle guard: the `_done` set stops a node re-EXECUTING, but a graph like
    // A→B→A still routes between completed nodes forever. Cap total steps so a
    // cyclic or malicious graph fails the run instead of pinning a worker.
    let steps = 0
    const maxSteps = graph.nodes.length * 4 + 10

    while (nodeId) {
      if (++steps > maxSteps) {
        await this_fail(
          db,
          runId,
          'Workflow exceeded its step limit — the graph likely contains a cycle',
        )
        logger.warn({ runId, maxSteps }, 'workflow aborted: step limit exceeded (cycle?)')
        return
      }
      const node = graph.nodes.find((n) => n.id === nodeId)
      if (!node) break

      // Idempotent resume: a node already completed on a prior attempt is skipped.
      if (done.has(node.id)) {
        nodeId = defaultNext(node, context)
        continue
      }

      const startedAt = Date.now()
      const step = await this_openStep(db, runId, node, position++)

      try {
        if (node.type === 'delay') {
          const delayMs = Math.max(0, Number(node.delayMs ?? 0))
          const resumeAt = new Date(Date.now() + delayMs)
          done.add(node.id)
          context._done = [...done]
          await withTenantTransaction(db, (tx) =>
            tx.workflowRun.updateMany({
              where: { id: runId },
              data: { status: 'WAITING', resumeAt, context: context as never },
            }),
          )
          await this_closeStep(db, step.id, 'SUCCEEDED', { waitedMs: delayMs }, startedAt)
          // Re-enqueue the continuation. The run pauses here until it fires.
          await queue.add(
            'resume',
            {
              organizationId: loaded.organizationId,
              runId,
              ...(node.next ? { resumeNodeId: node.next } : {}),
            } satisfies WorkflowJobData,
            { delay: delayMs },
          )
          logger.info(
            { runId, nodeId: node.id, delayMs },
            'workflow waiting (delayed continuation enqueued)',
          )
          return
        }

        if (node.type === 'condition') {
          const result = evalCondition(node.condition, context)
          done.add(node.id)
          await this_closeStep(db, step.id, 'SUCCEEDED', { result }, startedAt)
          nodeId = result ? node.onTrue : node.onFalse
          continue
        }

        // action
        const action = ACTIONS[node.action ?? '']
        if (!action) throw new Error(`Unknown action "${String(node.action)}"`)
        const output = await action(node.config ?? {}, {
          db,
          organizationId: loaded.organizationId,
          userId: (job.data as WorkflowJobData).userId,
          context,
          logger,
        })
        context[node.id] = output
        done.add(node.id)
        context._done = [...done]
        await withTenantTransaction(db, (tx) =>
          tx.workflowRun.updateMany({ where: { id: runId }, data: { context: context as never } }),
        )
        await this_closeStep(db, step.id, 'SUCCEEDED', output as Record<string, unknown>, startedAt)
        nodeId = node.next
      } catch (err) {
        const message = err instanceof Error ? err.message : 'node failed'
        await this_closeStep(db, step.id, 'FAILED', { error: message }, startedAt)
        // Only declare the RUN failed (status FAILED + failure notification +
        // failureCount) on the LAST attempt. On earlier attempts BullMQ will retry,
        // so marking it FAILED now would flap the status and spam a notification per
        // attempt. Intermediate attempts just persist progress and rethrow.
        const maxAttempts = job.opts.attempts ?? 1
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts
        if (isFinalAttempt) {
          await this_fail(db, runId, `Node ${node.id}: ${message}`)
        }
        // Persist progress so a retry resumes here, then rethrow for BullMQ's
        // retry/backoff. The completed-node set makes that safe.
        context._done = [...done]
        await withTenantTransaction(db, (tx) =>
          tx.workflowRun.updateMany({ where: { id: runId }, data: { context: context as never } }),
        ).catch(() => undefined)
        throw err
      }
    }

    // Reached the end.
    const startedAtMs = loaded.startedAt ? new Date(loaded.startedAt).getTime() : Date.now()
    await withTenantTransaction(db, async (tx) => {
      await tx.workflowRun.updateMany({
        where: { id: runId },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAtMs,
        },
      })
      await tx.workflow.updateMany({
        where: { id: loaded.workflowId },
        data: { runCount: { increment: 0 }, successCount: { increment: 1 }, lastRunAt: new Date() },
      })
    })
    logger.info({ runId }, 'workflow run succeeded')
  }
}

// ── Action registry ────────────────────────────────────────────────────────────

interface ActionCtx {
  db: DatabaseClient
  organizationId: string
  userId?: string | undefined
  context: RunContext
  logger: AppLogger
}
type ActionFn = (config: Record<string, unknown>, ctx: ActionCtx) => Promise<unknown>

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const ACTIONS: Record<string, ActionFn> = {
  /** Persist an in-app notification. */
  send_notification: async (config, ctx) => {
    const title = str(config['title'], 'Workflow notification')
    const created = await withTenantTransaction(ctx.db, (tx) =>
      tx.notification.create({
        data: {
          organizationId: ctx.organizationId,
          ...(ctx.userId ? { userId: ctx.userId } : {}),
          level: (['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(str(config['level']))
            ? config['level']
            : 'INFO') as never,
          title,
          body: str(config['body']) || null,
        },
      }),
    )
    return { notificationId: (created as { id: string }).id }
  },

  /** Create a CRM task. */
  create_task: async (config, ctx) => {
    const created = await withTenantTransaction(ctx.db, (tx) =>
      tx.task.create({
        data: {
          organizationId: ctx.organizationId,
          title: str(config['title'], 'Workflow task'),
          description: str(config['description']) || null,
          ...(ctx.userId ? { createdById: ctx.userId } : {}),
        },
      }),
    )
    return { taskId: (created as { id: string }).id }
  },

  /** Alias used by review workflows. */
  create_review_task: async (config, ctx) =>
    ACTIONS['create_task']!({ title: 'Review generated assets', ...config }, ctx),

  /** POST the run context (or a configured body) to an external URL. */
  send_webhook: async (config, ctx) => {
    const url = str(config['url'])
    if (!url) throw new Error('send_webhook requires a url')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config['body'] ?? { context: ctx.context }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`webhook responded ${String(res.status)}`)
    return { status: res.status }
  },

  /** Assign a lead to a user (owner). */
  assign_lead: async (config, ctx) => {
    const leadId = str(config['leadId'])
    const toUserId = str(config['userId']) || ctx.userId
    if (!leadId || !toUserId) throw new Error('assign_lead requires leadId and userId')
    await withTenantTransaction(ctx.db, (tx) =>
      tx.lead.updateMany({ where: { id: leadId, deletedAt: null }, data: { ownerId: toUserId } }),
    )
    return { leadId, ownerId: toUserId }
  },

  /** Email is delivered by the API's EmailPort; the worker records intent as a notification. */
  send_email: async (config, ctx) =>
    ACTIONS['send_notification']!(
      {
        title: `Email: ${str(config['subject'], 'Message')}`,
        body: str(config['body']),
        level: 'INFO',
      },
      ctx,
    ),

  /** Structural: record a message in the log. */
  log: (config, ctx) => {
    ctx.logger.info({ message: str(config['message']) }, 'workflow log')
    return Promise.resolve({ logged: true })
  },
}

// ── Graph + condition helpers ────────────────────────────────────────────────

function parseGraph(raw: unknown): WfGraph | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Partial<WfGraph>
  if (typeof g.start !== 'string' || !Array.isArray(g.nodes)) return null
  return { start: g.start, nodes: g.nodes as WfNode[] }
}

function defaultNext(node: WfNode, context: RunContext): string | null | undefined {
  if (node.type === 'condition')
    return evalCondition(node.condition, context) ? node.onTrue : node.onFalse
  return node.next
}

function evalCondition(cond: WfNode['condition'], context: RunContext): boolean {
  if (!cond) return true
  const left = resolvePath(cond.left, context)
  switch (cond.op) {
    case 'truthy':
      return Boolean(left)
    case 'eq':
      return left === cond.right
    case 'ne':
      return left !== cond.right
    case 'gt':
      return Number(left) > Number(cond.right)
    case 'lt':
      return Number(left) < Number(cond.right)
    case 'contains':
      return String(left).includes(String(cond.right))
    default:
      return false
  }
}

/** Resolves a dotted path like "trigger.status" against the run context. */
function resolvePath(path: string, context: RunContext): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, context)
}

// ── Small DB helpers (each a short tenant transaction) ─────────────────────────

// `this_`-prefixed to avoid clashing with the action names; they are module-local.
async function this_setStatus(db: DatabaseClient, runId: string, status: string): Promise<void> {
  await withTenantTransaction(db, (tx) =>
    tx.workflowRun.updateMany({ where: { id: runId }, data: { status: status as never } }),
  )
}

async function this_fail(db: DatabaseClient, runId: string, error: string): Promise<void> {
  await withTenantTransaction(db, async (tx) => {
    const run = await tx.workflowRun.findFirst({
      where: { id: runId },
      select: { workflowId: true, organizationId: true, workflow: { select: { name: true } } },
    })
    await tx.workflowRun.updateMany({
      where: { id: runId },
      data: { status: 'FAILED', error, completedAt: new Date() },
    })
    if (run) {
      await tx.workflow.updateMany({
        where: { id: run.workflowId },
        data: { failureCount: { increment: 1 } },
      })
      // Module 9: a failed workflow raises a notification for the team.
      await tx.notification.create({
        data: {
          organizationId: run.organizationId,
          level: 'ERROR',
          title: `Workflow failed: ${run.workflow.name}`,
          body: error,
          actionUrl: `/app/automation/workflows/${run.workflowId}`,
        },
      })
    }
  })
}

async function this_stepCount(db: DatabaseClient, runId: string): Promise<number> {
  return withTenantTransaction(db, (tx) => tx.workflowRunStep.count({ where: { runId } }))
}

async function this_openStep(
  db: DatabaseClient,
  runId: string,
  node: WfNode,
  position: number,
): Promise<{ id: string }> {
  return withTenantTransaction(db, (tx) =>
    tx.workflowRunStep.create({
      data: {
        runId,
        nodeId: node.id,
        position,
        status: 'RUNNING',
        startedAt: new Date(),
        input: { type: node.type, action: node.action ?? null, label: node.label ?? null } as never,
      },
      select: { id: true },
    }),
  ) as Promise<{ id: string }>
}

async function this_closeStep(
  db: DatabaseClient,
  stepId: string,
  status: 'SUCCEEDED' | 'FAILED',
  output: Record<string, unknown>,
  startedAtMs: number,
): Promise<void> {
  await withTenantTransaction(db, (tx) =>
    tx.workflowRunStep.updateMany({
      where: { id: stepId },
      data: {
        status: status as never,
        output: output as never,
        completedAt: new Date(),
        durationMs: Date.now() - startedAtMs,
        attempts: { increment: 1 },
      },
    }),
  )
}
