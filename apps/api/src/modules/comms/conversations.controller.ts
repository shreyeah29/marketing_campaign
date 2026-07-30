import { Controller, Get, Inject, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { cursorPaginationSchema, type Paginated } from '@vsp/contracts'
import type { DatabaseClient } from '@vsp/database'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Conversations — the unified inbox across channels.
 *
 * Read-only here: messages arrive through channel ingestion, not through this
 * surface. Gated on the live-chat feature and CRM read permission, and served by
 * the generic CRUD service so listing and lookup keep the tenant-scoping and
 * cursor-pagination invariants without re-implementing them.
 */
@ApiTags('Conversations')
@RequiresFeature('comms.live_chat')
@Controller('conversations')
export class ConversationsController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List conversations, newest first' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(query)
    return this.crud.list('conversation', { cursor, limit })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one conversation' })
  async findOne(@Param('id') id: string): Promise<unknown> {
    return this.crud.get('conversation', id)
  }
}
