import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { AdCampaignService } from './ad-campaign.service.js'
import { AdPublishService } from './ad-publish.service.js'

const creativeSchema = z
  .object({
    imageUrl: z.string().url().optional(),
    mediaAssetId: z.string().min(1).optional(),
    primaryText: z.string().max(4000).optional(),
    headline: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
    callToAction: z.string().max(60).optional(),
    linkUrl: z.string().url().optional(),
    leadFormId: z.string().min(1).optional(),
  })
  .strict()

const createSchema = z.object({
  name: z.string().min(1).max(200),
  objective: z.enum(['LEAD_GENERATION', 'CONVERSIONS', 'TRAFFIC', 'AWARENESS', 'ENGAGEMENT']).optional(),
  destination: z.enum(['INSTANT_FORM', 'WHATSAPP']).optional(),
  prompt: z.string().max(4000).optional(),
  dailyBudget: z.number().positive().optional(),
  lifetimeBudget: z.number().positive().optional(),
  creative: creativeSchema.optional(),
})

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    dailyBudget: z.number().positive().optional(),
    lifetimeBudget: z.number().positive().optional(),
    creative: creativeSchema.optional(),
  })
  .strict()

const rejectSchema = z.object({ reason: z.string().min(1).max(1000) })

/**
 * Meta ad campaigns: the draft → approval lifecycle. Creating and editing drafts
 * is a marketing action; approving one commits real budget, so it is gated on org
 * management — the human money-safety gate, in permissions form.
 */
@ApiTags('Meta Ads')
@Controller('meta/campaigns')
export class MetaAdsController {
  constructor(
    private readonly campaigns: AdCampaignService,
    private readonly publisher: AdPublishService,
  ) {}

  @Post()
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Create a draft ad campaign' })
  async create(@Body() body: unknown, @CurrentPrincipal() principal: Principal): Promise<{ id: string }> {
    return this.campaigns.create(principal, zodBody(createSchema, body))
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'List ad campaigns' })
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: unknown[] }> {
    return { data: await this.campaigns.list(principal) }
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Get one ad campaign' })
  async get(@Param('id') id: string, @CurrentPrincipal() principal: Principal): Promise<unknown> {
    return this.campaigns.get(principal, id)
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Edit a draft ad campaign' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.campaigns.update(principal, id, zodBody(updateSchema, body))
    return { ok: true }
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Submit a draft for approval' })
  async submit(@Param('id') id: string, @CurrentPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.campaigns.submitForApproval(principal, id)
    return { ok: true }
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Approve a campaign within the budget cap (money-safety gate)' })
  async approve(@Param('id') id: string, @CurrentPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.campaigns.approve(principal, id)
    return { ok: true }
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Reject a campaign pending approval' })
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const input = zodBody(rejectSchema, body)
    await this.campaigns.reject(principal, id, input.reason)
    return { ok: true }
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Publish an approved campaign to Meta (created paused)' })
  async publish(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ metaCampaignId: string }> {
    return this.publisher.publish(principal, id)
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Set a published campaign live (this starts real spend)' })
  async activate(@Param('id') id: string, @CurrentPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.publisher.setStatus(principal, id, 'ACTIVE')
    return { ok: true }
  }

  @Post(':id/pause')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Pause a live campaign' })
  async pause(@Param('id') id: string, @CurrentPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.publisher.setStatus(principal, id, 'PAUSED')
    return { ok: true }
  }
}
