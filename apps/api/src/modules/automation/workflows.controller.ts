import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { cursorPaginationSchema, type Paginated } from '@marketing-os/contracts'
import { type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const MODEL = 'workflow'
const ACTION = 'workflow'
const SEARCH_FIELDS = ['name', 'description'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // `triggerType` is the real column; the UI labels it "Trigger".
  triggerType: z.string().min(1),
  cronExpression: z.string().optional(),
})

const updateSchema = createSchema.partial()

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

interface WorkflowRow {
  id: string
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  createdAt?: Date
}

/** Automation workflows. Activation is separated from writing (AUTOMATION_ACTIVATE). */
@ApiTags('Automation')
@RequiresFeature('automation.workflows')
@Controller('workflows')
export class WorkflowsController {
  private readonly crud: CrudService

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'List workflows' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<WorkflowRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<WorkflowRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'Retrieve one workflow' })
  async get(@Param('id') id: string): Promise<WorkflowRow> {
    return this.crud.get<WorkflowRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Create a workflow' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WorkflowRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.create<WorkflowRow>(MODEL, principal, parsed.data, ACTION)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Update a workflow' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WorkflowRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.update<WorkflowRow>(MODEL, principal, id, parsed.data, ACTION)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Soft-delete a workflow' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete workflows' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }

  @Post(':id/toggle')
  @RequirePermissions(PERMISSIONS.AUTOMATION_ACTIVATE)
  @ApiOperation({ summary: 'Toggle a workflow between ACTIVE and PAUSED' })
  async toggle(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WorkflowRow> {
    const current = await this.crud.get<WorkflowRow>(MODEL, id)
    const next = current.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    return this.crud.update<WorkflowRow>(MODEL, principal, id, { status: next }, ACTION)
  }
}
