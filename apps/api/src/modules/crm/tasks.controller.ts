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
    description: z.string().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    dueAt: z.coerce.date().optional(),
    assigneeId: z.string().optional(),
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
@RequiresFeature('crm.tasks')
@Controller('tasks')
export class TasksController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List tasks, newest first' })
  list(@Query() q: unknown, @CurrentPrincipal() p: Principal): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(q)
    const mine = q && typeof q === 'object' && (q as Record<string, unknown>)['mine'] === 'true'
    // For tasks, "mine" means assigned to me (assigneeId is the primary owner column).
    return this.crud.list('task', {
      search: readSearch(q),
      searchFields: ['title', 'description'],
      cursor,
      limit,
      mineUserId: mine ? p.id : undefined,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one task' })
  get(@Param('id') id: string) {
    return this.crud.get('task', id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a task' })
  create(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.create('task', p, createSchema.parse(body), 'task')
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() body: unknown, @CurrentPrincipal() p: Principal) {
    return this.crud.update('task', p, id, updateSchema.parse(body), 'task')
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    return this.crud.remove('task', p, id, 'task')
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Bulk-delete tasks' })
  bulk(@Body() body: unknown, @CurrentPrincipal() p: Principal) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body)
    return this.crud.bulkRemove('task', p, ids, 'task')
  }
}
