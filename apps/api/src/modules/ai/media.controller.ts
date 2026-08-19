import {
  BadRequestException,
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

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Everything the generators have ever made, and a way to keep it.
 *
 * Product shots, transformed photographs and background scenes are all written
 * as `MediaAsset` rows the moment they are generated — the bytes have never been
 * at risk. What was missing was any way to *see* them: the media library reads
 * campaign assets and creatives, neither of which these are, so a picture
 * someone paid to generate was visible exactly once, in the tab that made it,
 * and gone on the next reload.
 *
 * That is the bug this closes. Generated work is durable, and now it is also
 * findable.
 *
 * ## Two different libraries, on purpose
 *
 * `GET /media` is everything ever generated — a working drawer, unfiltered and
 * unjudged. `POST /media/:id/keep` promotes one into the reviewed library beside
 * approved campaign work, which is the shelf a person actually publishes from.
 *
 * Collapsing them would mean either burying good work among experiments, or
 * deleting experiments to keep the library clean. Both are worse than two
 * places with an explicit step between them.
 */

const listQuerySchema = z.object({
  /** 'shot' | 'transform' | 'scene'. Omitted returns everything. */
  kind: z.string().max(24).optional(),
  productId: z.string().max(64).optional(),
})

const keepSchema = z
  .object({
    /** What to call it in the library. Defaults to something descriptive. */
    title: z.string().trim().max(200).optional(),
  })
  .strict()

/** `generationParams` is JSON, so every read of it is defensive. */
function paramOf(params: unknown, key: string): string | null {
  if (typeof params !== 'object' || params === null) return null
  const value = (params as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Every picture the generators have made' })
  async list(@Query() q: Record<string, string>): Promise<{ data: unknown[] }> {
    const parsed = listQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { kind, productId } = parsed.data

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.mediaAsset.findMany({
        where: {
          deletedAt: null,
          type: 'IMAGE',
          // Filtering on a JSON path rather than a column because `kind` was
          // always written there. A column would be tidier and a migration that
          // backfilled it would be a lie about rows written before it existed.
          ...(kind ? { generationParams: { path: ['kind'], equals: kind } } : {}),
          ...(productId ? { generationParams: { path: ['productId'], equals: productId } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          url: true,
          createdAt: true,
          generatorProvider: true,
          generatorModel: true,
          generationParams: true,
        },
      }),
    )

    return {
      data: rows.map((r) => ({
        id: r.id,
        url: r.url,
        createdAt: r.createdAt,
        provider: r.generatorProvider,
        model: r.generatorModel,
        kind: paramOf(r.generationParams, 'kind'),
        productId: paramOf(r.generationParams, 'productId'),
        directionId: paramOf(r.generationParams, 'directionId'),
        // Deliberately not the prompt. It is not shown anywhere in the product,
        // by request, and shipping it to every gallery render is weight for
        // something nobody reads.
      })),
    }
  }

  /**
   * Promote a generated picture into the reviewed library.
   *
   * It becomes a `CampaignAsset` — the shape the media library, the review queue
   * and the publisher all already understand — so a kept picture can be
   * scheduled and posted like anything else. `APPROVED` rather than pending,
   * because pressing keep on a picture you are looking at *is* the review; a
   * second approval step for something you just chose is ceremony.
   *
   * No campaign. These are made outside one, and inventing a campaign to hold a
   * picture would put a row in the campaign list that nobody created.
   */
  @Post(':id/keep')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  @ApiOperation({ summary: 'Keep a generated picture in the library' })
  async keep(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const parsed = keepSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)

    return withTenantTransaction(this.db, async (tx) => {
      // `findFirst`, not `findUnique`: the tenant predicate has to be part of
      // the lookup rather than applied to a row already fetched.
      const media = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } })
      if (!media?.url) throw new NotFoundException('Picture not found')

      // Idempotent by URL. Pressing keep twice on the same picture is a double
      // click, not a request for two copies of it in the library.
      const existing = await tx.campaignAsset.findFirst({
        where: { mediaUrl: media.url, deletedAt: null },
      })
      if (existing) return existing

      return tx.campaignAsset.create({
        data: {
          organizationId: p.organizationId,
          platform: 'GENERIC',
          kind: 'IMAGE_PROMPT',
          status: 'APPROVED',
          title: parsed.data.title ?? 'Generated picture',
          // The concept body is where a prompt would live. These were made from
          // a direction rather than a written concept, so it stays empty rather
          // than holding prompt text the product deliberately never shows.
          body: '',
          mediaUrl: media.url,
          aiVersions: { variants: [media.url] },
        },
      })
    })
  }
}
