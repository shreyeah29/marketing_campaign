import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Paginated } from '@vsp/contracts'
import { publishEvent, withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Companies, leads and deals.
 *
 * Grouped in one file because they share the CRM domain and the same slice
 * shape — keyset list, scoped read, transactional write with an audit entry. The
 * pattern is identical to `contacts.controller.ts`; only the fields differ.
 */

// ── Companies ────────────────────────────────────────────────────────────────

const createCompanySchema = z
  .object({
    name: z.string().min(1).max(200),
    domain: z.string().max(200).optional(),
    industry: z.string().max(200).optional(),
    size: z.string().max(50).optional(),
  })
  .strict()

@ApiTags('CRM')
@Controller('companies')
export class CompaniesController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List companies' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await this.db.company.findMany({
      where: { deletedAt: null, ...keysetWhere(cursor) },
      orderBy: KEYSET_ORDER,
      take: limit + 1,
    })
    return toPage(rows, limit, (c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      createdAt: c.createdAt.toISOString(),
    }))
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a company' })
  async create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    const input = zodBody(createCompanySchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const company = await tx.company.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name,
          domain: input.domain ?? null,
          industry: input.industry ?? null,
          size: input.size ?? null,
        },
      })
      return { id: company.id }
    })
  }
}

// ── Leads ────────────────────────────────────────────────────────────────────

const createLeadSchema = z
  .object({
    contactId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    source: z.string().max(200).optional(),
    value: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  })
  .strict()

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NURTURING',
  'UNQUALIFIED',
  'CONVERTED',
] as const

const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) }).strict()

@ApiTags('CRM')
@Controller('leads')
export class LeadsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List leads' })
  async list(
    @Query('status') status: string | undefined,
    @Query() query: unknown,
  ): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const validStatus = (LEAD_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as (typeof LEAD_STATUSES)[number])
      : undefined

    const rows = await this.db.lead.findMany({
      where: {
        deletedAt: null,
        ...(validStatus === undefined ? {} : { status: validStatus }),
        ...keysetWhere(cursor),
      },
      orderBy: KEYSET_ORDER,
      take: limit + 1,
    })
    return toPage(rows, limit, (l) => ({
      id: l.id,
      status: l.status,
      score: l.score,
      source: l.source,
      value: l.value?.toString() ?? null,
      qualificationReason: l.qualificationReason,
      createdAt: l.createdAt.toISOString(),
    }))
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a lead' })
  async create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    const input = zodBody(createLeadSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId: principal.organizationId,
          contactId: input.contactId ?? null,
          companyId: input.companyId ?? null,
          ownerId: principal.type === 'user' ? principal.id : null,
          source: input.source ?? null,
          value: input.value ?? null,
        },
      })
      await publishEvent(
        tx,
        'crm.lead.created.v1',
        {
          leadId: lead.id,
          contactId: input.contactId ?? null,
          source: input.source ?? null,
          campaignId: null,
        },
        { aggregateType: 'Lead', aggregateId: lead.id },
      )
      return { id: lead.id }
    })
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Change a lead status' })
  async updateStatus(@Param('id') id: string, @Body() body: unknown): Promise<{ ok: true }> {
    const { status } = zodBody(updateLeadStatusSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.lead.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException('Lead not found')

      await tx.lead.updateMany({
        where: { id },
        data: {
          status,
          ...(status === 'CONVERTED' ? { convertedAt: new Date() } : {}),
        },
      })

      // The status change is a domain event, not just a column write: nurture
      // automations and analytics both react to it.
      await publishEvent(
        tx,
        'crm.lead.status_changed.v1',
        { leadId: id, from: before.status, to: status },
        { aggregateType: 'Lead', aggregateId: id },
      )
      return { ok: true }
    })
  }
}

// ── Deals ────────────────────────────────────────────────────────────────────

const createDealSchema = z
  .object({
    pipelineId: z.string().uuid(),
    stageId: z.string().uuid(),
    title: z.string().min(1).max(200),
    value: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    contactId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
  })
  .strict()

@ApiTags('CRM')
@Controller('deals')
export class DealsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List deals' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await this.db.deal.findMany({
      where: { deletedAt: null, ...keysetWhere(cursor) },
      orderBy: KEYSET_ORDER,
      take: limit + 1,
    })
    return toPage(rows, limit, (d) => ({
      id: d.id,
      title: d.title,
      value: d.value.toString(),
      currency: d.currency,
      status: d.status,
      stageId: d.stageId,
      probability: d.probability,
      createdAt: d.createdAt.toISOString(),
    }))
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a deal' })
  async create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    const input = zodBody(createDealSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      // The stage must belong to the named pipeline. Without this check a client
      // could pair any stage id with any pipeline id and produce an inconsistent
      // deal that renders in no column of the board.
      const stage = await tx.pipelineStage.findFirst({
        where: { id: input.stageId, pipelineId: input.pipelineId },
        select: { id: true, probability: true },
      })
      if (!stage) throw new NotFoundException('Stage not found in the given pipeline')

      const deal = await tx.deal.create({
        data: {
          organizationId: principal.organizationId,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          title: input.title,
          value: input.value ?? '0',
          probability: stage.probability,
          contactId: input.contactId ?? null,
          companyId: input.companyId ?? null,
          ownerId: principal.type === 'user' ? principal.id : null,
        },
      })
      return { id: deal.id }
    })
  }
}
