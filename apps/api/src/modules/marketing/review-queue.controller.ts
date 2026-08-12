import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { OverlayService, type BrandFacts } from '../../infrastructure/overlay.js'
import { StorageService } from '../../infrastructure/storage.js'
import { generateRunwayImage, generateRunwayVideo } from '../ai/adapters/runway.js'
import { AiService } from '../ai/ai.service.js'
import { CampaignGenerationService } from '../ai/campaign-generation.service.js'
import { WorkflowEngineService } from '../automation/workflow-engine.service.js'

const generateSchema = z.object({ brief: z.string().min(4).max(4000) }).strict()
const editSchema = z
  .object({
    title: z.string().max(300).nullish(),
    body: z.string().max(20000).optional(),
    caption: z.string().max(4000).nullish(),
    hashtags: z.array(z.string()).optional(),
    cta: z.string().max(300).nullish(),
  })
  .strict()
const scheduleSchema = z.object({ scheduledFor: z.string().datetime() }).strict()
const publishSchema = z
  .object({
    accountIds: z.array(z.string().min(1)).min(1),
    scheduledAt: z.string().datetime().optional(),
  })
  .strict()
const rejectSchema = z.object({ reason: z.string().max(1000).optional() }).strict()
const generateMediaSchema = z
  .object({ variants: z.number().int().min(1).max(3).optional() })
  .strict()
const chooseVariantSchema = z.object({ url: z.string().url() }).strict()
const bulkSchema = z
  .object({ action: z.enum(['approve', 'reject']), ids: z.array(z.string()).min(1).max(200) })
  .strict()
const commentSchema = z.object({ body: z.string().min(1).max(2000) }).strict()
const ASSET_STATUS = [
  'DRAFT',
  'GENERATED',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
] as const
const ASSET_PLATFORM = [
  'INSTAGRAM',
  'FACEBOOK',
  'LINKEDIN',
  'X',
  'GOOGLE',
  'YOUTUBE',
  'TIKTOK',
  'GENERIC',
] as const
const listAssetsQuerySchema = z.object({
  status: z.enum(ASSET_STATUS).optional(),
  platform: z.enum(ASSET_PLATFORM).optional(),
  campaignId: z.string().optional(),
  search: z.string().max(200).optional(),
})

const APPROVABLE = new Set(['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT'])

/**
 * The content review queue — the human approval gate of the automation engine.
 *
 * AI generates assets; nothing reaches a customer's audience without a person
 * approving it here. Every asset moves through an explicit lifecycle
 * (GENERATED → NEEDS_REVIEW → APPROVED/REJECTED → SCHEDULED → PUBLISHING →
 * PUBLISHED/FAILED), and every transition is recorded as a comment so the row
 * doubles as an approval timeline.
 */
@ApiTags('Review Queue')
@RequiresFeature('marketing.campaigns')
@Controller('campaign-assets')
export class ReviewQueueController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(CampaignGenerationService) private readonly generation: CampaignGenerationService,
    @Inject(WorkflowEngineService) private readonly workflows: WorkflowEngineService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(OverlayService) private readonly overlay: OverlayService,
  ) {}

  /**
   * The brand kit's facts, shaped for the artwork stamp.
   *
   * Returns empty on any failure, which the overlay treats as "nothing to
   * stamp" — an organisation that has not filled in its brand kit gets plain
   * artwork rather than an error.
   */
  private async brandFacts(): Promise<BrandFacts> {
    try {
      const b = await withTenantTransaction(this.db, (tx) => tx.branding.findFirst())
      if (!b) return {}

      // contactPhones is JSON: [{ label: "India", value: "+91 …" }]. Labels are
      // kept because a poster aimed at two countries needs to say which is which.
      const rows = Array.isArray(b.contactPhones)
        ? (b.contactPhones as { label?: unknown; value?: unknown }[])
        : []
      const phones = rows
        .map((r) => {
          const value = typeof r?.value === 'string' ? r.value.trim() : ''
          if (!value) return ''
          const label = typeof r?.label === 'string' ? r.label.trim() : ''
          return label ? `${label} ${value}` : value
        })
        .filter((p) => p.length > 0)

      // One disclaimer fits a band; the first is the one that gets stamped.
      const disclaimers = Array.isArray(b.disclaimers)
        ? (b.disclaimers as { value?: unknown }[])
        : []
      const disclaimer = disclaimers
        .map((d) => (typeof d?.value === 'string' ? d.value.trim() : ''))
        .find((d) => d.length > 0)

      return {
        displayName: b.displayName,
        logoUrl: b.logoUrl,
        contactEmail: b.contactEmail,
        phones,
        ...(disclaimer ? { disclaimer } : {}),
      }
    } catch {
      return {}
    }
  }

  // ── Generation ─────────────────────────────────────────────────────────────
  @Post('plan')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE, PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Produce a structured campaign plan (no assets) for review' })
  async plan(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const { brief } = zodBody(generateSchema, body)
    return this.generation.plan(p, brief)
  }

  @Post('generate')
  @RequirePermissions(PERMISSIONS.CAMPAIGNS_WRITE, PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate a campaign and its assets from a brief' })
  async generate(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const { brief } = zodBody(generateSchema, body)
    return this.generation.generate(p, brief)
  }

  // ── Read ───────────────────────────────────────────────────────────────────
  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List assets, filterable by status / campaign / platform' })
  async list(@Query() q: Record<string, string>): Promise<unknown> {
    // Validate the enum filters: an unknown ?status/?platform must be a 400, not a
    // PrismaClientValidationError → unhandled 500.
    const parsed = listAssetsQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { status, campaignId, platform, search } = parsed.data

    const where: Record<string, unknown> = { deletedAt: null }
    if (status) where['status'] = status
    if (campaignId) where['campaignId'] = campaignId
    if (platform) where['platform'] = platform
    if (search) where['body'] = { contains: search, mode: 'insensitive' }

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.campaignAsset.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    )
    return { data: rows }
  }

  @Get('board')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Assets grouped by status, for the Kanban board' })
  async board(@Query('campaignId') campaignId?: string): Promise<unknown> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.campaignAsset.findMany({
        where: { deletedAt: null, ...(campaignId ? { campaignId } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
    )
    const columns: Record<string, unknown[]> = {
      GENERATED: [],
      NEEDS_REVIEW: [],
      APPROVED: [],
      SCHEDULED: [],
      PUBLISHED: [],
      REJECTED: [],
    }
    for (const r of rows) {
      const key =
        r.status === 'DRAFT'
          ? 'GENERATED'
          : r.status === 'PUBLISHING' || r.status === 'FAILED'
            ? 'SCHEDULED'
            : r.status
      ;(columns[key] ?? (columns[key] = [])).push(r)
    }
    return { columns }
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  async get(@Param('id') id: string): Promise<unknown> {
    const asset = await withTenantTransaction(this.db, (tx) =>
      tx.campaignAsset.findFirst({
        where: { id, deletedAt: null },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      }),
    )
    if (!asset) throw new NotFoundException('Asset not found')
    return asset
  }

  // ── Edit / regenerate ──────────────────────────────────────────────────────
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Edit an asset' })
  async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(editSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.caption === undefined ? {} : { caption: input.caption }),
          ...(input.hashtags === undefined ? {} : { hashtags: input.hashtags }),
          ...(input.cta === undefined ? {} : { cta: input.cta }),
          // An edit after generation/rejection returns it to review.
          ...(asset.status === 'APPROVED' || asset.status === 'REJECTED'
            ? { status: 'NEEDS_REVIEW' }
            : {}),
        },
      })
      await this.comment(tx, p, id, 'Edited', 'edited')
      return updated
    })
  }

  @Post(':id/regenerate')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Regenerate this asset with AI, keeping the prior version' })
  async regenerate(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const asset = await withTenantTransaction(this.db, (tx) =>
      tx.campaignAsset.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!asset) throw new NotFoundException('Asset not found')

    const newBody = await this.generation.regenerateAsset(p, {
      platform: asset.platform,
      kind: asset.kind,
      body: asset.body,
      title: asset.title,
    })

    return withTenantTransaction(this.db, async (tx) => {
      const prior = Array.isArray(asset.aiVersions) ? (asset.aiVersions as unknown[]) : []
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: {
          body: newBody,
          aiVersions: [...prior, { body: asset.body, at: new Date().toISOString() }] as never,
          status: 'GENERATED',
        },
      })
      await this.comment(tx, p, id, 'Regenerated with AI', 'regenerated')
      return updated
    })
  }

  // ── Lifecycle transitions ──────────────────────────────────────────────────
  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async approve(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const updated = await this.transition(id, p, 'APPROVED', APPROVABLE, 'Approved', 'approved')
    // Fire the event so any ACTIVE workflow triggered by "asset.approved" runs.
    await this.workflows.fireEvent(p, 'asset.approved', { assetId: id }).catch(() => undefined)
    return updated
  }

  /**
   * Gate 1 → Gate 2. An approved poster/video *concept* (IMAGE_PROMPT /
   * VIDEO_PROMPT) becomes a real creative: the prompt goes to Runway, the
   * resulting media lands on the asset, and the asset returns to NEEDS_REVIEW
   * for the final human check before publishing.
   */
  @Post(':id/generate-media')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async generateMedia(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(generateMediaSchema, body ?? {})
    const asset = await withTenantTransaction(this.db, (tx) =>
      tx.campaignAsset.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!asset) throw new NotFoundException('Asset not found')
    if (asset.kind !== 'IMAGE_PROMPT' && asset.kind !== 'VIDEO_PROMPT') {
      throw new BadRequestException('Only image/video concepts can generate media')
    }
    // Media may be generated before the concept is approved. You cannot judge a
    // poster from its prompt, so requiring approval first asked the reviewer to
    // commit blind; they now generate, look, and then approve, reject or
    // regenerate. Only a rejected concept is refused — regenerating one means
    // reopening it first, which keeps the rejection meaningful.
    if (asset.status === 'REJECTED') {
      throw new BadRequestException('This concept was rejected — reopen it before generating media')
    }

    // "Temporarily unavailable" sent people hunting for an outage when the real
    // answer was an unset key. Say which, and say it differently for the two
    // cases, because only one of them is worth waiting out.
    const runway = this.ai.platformRunwayKey()
    if (!runway) {
      throw new ServiceUnavailableException(
        asset.kind === 'VIDEO_PROMPT'
          ? 'Video generation is not set up on this deployment yet.'
          : 'Poster generation is not set up on this deployment yet.',
      )
    }

    // The slow Runway round-trip happens OUTSIDE any transaction; holding a
    // connection open for up to minutes would starve the pool.
    const prompt = [asset.title, asset.body].filter(Boolean).join(' — ')
    let urls: string[]
    if (asset.kind === 'IMAGE_PROMPT') {
      // A/B variants: images render concurrently so picking a winner costs no
      // extra wall-clock. Video stays single — minutes-long and expensive.
      const count = input.variants ?? 2
      const results = await Promise.allSettled(
        Array.from({ length: count }, () =>
          generateRunwayImage({
            apiKey: runway.apiKey,
            prompt,
            ...(runway.imageModel ? { model: runway.imageModel } : {}),
          }),
        ),
      )
      urls = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.url)
      if (urls.length === 0) {
        throw new ServiceUnavailableException('Media generation failed — try again')
      }
    } else {
      const result = await generateRunwayVideo({
        apiKey: runway.apiKey,
        prompt,
        ...(runway.videoModel ? { model: runway.videoModel } : {}),
        ...(runway.imageModel ? { imageModel: runway.imageModel } : {}),
      })
      urls = [result.url]
    }

    // Runway's URLs expire. Copy the bytes into our own bucket before anything
    // is persisted, so what the database holds still resolves next month. Also
    // outside the transaction — it is more network I/O.
    //
    // The brand details are stamped on during that same copy. The model was
    // told to leave space and draw no text, because image models render a phone
    // number as something that merely looks like one — so the real number goes
    // on here, from the brand kit, on the only copy that gets stored.
    const facts = await this.brandFacts()
    const stored = await this.storage.persistMany(
      urls,
      `${p.organizationId}/${id}/${Date.now()}`,
      (bytes, contentType) => this.overlay.apply(bytes, contentType, facts),
    )
    const durableUrls = stored.map((s) => s.url)

    const primary = durableUrls[0]
    if (!primary) throw new ServiceUnavailableException('Media generation failed — try again')

    return withTenantTransaction(this.db, async (tx) => {
      // Every generated creative also lands in the media library, so the
      // Creative Library can browse everything ever made — approved or not.
      for (const [i, item] of stored.entries()) {
        await tx.mediaAsset.create({
          data: {
            organizationId: p.organizationId,
            type: asset.kind === 'IMAGE_PROMPT' ? 'IMAGE' : 'VIDEO',
            // Indexed from the loop, not `urls.indexOf(url)`: two variants can
            // come back identical, and indexOf would give them the same key.
            storageKey: item.persisted
              ? item.storageKey
              : `runway/${id}/${Date.now()}-${String(i)}`,
            url: item.url,
            prompt,
            generatorProvider: 'RUNWAY',
            ...(runway.imageModel || runway.videoModel
              ? {
                  generatorModel:
                    asset.kind === 'IMAGE_PROMPT' ? runway.imageModel : runway.videoModel,
                }
              : {}),
          },
        })
      }
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: {
          mediaUrl: primary,
          status: 'NEEDS_REVIEW',
          // All variants ride on the asset so the reviewer can pick the winner.
          aiVersions: { variants: durableUrls },
        },
      })
      await this.comment(
        tx,
        p,
        id,
        urls.length > 1
          ? `${urls.length} variants generated — pick the winner, then approve`
          : 'Creative generated — awaiting final review',
        'generated',
      )
      return updated
    })
  }

  /** The reviewer's A/B choice: promote one generated variant to THE creative. */
  @Post(':id/choose-variant')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async chooseVariant(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const { url } = zodBody(chooseVariantSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      const versions = (asset.aiVersions ?? {}) as { variants?: string[] }
      if (!versions.variants?.includes(url)) {
        throw new BadRequestException('That URL is not one of this asset’s variants')
      }
      const updated = await tx.campaignAsset.update({ where: { id }, data: { mediaUrl: url } })
      await this.comment(tx, p, id, 'Variant selected as the final creative', 'variant_selected')
      return updated
    })
  }

  /**
   * Gate 2 → the world. A finally-approved asset becomes a scheduled social
   * post on the chosen connected accounts ("post now" when no time is given).
   * The social worker publishes it on its next tick.
   */
  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async publish(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(publishSchema, body)
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date()

    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      if (asset.status !== 'APPROVED') {
        throw new BadRequestException('Only finally-approved assets can be published')
      }

      const accounts = await tx.socialAccount.findMany({
        where: { id: { in: input.accountIds }, deletedAt: null },
        select: { id: true },
      })
      if (accounts.length !== input.accountIds.length) {
        throw new BadRequestException('One or more accountIds are unknown or disconnected')
      }

      // The media library row for this creative rides along on the post.
      const media = asset.mediaUrl
        ? await tx.mediaAsset.findFirst({
            where: { url: asset.mediaUrl, deletedAt: null },
            select: { id: true },
          })
        : null

      const post = await tx.socialPost.create({
        data: {
          organizationId: p.organizationId,
          campaignId: asset.campaignId,
          status: 'SCHEDULED',
          body: [asset.caption ?? asset.body, asset.cta].filter(Boolean).join('\n\n'),
          hashtags: asset.hashtags,
          mediaIds: media ? [media.id] : [],
          scheduledAt,
        },
      })
      await tx.socialPostTarget.createMany({
        data: accounts.map((a) => ({
          postId: post.id,
          socialAccountId: a.id,
          status: 'SCHEDULED' as const,
        })),
      })

      const updated = await tx.campaignAsset.update({
        where: { id },
        data: { status: 'SCHEDULED', scheduledFor: scheduledAt, externalPostId: post.id },
      })
      await this.comment(
        tx,
        p,
        id,
        input.scheduledAt
          ? `Publishing scheduled for ${scheduledAt.toLocaleString()}`
          : 'Queued to publish now',
        'scheduled',
      )
      return { asset: updated, postId: post.id }
    })
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const { reason } = zodBody(rejectSchema, body)
    return this.transition(
      id,
      p,
      'REJECTED',
      new Set(['GENERATED', 'NEEDS_REVIEW', 'APPROVED', 'SCHEDULED']),
      `Rejected${reason ? `: ${reason}` : ''}`,
      'rejected',
    )
  }

  @Post(':id/schedule')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async schedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const { scheduledFor } = zodBody(scheduleSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      if (asset.status !== 'APPROVED' && asset.status !== 'SCHEDULED') {
        throw new BadRequestException('Only approved assets can be scheduled')
      }
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: { status: 'SCHEDULED', scheduledFor: new Date(scheduledFor) },
      })
      await this.comment(
        tx,
        p,
        id,
        `Scheduled for ${new Date(scheduledFor).toLocaleString()}`,
        'scheduled',
      )
      return updated
    })
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  async duplicate(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      return tx.campaignAsset.create({
        data: {
          organizationId: p.organizationId,
          campaignId: asset.campaignId,
          platform: asset.platform,
          kind: asset.kind,
          status: 'GENERATED',
          title: asset.title,
          body: asset.body,
          caption: asset.caption,
          hashtags: asset.hashtags,
          cta: asset.cta,
          ownerId: p.type === 'user' ? p.id : null,
        },
      })
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  async remove(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      await tx.campaignAsset.update({ where: { id }, data: { deletedAt: new Date() } })
      await this.audit(tx, p, 'asset.deleted', id)
    })
    return { ok: true }
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  @ApiOperation({ summary: 'Bulk approve or reject' })
  async bulk(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ ok: true; count: number }> {
    const { action, ids } = zodBody(bulkSchema, body)
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED'
    const count = await withTenantTransaction(this.db, async (tx) => {
      const res = await tx.campaignAsset.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { status, reviewerId: p.type === 'user' ? p.id : null },
      })
      await this.audit(tx, p, `asset.bulk_${action}`, ids.join(','))
      return res.count
    })
    return { ok: true, count }
  }

  // ── Comments / timeline ────────────────────────────────────────────────────
  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  async addComment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const { body: text } = zodBody(commentSchema, body)
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!asset) throw new NotFoundException('Asset not found')
      return this.comment(tx, p, id, text, 'comment')
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async transition(
    id: string,
    p: Principal,
    status: string,
    allowedFrom: Set<string>,
    note: string,
    event: string,
  ): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const asset = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      if (!asset) throw new NotFoundException('Asset not found')
      if (!allowedFrom.has(asset.status)) {
        throw new BadRequestException(`Cannot ${event} an asset that is ${asset.status}`)
      }
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: { status: status as never, reviewerId: p.type === 'user' ? p.id : null },
      })
      await this.comment(tx, p, id, note, event)
      return updated
    })
  }

  private async comment(
    tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
    p: Principal,
    assetId: string,
    text: string,
    event: string,
  ): Promise<unknown> {
    return tx.campaignAssetComment.create({
      data: {
        organizationId: p.organizationId,
        assetId,
        authorId: p.type === 'user' ? p.id : null,
        body: text,
        event,
      },
    })
  }

  private async audit(
    tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
    p: Principal,
    action: string,
    resourceId: string,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: p.organizationId,
        actorType: p.type === 'user' ? 'USER' : 'API_KEY',
        userId: p.type === 'user' ? p.id : null,
        action,
        resourceType: 'campaign_asset',
        resourceId,
      },
    })
  }
}
