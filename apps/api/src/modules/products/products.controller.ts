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
  Res,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import {
  ASPECT_RATIOS,
  DEFAULT_TEMPLATE_SLUG,
  findTemplate,
  renderCreative,
  resolveImages,
  type AspectRatio,
  type CreativeData,
} from '@marketing-os/creative-engine'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { StorageService } from '../../infrastructure/storage.js'

/**
 * The product catalogue.
 *
 * Prices arrive and leave in **minor units** — 187000 for ₹1,870. The API never
 * accepts a decimal price, because the moment a rupee amount becomes a
 * JavaScript number it can come back as 1869.9999999999998, and that number is
 * destined to be printed on an advertisement.
 *
 * `discountPercent` is returned but never accepted: it is derived from the two
 * prices so that a stored value can never contradict the numbers beside it.
 */

const money = z
  .number()
  .int('Prices are in minor units — 187000 for ₹1,870, never 1870.5')
  .min(0)
  .max(1_000_000_000)

const productBody = z.object({
  name: z.string().min(1).max(300),
  brand: z.string().max(120).nullish(),
  sku: z.string().max(120).nullish(),
  description: z.string().max(4000).nullish(),
  productUrl: z.string().url().max(2000).nullish(),
  mrpMinor: money.nullish(),
  salePriceMinor: money.nullish(),
  currency: z.string().length(3).default('INR'),
  imageUrl: z.string().url().max(2000).nullish(),
  // Not nullish: a JSON column needs Prisma's DbNull sentinel to be cleared,
  // and "leave it alone" is the only update anyone needs here.
  attributes: z.record(z.string()).optional(),
})

const createSchema = productBody.strict()
const updateSchema = productBody.partial().strict()

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  brand: z.string().max(120).optional(),
  campaignId: z.string().optional(),
})

const previewQuerySchema = z.object({
  ratio: z.enum(ASPECT_RATIOS).default('1:1'),
  campaignId: z.string().optional(),
  template: z.string().max(64).default(DEFAULT_TEMPLATE_SLUG),
  /** A generated scene to sit behind the composition. */
  sceneId: z.string().optional(),
})

const renderBodySchema = z
  .object({
    ratio: z.enum(ASPECT_RATIOS).default('1:1'),
    template: z.string().max(64).default(DEFAULT_TEMPLATE_SLUG),
    campaignId: z.string().optional(),
    sceneId: z.string().optional(),
  })
  .strict()

interface ProductRow {
  id: string
  name: string
  brand: string | null
  mrpMinor: number | null
  salePriceMinor: number | null
  currency: string
  imageUrl: string | null
  cutoutUrl: string | null
}

/** Derived, never stored — see the file comment. */
function discountOf(mrp: number | null, sale: number | null): number | null {
  if (!mrp || !sale || mrp <= 0 || sale >= mrp) return null
  return Math.round(((mrp - sale) / mrp) * 100)
}

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List the catalogue' })
  async list(@Query() q: Record<string, string>): Promise<{ data: unknown[] }> {
    const parsed = listQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { search, brand, campaignId } = parsed.data

    const rows = await withTenantTransaction(this.db, async (tx) => {
      // Scoping by campaign goes through the join table rather than a column on
      // the product: a product belongs to several campaigns at once, and the
      // Diwali sale must not be able to rename it for the clearance sale.
      const ids = campaignId
        ? (
            await tx.campaignProduct.findMany({
              where: { campaignId },
              select: { productId: true },
            })
          ).map((r) => r.productId)
        : null

      return tx.product.findMany({
        where: {
          deletedAt: null,
          ...(ids ? { id: { in: ids } } : {}),
          ...(brand ? { brand } : {}),
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })
    })

    return {
      data: rows.map((r) => ({
        ...r,
        discountPercent: discountOf(r.mrpMinor, r.salePriceMinor),
      })),
    }
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  async get(@Param('id') id: string): Promise<unknown> {
    const row = await withTenantTransaction(this.db, (tx) =>
      tx.product.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!row) throw new NotFoundException('Product not found')
    return { ...row, discountPercent: discountOf(row.mrpMinor, row.salePriceMinor) }
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Add a product to the catalogue' })
  async create(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const input = zodBody(createSchema, body)
    this.assertPricesCoherent(input.mrpMinor, input.salePriceMinor)

    return withTenantTransaction(this.db, (tx) =>
      tx.product.create({
        data: {
          organizationId: p.organizationId,
          name: input.name,
          currency: input.currency ?? 'INR',
          brand: input.brand ?? null,
          sku: input.sku ?? null,
          description: input.description ?? null,
          productUrl: input.productUrl ?? null,
          mrpMinor: input.mrpMinor ?? null,
          salePriceMinor: input.salePriceMinor ?? null,
          imageUrl: input.imageUrl ?? null,
          ...(input.attributes ? { attributes: input.attributes } : {}),
        },
      }),
    )
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const input = zodBody(updateSchema, body)

    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.product.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Product not found')

      // Check the prices as they will be *after* the patch. Validating only the
      // supplied field would let a sale price be raised above an MRP that is not
      // in the request body.
      this.assertPricesCoherent(
        input.mrpMinor === undefined ? existing.mrpMinor : input.mrpMinor,
        input.salePriceMinor === undefined ? existing.salePriceMinor : input.salePriceMinor,
      )

      return tx.product.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.brand === undefined ? {} : { brand: input.brand }),
          ...(input.sku === undefined ? {} : { sku: input.sku }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.productUrl === undefined ? {} : { productUrl: input.productUrl }),
          ...(input.mrpMinor === undefined ? {} : { mrpMinor: input.mrpMinor }),
          ...(input.salePriceMinor === undefined ? {} : { salePriceMinor: input.salePriceMinor }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
          ...(input.attributes === undefined ? {} : { attributes: input.attributes }),
        },
      })
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.product.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Product not found')
      // Soft delete: creatives already generated from this product keep their
      // snapshot, and a campaign that references it does not lose its history.
      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } })
    })
    return { ok: true }
  }

  /**
   * Render this product as a poster, right now, and return the PNG.
   *
   * No model call, no job, no persistence — template plus data straight to
   * pixels in roughly 200ms. This is the endpoint that makes editing a price
   * free, and it is deliberately a GET so a preview is just an `<img src>`.
   */
  @Get(':id/preview')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Render this product as a poster (PNG)' })
  async preview(
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const parsed = previewQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { ratio, campaignId, template: slug, sceneId } = parsed.data

    const template = findTemplate(slug)
    if (!template) throw new BadRequestException(`Unknown template "${slug}"`)

    const { product, campaign, branding, scene } = await withTenantTransaction(
      this.db,
      async (tx) => {
        const [productRow, campaignRow, brandingRow, sceneRow] = await Promise.all([
          tx.product.findFirst({ where: { id, deletedAt: null } }),
          campaignId
            ? tx.campaign.findFirst({ where: { id: campaignId, deletedAt: null } })
            : Promise.resolve(null),
          tx.branding.findFirst(),
          sceneId
            ? tx.mediaAsset.findFirst({
                where: { id: sceneId, deletedAt: null },
                select: { url: true },
              })
            : Promise.resolve(null),
        ])
        return {
          product: productRow,
          campaign: campaignRow,
          branding: brandingRow,
          scene: sceneRow,
        }
      },
    )
    if (!product) throw new NotFoundException('Product not found')

    // Images are fetched here, on a timeout, and inlined — so the render itself
    // performs no I/O and a slow bucket cannot stall a poster.
    const data = await resolveImages({
      ...toCreativeData(product, campaign, branding),
      ...(scene?.url ? { scene: { url: scene.url } } : {}),
    })
    const result = await renderCreative(template.document, data, ratio as AspectRatio)

    void reply
      .header('content-type', 'image/png')
      // Deterministic output, so the hash is a real ETag rather than a guess.
      .header('etag', `"${result.hash}"`)
      .header('cache-control', 'private, max-age=0, must-revalidate')
      .send(result.png)
  }

  /**
   * Render the same poster, but keep it.
   *
   * `preview` returns bytes and stores nothing, which is right for a preview and
   * useless for anything downstream: a post needs a URL that Instagram's servers
   * can fetch, and a download needs a file that survives the request. This runs
   * the identical render, copies the PNG into the bucket, and records a
   * MediaAsset — so one poster can then be downloaded, attached to a post, or
   * both, without rendering twice.
   *
   * Repeat calls with the same product, template and ratio return the existing
   * row rather than filling the bucket with identical files. The render is
   * deterministic and its hash is the key, so "same" is a fact rather than a
   * guess.
   */
  @Post(':id/render')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Render and store this product’s poster, returning its media id' })
  async render(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ mediaId: string; url: string; reused: boolean }> {
    const parsed = renderBodySchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { ratio, template: slug, campaignId, sceneId } = parsed.data

    const template = findTemplate(slug)
    if (!template) throw new BadRequestException(`Unknown template "${slug}"`)

    const { product, campaign, branding, scene } = await withTenantTransaction(
      this.db,
      async (tx) => {
        const [productRow, campaignRow, brandingRow, sceneRow] = await Promise.all([
          tx.product.findFirst({ where: { id, deletedAt: null } }),
          campaignId
            ? tx.campaign.findFirst({ where: { id: campaignId, deletedAt: null } })
            : Promise.resolve(null),
          tx.branding.findFirst(),
          sceneId
            ? tx.mediaAsset.findFirst({
                where: { id: sceneId, deletedAt: null },
                select: { url: true },
              })
            : Promise.resolve(null),
        ])
        return {
          product: productRow,
          campaign: campaignRow,
          branding: brandingRow,
          scene: sceneRow,
        }
      },
    )
    if (!product) throw new NotFoundException('Product not found')

    const data = await resolveImages({
      ...toCreativeData(product, campaign, branding),
      ...(scene?.url ? { scene: { url: scene.url } } : {}),
    })
    const result = await renderCreative(template.document, data, ratio as AspectRatio)

    // The hash covers the template, the data and the ratio, so it identifies this
    // exact poster. Reusing by storage key means a second Post of an unchanged
    // product attaches the file already in the bucket.
    const storageKey = `${principal.organizationId}/products/${id}/${slug}-${ratio.replace(':', 'x')}-${result.hash}`

    const existing = await withTenantTransaction(this.db, (tx) =>
      tx.mediaAsset.findFirst({
        where: { storageKey, deletedAt: null },
        select: { id: true, url: true },
      }),
    )
    // A row whose url is null was never usable; fall through and store again
    // rather than handing back nothing.
    if (existing?.url) return { mediaId: existing.id, url: existing.url, reused: true }

    const stored = await this.storage.persistBytes(result.png, 'image/png', storageKey)
    if (!stored.persisted || !stored.url) {
      throw new ServiceUnavailableException(
        'Storage is not configured, so a poster cannot be kept — set SUPABASE_URL and SUPABASE_SERVICE_KEY.',
      )
    }

    const asset = await withTenantTransaction(this.db, (tx) =>
      tx.mediaAsset.create({
        data: {
          organizationId: principal.organizationId,
          type: 'IMAGE',
          storageKey: stored.storageKey,
          url: stored.url,
          // No prompt and no provider. A template poster is composed, not
          // generated — there was no model and no prompt, and `generatorProvider`
          // only has AI vendors in it. Null is the true answer.
        },
        select: { id: true, url: true },
      }),
    )
    // `stored.url` is the same string, and it is non-null by the check above —
    // used here so the return type needs no assertion on a nullable column.
    return { mediaId: asset.id, url: stored.url, reused: false }
  }

  /**
   * A sale price above the MRP is not a discount, it is a false claim about to
   * be typeset onto an advertisement. Refused at the door.
   */
  private assertPricesCoherent(mrp?: number | null, sale?: number | null): void {
    if (mrp != null && sale != null && sale > mrp) {
      throw new BadRequestException('The sale price cannot be higher than the MRP')
    }
  }
}

/** Shape the rows into exactly what the template engine may read. */
function toCreativeData(
  product: ProductRow,
  campaign: {
    name: string
    theme: string | null
    primaryOffer: string | null
    secondaryOffer: string | null
    couponCode: string | null
    cta: string | null
  } | null,
  branding: { displayName: string | null; logoUrl: string | null; disclaimers: unknown } | null,
): CreativeData {
  // One disclaimer fits a poster; the first configured one is the one that shows.
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
      name: campaign?.name ?? null,
      theme: campaign?.theme ?? null,
      primaryOffer: campaign?.primaryOffer ?? null,
      secondaryOffer: campaign?.secondaryOffer ?? null,
      couponCode: campaign?.couponCode ?? null,
      cta: campaign?.cta ?? null,
    },
    brand: {
      displayName: branding?.displayName ?? null,
      logoUrl: branding?.logoUrl ?? null,
      ...(disclaimer ? { disclaimer } : {}),
    },
    // Until AI visuals land, the product photograph *is* the visual — the real
    // pixels, which is the whole point of the uploaded-image path.
    visual: { url: product.cutoutUrl ?? product.imageUrl },
  }
}
