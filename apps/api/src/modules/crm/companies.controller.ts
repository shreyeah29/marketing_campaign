import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { cursorPaginationSchema, type Paginated } from '@marketing-os/contracts'
import { type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const createSchema = z
  .object({
    name: z.string().min(1),
    domain: z.string().min(1).optional(),
    industry: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    annualRevenue: z.number().optional(),
    description: z.string().optional(),
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
@RequiresFeature('crm.companies')
@Controller('companies')
export class CompaniesController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List companies, newest first' })
  list(@Query() q: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(q)
    return this.crud.list('company', {
      search: readSearch(q),
      searchFields: ['name', 'domain'],
      cursor,
      limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one company' })
  get(@Param('id') id: string) {
    return this.crud.get('company', id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a company' })
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.create('company', p, createSchema.parse(body), 'company')
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a company' })
  update(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.update('company', p, id, updateSchema.parse(body), 'company')
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Delete a company' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.crud.remove('company', p, id, 'company')
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Bulk-delete companies' })
  bulk(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body)
    return this.crud.bulkRemove('company', p, ids, 'company')
  }
}
