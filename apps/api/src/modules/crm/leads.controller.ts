import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { cursorPaginationSchema, type Paginated } from '@vsp/contracts'
import { type DatabaseClient } from '@vsp/database'

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

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one lead' })
  get(@Param('id') id: string) {
    return this.crud.get('lead', id)
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
