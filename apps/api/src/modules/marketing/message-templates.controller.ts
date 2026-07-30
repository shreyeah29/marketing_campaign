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

import { cursorPaginationSchema, type Paginated } from '@vsp/contracts'
import { type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const MODEL = 'messageTemplate'
const ACTION = 'message_template'
const SEARCH_FIELDS = ['name', 'body'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

const createSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'VOICE', 'WEB_CHAT']),
  body: z.string().min(1),
  language: z.string().optional(),
  category: z.string().optional(),
})

const updateSchema = createSchema.partial()

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

interface MessageTemplateRow {
  id: string
  createdAt?: Date
}

/** Reusable message templates (email / WhatsApp / SMS bodies). */
@ApiTags('Marketing')
@RequiresFeature('marketing.email')
@Controller('message-templates')
export class MessageTemplatesController {
  private readonly crud: CrudService

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_READ)
  @ApiOperation({ summary: 'List message templates' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<MessageTemplateRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<MessageTemplateRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_READ)
  @ApiOperation({ summary: 'Retrieve one message template' })
  async get(@Param('id') id: string): Promise<MessageTemplateRow> {
    return this.crud.get<MessageTemplateRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Create a message template' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<MessageTemplateRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.create<MessageTemplateRow>(MODEL, principal, parsed.data, ACTION)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Update a message template' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<MessageTemplateRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.update<MessageTemplateRow>(MODEL, principal, id, parsed.data, ACTION)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Soft-delete a message template' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete message templates' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }
}
