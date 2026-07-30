import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

import { WorkflowEngineService } from './workflow-engine.service.js'

// The graph is validated loosely at the boundary; the worker validates structure
// on execution. This keeps the builder free to save work-in-progress graphs.
const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['action', 'delay', 'condition']),
  label: z.string().optional(),
  action: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  delayMs: z.number().int().nonnegative().optional(),
  condition: z
    .object({ left: z.string(), op: z.enum(['eq', 'ne', 'gt', 'lt', 'contains', 'truthy']), right: z.unknown().optional() })
    .optional(),
  next: z.string().nullish(),
  onTrue: z.string().nullish(),
  onFalse: z.string().nullish(),
})
const graphSchema = z.object({ start: z.string(), nodes: z.array(nodeSchema) }).strict()
const runSchema = z.object({ payload: z.record(z.unknown()).optional() }).strict()

@ApiTags('Automation')
@RequiresFeature('automation.workflows')
@Controller('workflows')
export class WorkflowEngineController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(WorkflowEngineService) private readonly engine: WorkflowEngineService,
  ) {}

  @Get(':id/graph')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: "The workflow's active-version graph" })
  async getGraph(@Param('id') id: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const wf = await tx.workflow.findFirst({ where: { id, deletedAt: null } })
      if (!wf) throw new NotFoundException('Workflow not found')
      const version = await tx.workflowVersion.findFirst({ where: { workflowId: id, version: wf.activeVersion } })
      return { workflow: { id: wf.id, name: wf.name, status: wf.status, triggerType: wf.triggerType, activeVersion: wf.activeVersion }, graph: version?.graph ?? { start: '', nodes: [] } }
    })
  }

  @Put(':id/graph')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Save a new version of the workflow graph' })
  async saveGraph(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const graph = zodBody(graphSchema, body)
    return this.engine.saveGraph(p, id, graph)
  }

  @Post(':id/run')
  @RequirePermissions(PERMISSIONS.AUTOMATION_ACTIVATE)
  @ApiOperation({ summary: 'Trigger a workflow run now' })
  async run(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const { payload } = zodBody(runSchema, body)
    return this.engine.trigger(p, id, payload ?? {})
  }

  @Post(':id/pause')
  @RequirePermissions(PERMISSIONS.AUTOMATION_ACTIVATE)
  async pause(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<{ ok: true }> {
    return this.setStatus(id, 'PAUSED', p)
  }

  @Post(':id/resume')
  @RequirePermissions(PERMISSIONS.AUTOMATION_ACTIVATE)
  async resume(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<{ ok: true }> {
    return this.setStatus(id, 'ACTIVE', p)
  }

  @Get(':id/runs')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'Execution history for a workflow' })
  async runs(@Param('id') id: string): Promise<unknown> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.workflowRun.findMany({
        where: { workflowId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, status: true, triggeredBy: true, error: true, startedAt: true, completedAt: true, durationMs: true, createdAt: true },
      }),
    )
    return { data: rows }
  }

  private async setStatus(id: string, status: string, p: Principal): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const wf = await tx.workflow.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
      if (!wf) throw new NotFoundException('Workflow not found')
      await tx.workflow.updateMany({ where: { id }, data: { status: status as never } })
      await tx.auditLog.create({
        data: {
          organizationId: p.organizationId,
          actorType: 'USER',
          userId: p.type === 'user' ? p.id : null,
          action: `workflow.${status.toLowerCase()}`,
          resourceType: 'workflow',
          resourceId: id,
        },
      })
    })
    return { ok: true }
  }
}

/** Run-level operations: the execution log and retry. */
@ApiTags('Automation')
@RequiresFeature('automation.workflows')
@Controller('workflow-runs')
export class WorkflowRunsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(WorkflowEngineService) private readonly engine: WorkflowEngineService,
  ) {}

  @Get(':runId')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'Run detail with its step-by-step execution log' })
  async detail(@Param('runId') runId: string): Promise<unknown> {
    const run = await withTenantTransaction(this.db, (tx) =>
      tx.workflowRun.findFirst({
        where: { id: runId },
        include: { steps: { orderBy: { position: 'asc' } } },
      }),
    )
    if (!run) throw new NotFoundException('Run not found')
    return run
  }

  @Post(':runId/retry')
  @RequirePermissions(PERMISSIONS.AUTOMATION_ACTIVATE)
  @ApiOperation({ summary: 'Retry a failed run from the failed node' })
  async retry(@Param('runId') runId: string, @CurrentPrincipal() p: Principal): Promise<unknown> {
    return this.engine.retry(p, runId)
  }
}
