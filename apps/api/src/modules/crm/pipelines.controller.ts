import { Controller, Get, Inject, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { cursorPaginationSchema, type Paginated } from '@vsp/contracts'
import { type DatabaseClient } from '@vsp/database'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

function readSearch(q: unknown): string | undefined {
  return q && typeof q === 'object' && 'search' in q && typeof (q as Record<string, unknown>).search === 'string'
    ? (q as Record<string, string>).search
    : undefined
}

@ApiTags('CRM')
@RequiresFeature('crm.pipelines')
@Controller('pipelines')
export class PipelinesController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List pipelines' })
  list(@Query() q: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(q)
    return this.crud.list('pipeline', { search: readSearch(q), searchFields: ['name'], cursor, limit })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one pipeline' })
  get(@Param('id') id: string) {
    return this.crud.get('pipeline', id)
  }
}
