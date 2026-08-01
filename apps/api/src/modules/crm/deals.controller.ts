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
    title: z.string().min(1),
    pipelineId: z.string().min(1),
    stageId: z.string().min(1),
    value: z.number().optional(),
    currency: z.string().min(1).optional(),
    status: z.enum(['OPEN', 'WON', 'LOST', 'ABANDONED']).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    leadId: z.string().optional(),
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
@RequiresFeature('crm.deals')
@Controller('deals')
export class DealsController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List deals, newest first' })
  list(@Query() q: unknown, @CurrentPrincipal() p: Principal): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(q)
    const mine = q && typeof q === 'object' && (q as Record<string, unknown>)['mine'] === 'true'
    return this.crud.list('deal', {
      search: readSearch(q),
      searchFields: ['title'],
      cursor,
      limit,
      mineUserId: mine ? p.id : undefined,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one deal' })
  get(@Param('id') id: string) {
    return this.crud.get('deal', id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a deal' })
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.create('deal', p, createSchema.parse(body), 'deal')
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a deal' })
  update(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.update('deal', p, id, updateSchema.parse(body), 'deal')
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Delete a deal' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.crud.remove('deal', p, id, 'deal')
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Bulk-delete deals' })
  bulk(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body)
    return this.crud.bulkRemove('deal', p, ids, 'deal')
  }
}
