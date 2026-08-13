import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { cursorPaginationSchema, type Paginated } from '@marketing-os/contracts'
import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const createSchema = z
  .object({
    status: z
      .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'UNQUALIFIED', 'CONVERTED'])
      .optional(),
    score: z.number().int().optional(),
    source: z.string().min(1).optional(),
    medium: z.string().min(1).optional(),
    value: z.number().optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()
const updateSchema = createSchema.partial()

// One drawer, one call: the person and their lead created atomically, so a
// manually-entered lead is never a contact-less orphan.
const manualLeadSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
    source: z.string().min(1).max(60).default('MANUAL'),
    value: z.number().optional(),
    note: z.string().max(2000).optional(),
  })
  .strict()

function readSearch(q: unknown): string | undefined {
  return q &&
    typeof q === 'object' &&
    'search' in q &&
    typeof (q as Record<string, unknown>).search === 'string'
    ? (q as Record<string, string>).search
    : undefined
}

@ApiTags('CRM')
@RequiresFeature('crm.leads')
@Controller('leads')
export class LeadsController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List leads, newest first' })
  list(@Query() q: unknown, @CurrentPrincipal() p: Principal): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(q)
    const mine = q && typeof q === 'object' && (q as Record<string, unknown>)['mine'] === 'true'
    return this.crud.list('lead', {
      search: readSearch(q),
      searchFields: ['source', 'medium'],
      cursor,
      limit,
      mineUserId: mine ? p.id : undefined,
    })
  }

  @Get('board')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Leads with contact identity for the pipeline board' })
  async board(): Promise<unknown[]> {
    const leads = await withTenantTransaction(this.db, (tx) =>
      tx.lead.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 500,
        include: {
          contact: { select: { firstName: true, lastName: true, email: true, phone: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
    )
    return leads.map((l) => ({
      id: l.id,
      status: l.status,
      source: l.source,
      medium: l.medium,
      score: l.score,
      value: l.value?.toString() ?? null,
      tags: l.tags,
      createdAt: l.createdAt.toISOString(),
      lastContactedAt: l.lastContactedAt?.toISOString() ?? null,
      contact: l.contact && {
        name: [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' '),
        email: l.contact.email,
        phone: l.contact.phone,
      },
      campaign: l.campaign,
    }))
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one lead' })
  get(@Param('id') id: string) {
    return this.crud.get('lead', id)
  }

  @Post('manual')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Add a lead by hand — contact + lead in one atomic call' })
  async manual(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const input = manualLeadSchema.parse(body)
    const [firstName, ...rest] = input.name.trim().split(/\s+/)
    return withTenantTransaction(this.db, async (tx) => {
      const contact = await tx.contact.create({
        data: {
          organizationId: p.organizationId,
          firstName: firstName ?? input.name,
          lastName: rest.length > 0 ? rest.join(' ') : null,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
      })
      const lead = await tx.lead.create({
        data: {
          organizationId: p.organizationId,
          contactId: contact.id,
          ownerId: p.id,
          status: 'NEW',
          source: input.source,
          value: input.value ?? null,
          ...(input.note ? { customFields: { note: input.note } } : {}),
        },
      })
      return { id: lead.id, contactId: contact.id }
    })
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a lead' })
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.create('lead', p, createSchema.parse(body), 'lead')
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a lead' })
  update(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.update('lead', p, id, updateSchema.parse(body), 'lead')
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Delete a lead' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.crud.remove('lead', p, id, 'lead')
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Bulk-delete leads' })
  bulk(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body)
    return this.crud.bulkRemove('lead', p, ids, 'lead')
  }
}
