import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Paginated } from '@vsp/contracts'
import { publishEvent, withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(200),
    objective: z.string().max(500).optional(),
    budgetTotal: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  })
  .strict()

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_READ)
  @ApiOperation({ summary: 'List campaigns' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await this.db.campaign.findMany({
      where: { deletedAt: null, ...keysetWhere(cursor) },
      orderBy: KEYSET_ORDER,
      take: limit + 1,
    })
    return toPage(rows, limit, (c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      budgetTotal: c.budgetTotal?.toString() ?? null,
      budgetSpent: c.budgetSpent.toString(),
      createdAt: c.createdAt.toISOString(),
    }))
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE)
  @ApiOperation({ summary: 'Create a campaign (draft)' })
  async create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    const input = zodBody(createCampaignSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name,
          objective: input.objective ?? null,
          budgetTotal: input.budgetTotal ?? null,
          status: 'DRAFT',
        },
      })
      return { id: campaign.id }
    })
  }

  @Post(':id/launch')
  // Launching is separate from writing: it moves a campaign from draft to
  // spending money and running outbound, so it takes the publish permission.
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_PUBLISH)
  @ApiOperation({ summary: 'Launch a campaign' })
  async launch(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id, deletedAt: null },
        include: { channels: true },
      })
      if (!campaign) throw new NotFoundException('Campaign not found')

      await tx.campaign.updateMany({
        where: { id },
        data: { status: 'ACTIVE', startsAt: campaign.startsAt ?? new Date() },
      })

      await publishEvent(
        tx,
        'campaigns.campaign.launched.v1',
        {
          campaignId: id,
          channels: campaign.channels.map((ch) => ch.channel),
          budgetTotal: campaign.budgetTotal?.toString() ?? null,
        },
        { aggregateType: 'Campaign', aggregateId: id },
      )

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'campaign.launched',
          resourceType: 'campaign',
          resourceId: id,
        },
      })

      return { ok: true }
    })
  }
}
