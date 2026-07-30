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

const MODEL = 'emailCampaign'
const ACTION = 'email_campaign'
const SEARCH_FIELDS = ['name', 'subject'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

const createSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  // `preheader` is the real column; the UI labels it "Preview text".
  preheader: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
})

const updateSchema = createSchema.partial()

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

interface EmailCampaignRow {
  id: string
  createdAt?: Date
}

/**
 * Email campaigns — a thin, feature- and permission-gated slice over CrudService.
 *
 * Publishing (schedule/send) is separated from writing: drafting is reversible,
 * sending reaches a customer's inbox, so it carries CAMPAIGNS_PUBLISH.
 */
@ApiTags('Marketing')
@RequiresFeature('marketing.email')
@Controller('email-campaigns')
export class EmailCampaignsController {
  private readonly crud: CrudService

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_READ)
  @ApiOperation({ summary: 'List email campaigns, newest first' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<EmailCampaignRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<EmailCampaignRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_READ)
  @ApiOperation({ summary: 'Retrieve one email campaign' })
  async get(@Param('id') id: string): Promise<EmailCampaignRow> {
    return this.crud.get<EmailCampaignRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Create an email campaign' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<EmailCampaignRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.create<EmailCampaignRow>(MODEL, principal, parsed.data, ACTION)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Update an email campaign' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<EmailCampaignRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.update<EmailCampaignRow>(MODEL, principal, id, parsed.data, ACTION)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Soft-delete an email campaign' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete email campaigns' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_PUBLISH)
  @ApiOperation({ summary: 'Move a campaign to SCHEDULED' })
  async schedule(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<EmailCampaignRow> {
    return this.crud.update<EmailCampaignRow>(
      MODEL,
      principal,
      id,
      { status: 'SCHEDULED', scheduledAt: new Date() },
      ACTION,
    )
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_PUBLISH)
  @ApiOperation({ summary: 'Mark a campaign as sending/active' })
  async send(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<EmailCampaignRow> {
    return this.crud.update<EmailCampaignRow>(
      MODEL,
      principal,
      id,
      { status: 'ACTIVE', sentAt: new Date() },
      ACTION,
    )
  }
}
