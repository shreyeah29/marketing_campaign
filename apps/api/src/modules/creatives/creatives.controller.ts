import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import {
  ASPECT_RATIOS,
  DEFAULT_TEMPLATE_SLUG,
  findTemplate,
  type CreativeData,
} from '@marketing-os/creative-engine'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { createRedis } from '../../infrastructure/redis.js'

/**
 * Creatives, and the batches that produce them.
 *
 * "Generate all" over a fifty-product campaign creates fifty rows and fifty
 * queue jobs, then returns immediately with a batch id. The HTTP request never
 * waits on rendering — the brief is explicit about this, and it is also the only
 * shape that survives a campaign large enough to matter.
 *
 * Each creative's `content` is a **snapshot** taken here, at creation. Rendering
 * reads only that snapshot, so an approved poster cannot change because someone
 * edited a price afterwards. Editing a creative rewrites its snapshot and
 * re-queues a render; editing the product does not.
 */

const batchSchema = z
  .object({
    campaignId: z.string().min(1),
    template: z.string().max(64).default(DEFAULT_TEMPLATE_SLUG),
    ratio: z.enum(ASPECT_RATIOS).default('1:1'),
    /** Optional generated background, shared by every creative in the batch. */
    sceneId: z.string().optional(),
    /** Defaults to every product on the campaign. */
    productIds: z.array(z.string().min(1)).max(500).optional(),
  })
  .strict()

const listQuerySchema = z.object({
  campaignId: z.string().optional(),
  batchId: z.string().optional(),
  status: z
    .enum([
      'DRAFT',
      'RENDERING',
      'READY',
      'APPROVED',
      'REJECTED',
      'SCHEDULED',
      'PUBLISHED',
      'FAILED',
    ])
    .optional(),
})

/** Only the copy is editable here; prices come from the product snapshot. */
const editSchema = z
  .object({
    campaignName: z.string().max(200).nullish(),
    primaryOffer: z.string().max(200).nullish(),
    secondaryOffer: z.string().max(200).nullish(),
    couponCode: z.string().max(80).nullish(),
    cta: z.string().max(80).nullish(),
  })
  .strict()

@ApiTags('Creatives')
@Controller()
export class CreativesController {
  /**
   * One producer connection for the process. BullMQ blocks on long reads, so it
   * gets the connection settings the worker uses rather than the general pool.
   */
  private readonly queue: Queue
  private readonly connection: Redis

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.connection = createRedis(loadEnv(), 'bullmq')
    this.queue = new Queue('creative-render', { connection: this.connection })
  }

  // ── Batch ──────────────────────────────────────────────────────────────────

  @Post('campaigns/:id/creatives/batch')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Generate a creative for every product in the campaign' })
  async batch(
    @Param('id') campaignId: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ batchId: string; total: number }> {
    const input = zodBody(batchSchema, { ...(body as object), campaignId })

    const template = findTemplate(input.template ?? DEFAULT_TEMPLATE_SLUG)
    if (!template) throw new BadRequestException(`Unknown template "${String(input.template)}"`)
    const ratio = input.ratio ?? '1:1'

    const { batch, jobs } = await withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, deletedAt: null },
      })
      if (!campaign) throw new NotFoundException('Campaign not found')

      const links = await tx.campaignProduct.findMany({
        where: { campaignId, ...(input.productIds ? { productId: { in: input.productIds } } : {}) },
        orderBy: { position: 'asc' },
        select: { productId: true },
      })
      const products = await tx.product.findMany({
        where: { id: { in: links.map((l) => l.productId) }, deletedAt: null },
      })
      if (products.length === 0) {
        throw new BadRequestException('This campaign has no products to generate from')
      }

      const [branding, scene] = await Promise.all([
        tx.branding.findFirst(),
        input.sceneId
          ? tx.mediaAsset.findFirst({
              where: { id: input.sceneId, deletedAt: null },
              select: { url: true },
            })
          : Promise.resolve(null),
      ])

      const batchRow = await tx.batchJob.create({
        data: {
          organizationId: p.organizationId,
          campaignId,
          kind: 'creative-render',
          total: products.length,
        },
      })

      const created: { id: string }[] = []
      for (const product of products) {
        const content = snapshot(product, campaign, branding, scene?.url ?? null)
        const row = await tx.creative.create({
          data: {
            organizationId: p.organizationId,
            campaignId,
            productId: product.id,
            templateSlug: template.slug,
            templateVersion: template.document.version,
            ...(input.sceneId ? { sceneId: input.sceneId } : {}),
            content: content as never,
            aspectRatio: ratio,
            status: 'DRAFT',
            batchId: batchRow.id,
          },
          select: { id: true },
        })
        created.push(row)
      }

      return { batch: batchRow, jobs: created }
    })

    // Enqueued after the transaction commits. Enqueueing inside it would let a
    // worker pick up a job for a row that has not been written yet — or worse,
    // for a transaction that then rolls back.
    await this.queue.addBulk(
      jobs.map((j) => ({
        name: 'render',
        data: { creativeId: j.id, organizationId: p.organizationId },
      })),
    )

    return { batchId: batch.id, total: batch.total }
  }

  @Get('batches/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Progress for a batch' })
  async batchStatus(@Param('id') id: string): Promise<unknown> {
    const row = await withTenantTransaction(this.db, (tx) =>
      tx.batchJob.findFirst({ where: { id } }),
    )
    if (!row) throw new NotFoundException('Batch not found')
    return {
      id: row.id,
      campaignId: row.campaignId,
      total: row.total,
      completed: row.completed,
      failed: row.failed,
      status: row.status,
      // Sent rather than computed client-side so the number in the UI and the
      // number in a log line cannot disagree.
      percent: row.total === 0 ? 100 : Math.round(((row.completed + row.failed) / row.total) * 100),
      finishedAt: row.finishedAt,
    }
  }

  @Get('campaigns/:id/creative-summary')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'How this campaign is doing, from generation to results' })
  async summary(@Param('id') campaignId: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: { id: true, name: true },
      })
      if (!campaign) throw new NotFoundException('Campaign not found')

      const [byStatus, metrics] = await Promise.all([
        tx.creative.groupBy({
          by: ['status'],
          where: { campaignId, deletedAt: null },
          _count: { _all: true },
        }),
        // Performance comes from the metrics the analytics pollers already
        // write. A creative-level attribution table would be a second source of
        // truth for numbers that are already collected per campaign.
        tx.metricDaily.aggregate({
          where: { campaignId },
          _sum: { impressions: true, clicks: true, leads: true, conversions: true },
        }),
      ])

      const counts: Record<string, number> = {}
      for (const row of byStatus) counts[row.status] = row._count._all

      const generated = Object.values(counts).reduce((a, b) => a + b, 0)
      const published = (counts['PUBLISHED'] ?? 0) + (counts['SCHEDULED'] ?? 0)
      const impressions = metrics._sum.impressions ?? 0
      const clicks = metrics._sum.clicks ?? 0

      return {
        campaign,
        generated,
        published,
        awaitingReview: (counts['READY'] ?? 0) + (counts['DRAFT'] ?? 0),
        approved: counts['APPROVED'] ?? 0,
        rejected: counts['REJECTED'] ?? 0,
        failed: counts['FAILED'] ?? 0,
        impressions,
        clicks,
        leads: metrics._sum.leads ?? 0,
        conversions: metrics._sum.conversions ?? 0,
        // Returned as a number, computed once. Two screens dividing it
        // themselves is two chances to round it differently.
        ctr: impressions === 0 ? null : Number(((clicks / impressions) * 100).toFixed(2)),
      }
    })
  }

  // ── Creatives ──────────────────────────────────────────────────────────────

  @Get('creatives')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  async list(@Query() q: Record<string, string>): Promise<{ data: unknown[] }> {
    const parsed = listQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { campaignId, batchId, status } = parsed.data

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.creative.findMany({
        where: {
          deletedAt: null,
          ...(campaignId ? { campaignId } : {}),
          ...(batchId ? { batchId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { product: { select: { name: true, brand: true } } },
      }),
    )
    return { data: rows }
  }

  @Get('creatives/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  async get(@Param('id') id: string): Promise<unknown> {
    const row = await withTenantTransaction(this.db, (tx) =>
      tx.creative.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!row) throw new NotFoundException('Creative not found')
    return row
  }

  /**
   * Edit the copy and re-render.
   *
   * Free: no model is called, only the snapshot is rewritten and the render
   * re-queued. This is the endpoint that makes "change the coupon code" cost
   * nothing, which was the point of separating the visual from the composition.
   */
  @Patch('creatives/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(editSchema, body)

    const updated = await withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')
      if (row.status === 'PUBLISHED') {
        // Rewriting what is already public would leave the record disagreeing
        // with the advertisement people can see.
        throw new BadRequestException(
          'A published creative cannot be edited — duplicate it instead',
        )
      }

      const content = row.content as CreativeData
      const campaign = {
        ...content.campaign,
        ...(input.campaignName === undefined ? {} : { name: input.campaignName }),
        ...(input.primaryOffer === undefined ? {} : { primaryOffer: input.primaryOffer }),
        ...(input.secondaryOffer === undefined ? {} : { secondaryOffer: input.secondaryOffer }),
        ...(input.couponCode === undefined ? {} : { couponCode: input.couponCode }),
        ...(input.cta === undefined ? {} : { cta: input.cta }),
      }

      return tx.creative.update({
        where: { id },
        data: {
          content: { ...content, campaign } as never,
          status: 'DRAFT',
          // Approval does not survive an edit. Someone approved specific words;
          // different words need a fresh decision.
          approvedAt: null,
          approvedById: null,
        },
      })
    })

    await this.queue.add('render', { creativeId: id, organizationId: p.organizationId })
    return updated
  }

  @Post('creatives/:id/rerender')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Re-render, optionally through a different template or ratio' })
  async rerender(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(
      z
        .object({
          template: z.string().max(64).optional(),
          ratio: z.enum(ASPECT_RATIOS).optional(),
        })
        .strict(),
      body ?? {},
    )

    const updated = await withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')

      let slug = row.templateSlug
      let version = row.templateVersion
      if (input.template) {
        const next = findTemplate(input.template)
        if (!next) throw new BadRequestException(`Unknown template "${input.template}"`)
        slug = next.slug
        version = next.document.version
      }

      return tx.creative.update({
        where: { id },
        data: {
          templateSlug: slug,
          templateVersion: version,
          ...(input.ratio ? { aspectRatio: input.ratio } : {}),
          status: 'DRAFT',
        },
      })
    })

    await this.queue.add('render', { creativeId: id, organizationId: p.organizationId })
    return updated
  }
}

/**
 * Freeze the copy this creative will render with, forever.
 *
 * Everything the template can read is captured here and nothing is read again.
 * A join would mean an approved advertisement quietly changing when the
 * catalogue does.
 */
function snapshot(
  product: {
    name: string
    brand: string | null
    mrpMinor: number | null
    salePriceMinor: number | null
    currency: string
    imageUrl: string | null
    cutoutUrl: string | null
  },
  campaign: {
    name: string
    theme: string | null
    primaryOffer: string | null
    secondaryOffer: string | null
    couponCode: string | null
    cta: string | null
  },
  branding: { displayName: string | null; logoUrl: string | null; disclaimers: unknown } | null,
  sceneUrl: string | null,
): CreativeData {
  const disclaimers = Array.isArray(branding?.disclaimers)
    ? (branding.disclaimers as { value?: unknown }[])
    : []
  const disclaimer = disclaimers
    .map((d) => (typeof d?.value === 'string' ? d.value.trim() : ''))
    .find((d) => d.length > 0)

  return {
    product: {
      name: product.name,
      brand: product.brand,
      mrpMinor: product.mrpMinor,
      salePriceMinor: product.salePriceMinor,
      currency: product.currency,
      imageUrl: product.imageUrl,
    },
    campaign: {
      name: campaign.name,
      theme: campaign.theme,
      primaryOffer: campaign.primaryOffer,
      secondaryOffer: campaign.secondaryOffer,
      couponCode: campaign.couponCode,
      cta: campaign.cta,
    },
    brand: {
      displayName: branding?.displayName ?? null,
      logoUrl: branding?.logoUrl ?? null,
      ...(disclaimer ? { disclaimer } : {}),
    },
    // The cutout when there is one, the plain photograph otherwise — the real
    // product either way, never a generated impression of it.
    visual: { url: product.cutoutUrl ?? product.imageUrl },
    ...(sceneUrl ? { scene: { url: sceneUrl } } : {}),
  }
}
