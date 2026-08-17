import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { AGENT_IDS, isAgentId } from '@marketing-os/ai-core'
import type { Paginated } from '@marketing-os/contracts'
import { publishEvent, withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const startRunSchema = z
  .object({
    agentId: z.enum(AGENT_IDS),
    goal: z.string().min(1).max(4000),
    input: z.record(z.unknown()).optional(),
  })
  .strict()

/**
 * Agent runs — the AI orchestration surface.
 *
 * Starting a run does not execute anything inline. The request records a PENDING
 * run and emits `agents.run.started.v1`, which the worker picks up. This is the
 * whole reason the run is durable: an agent run can take minutes and cost money,
 * and an HTTP request must not hold a connection open for its lifetime — nor lose
 * the run if the API restarts mid-flight.
 *
 * The run is attributed to the initiating user, and every tool it later calls is
 * authorised against that user's permissions. Starting a run therefore requires
 * `agents:run`; a viewer cannot set an agent in motion.
 */
@ApiTags('Agents')
@RequiresFeature('ai.chat')
@Controller('agent-runs')
export class AgentRunsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'List agent runs' })
  async list(
    @Query('agentId') agentId: string | undefined,
    @Query() query: unknown,
  ): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.agentRun.findMany({
        where: {
          ...(agentId !== undefined && isAgentId(agentId) ? { agentId } : {}),
          ...keysetWhere(cursor),
        },
        orderBy: KEYSET_ORDER,
        take: limit + 1,
      }),
    )
    return toPage(rows, limit, (r) => ({
      id: r.id,
      agentId: r.agentId,
      status: r.status,
      goal: r.goal,
      parentRunId: r.parentRunId,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }))
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Retrieve a run with its step and tool-call ledger' })
  async findOne(@Param('id') id: string): Promise<unknown> {
    const run = await withTenantTransaction(this.db, (tx) =>
      tx.agentRun.findFirst({
        where: { id },
        include: {
          steps: { orderBy: { position: 'asc' } },
          toolCalls: { orderBy: { createdAt: 'asc' } },
        },
      }),
    )
    if (!run) throw new NotFoundException('Agent run not found')

    return {
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      goal: run.goal,
      plan: run.plan,
      result: run.result,
      error: run.error,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      // The full audit surface of an AI action: each step and each tool call,
      // including the permission that was checked before it ran.
      steps: run.steps.map((s) => ({
        position: s.position,
        type: s.type,
        status: s.status,
        title: s.title,
        requiresApproval: s.requiresApproval,
      })),
      toolCalls: run.toolCalls.map((t) => ({
        toolName: t.toolName,
        status: t.status,
        permissionChecked: t.permissionChecked,
        deniedReason: t.deniedReason,
      })),
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    }
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Start an agent run' })
  async start(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string; status: string }> {
    const input = zodBody(startRunSchema, body)

    return withTenantTransaction(this.db, async (tx) => {
      const run = await tx.agentRun.create({
        data: {
          organizationId: principal.organizationId,
          agentId: input.agentId,
          status: 'PENDING',
          goal: input.goal,
          input: (input.input ?? {}) as never,
          initiatedBy: principal.type === 'user' ? 'USER' : 'API_KEY',
          initiatedByUserId: principal.type === 'user' ? principal.id : null,
        },
      })

      // The worker executes the run. The event carries only ids; the worker
      // loads the run and opens the initiating user's authorisation context.
      await publishEvent(
        tx,
        'agents.run.started.v1',
        { runId: run.id, agentId: input.agentId, goal: input.goal, parentRunId: null },
        { aggregateType: 'AgentRun', aggregateId: run.id },
      )

      return { id: run.id, status: run.status }
    })
  }

  @Post(':id/approve')
  // Approving a paused run is a distinct authority from running one: it is the
  // human in the loop for a mutating action the tenant chose to gate.
  @RequirePermissions(PERMISSIONS.AGENTS_APPROVE)
  @ApiOperation({ summary: 'Approve a run waiting at an approval gate' })
  async approve(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const step = await tx.agentRunStep.findFirst({
        where: { runId: id, requiresApproval: true, approvedAt: null },
        orderBy: { position: 'asc' },
      })
      if (!step) throw new NotFoundException('No pending approval for this run')

      await tx.agentRunStep.updateMany({
        where: { id: step.id },
        data: { approvedAt: new Date(), approvedById: principal.id },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'agent_run.approved',
          resourceType: 'agent_run',
          resourceId: id,
        },
      })

      return { ok: true }
    })
  }
}
