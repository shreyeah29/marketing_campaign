import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'
import { ASPECT_RATIOS } from '@vsp/creative-engine'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { StorageService } from '../../infrastructure/storage.js'

import { generateRunwayImage } from './adapters/runway.js'
import { AiService } from './ai.service.js'
import { buildScenePrompt, RUNWAY_RATIO } from './scene-prompt.js'

/**
 * Campaign scenes — the AI half of the hybrid.
 *
 * A scene is a *background*: a surface, its lighting, and nothing else. The
 * product is composited on top by the template engine using the real
 * photograph, so what publishes is the actual product rather than a model's
 * impression of it.
 *
 * Scenes are stored as `MediaAsset` rows and belong to the campaign, not to a
 * product. That is the whole cost argument: one generation dresses fifty
 * products, so a fifty-product campaign costs one Runway call instead of fifty.
 * Changing a price, a coupon or a template re-renders against the same stored
 * scene and calls nothing.
 */

const generateSchema = z
  .object({
    campaignId: z.string().min(1),
    ratio: z.enum(ASPECT_RATIOS).default('1:1'),
    /** How many to choose between. Each one costs a generation. */
    variants: z.number().int().min(1).max(4).default(3),
    /** Overrides the campaign's own theme when the operator wants something else. */
    theme: z.string().max(200).optional(),
    clearArea: z.enum(['centre', 'left', 'right']).default('centre'),
  })
  .strict()

const listQuerySchema = z.object({ campaignId: z.string().min(1) })

@ApiTags('Scenes')
@RequiresFeature('ai.image')
@Controller('scenes')
export class ScenesController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Scenes generated for a campaign' })
  async list(@Query() q: Record<string, string>): Promise<{ data: unknown[] }> {
    const parsed = listQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.mediaAsset.findMany({
        where: {
          deletedAt: null,
          type: 'IMAGE',
          // Scenes are tagged in generationParams rather than getting their own
          // table: they are media assets in every other respect, and a table
          // whose only difference is a boolean is a column.
          generationParams: { path: ['kind'], equals: 'scene' },
          ...(parsed.data.campaignId
            ? { generationParams: { path: ['campaignId'], equals: parsed.data.campaignId } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, url: true, prompt: true, createdAt: true },
      }),
    )
    return { data: rows }
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE, PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate background scenes for a campaign' })
  async generate(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ data: unknown[] }> {
    const input = zodBody(generateSchema, body)

    const runway = this.ai.platformRunwayKey()
    if (!runway) {
      throw new ServiceUnavailableException(
        'Scene generation is not set up on this deployment yet.',
      )
    }

    const { campaign, settings } = await withTenantTransaction(this.db, async (tx) => {
      const [campaignRow, settingsRow] = await Promise.all([
        tx.campaign.findFirst({ where: { id: input.campaignId, deletedAt: null } }),
        tx.organizationSettings.findFirst(),
      ])
      return { campaign: campaignRow, settings: settingsRow }
    })
    if (!campaign) throw new BadRequestException('Unknown campaign')

    // zod's `.default()` still types as optional under
    // exactOptionalPropertyTypes, so the defaults are restated once here rather
    // than defended at each use.
    const clearArea = input.clearArea ?? 'centre'
    const aspect = input.ratio ?? '1:1'
    const variants = input.variants ?? 3

    const prompt = buildScenePrompt({
      theme: input.theme ?? campaign.theme ?? campaign.name,
      mood: settings?.brandVoice ?? null,
      clearArea,
    })

    // Generated at the poster's own shape, so compositing never crops the scene
    // and loses the calm area the prompt asked for.
    const ratio = RUNWAY_RATIO[aspect] ?? RUNWAY_RATIO['1:1']

    // Concurrent, but settled rather than raced: two of three succeeding is a
    // useful result, and failing the request would throw away work already paid
    // for at the provider.
    const results = await Promise.allSettled(
      Array.from({ length: variants }, () =>
        generateRunwayImage({
          apiKey: runway.apiKey,
          prompt,
          ...(ratio ? { ratio } : {}),
          ...(runway.imageModel ? { model: runway.imageModel } : {}),
        }),
      ),
    )
    const urls = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.url)
    if (urls.length === 0) {
      throw new ServiceUnavailableException('Scene generation failed — try again')
    }

    // Runway's URLs expire, so the scene is copied into our bucket before it is
    // recorded. A scene that outlives its link is the entire point of caching it.
    const stored = await this.storage.persistMany(
      urls,
      `${p.organizationId}/scenes/${input.campaignId}/${Date.now()}`,
    )

    return withTenantTransaction(this.db, async (tx) => {
      const created = []
      for (const [i, item] of stored.entries()) {
        created.push(
          await tx.mediaAsset.create({
            data: {
              organizationId: p.organizationId,
              type: 'IMAGE',
              storageKey: item.persisted
                ? item.storageKey
                : `runway/scene/${input.campaignId}/${String(i)}`,
              url: item.url,
              prompt,
              generatorProvider: 'RUNWAY',
              ...(runway.imageModel ? { generatorModel: runway.imageModel } : {}),
              generationParams: {
                kind: 'scene',
                campaignId: input.campaignId,
                ratio: aspect,
                clearArea,
              },
            },
            select: { id: true, url: true, prompt: true, createdAt: true },
          }),
        )
      }
      return { data: created }
    })
  }
}
