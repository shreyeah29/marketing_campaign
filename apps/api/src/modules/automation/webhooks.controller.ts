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

const MODEL = 'webhook'
const ACTION = 'webhook'
const SEARCH_FIELDS = ['url', 'description'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

// The UI collects a single `event` and a `secret`; they map to the real columns
// `events` (string[]) and `secretHash`.
const createSchema = z.object({
  url: z.string().url(),
  event: z.string().optional(),
  secret: z.string().min(1),
  description: z.string().optional(),
})

const updateSchema = z.object({
  url: z.string().url().optional(),
  event: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

interface WebhookRow {
  id: string
  createdAt?: Date
}

/** Outbound webhook subscriptions. */
@ApiTags('Automation')
@RequiresFeature('automation.webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly crud: CrudService

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'List webhooks' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<WebhookRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<WebhookRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_READ)
  @ApiOperation({ summary: 'Retrieve one webhook' })
  async get(@Param('id') id: string): Promise<WebhookRow> {
    return this.crud.get<WebhookRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Create a webhook' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WebhookRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { url, event, secret, description } = parsed.data
    return this.crud.create<WebhookRow>(
      MODEL,
      principal,
      {
        url,
        events: event ? [event] : [],
        secretHash: secret,
        ...(description === undefined ? {} : { description }),
      },
      ACTION,
    )
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Update a webhook' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WebhookRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { url, event, description, isActive } = parsed.data
    return this.crud.update<WebhookRow>(
      MODEL,
      principal,
      id,
      {
        ...(url === undefined ? {} : { url }),
        ...(event === undefined ? {} : { events: [event] }),
        ...(description === undefined ? {} : { description }),
        ...(isActive === undefined ? {} : { isActive }),
      },
      ACTION,
    )
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Soft-delete a webhook' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete webhooks' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }
}
