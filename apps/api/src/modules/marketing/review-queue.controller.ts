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

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'
import { OverlayService, type BrandFacts } from '../../infrastructure/overlay.js'
import { StorageService } from '../../infrastructure/storage.js'
import { AdapterError } from '../ai/adapters/llm.js'
import {
  MAX_PROMPT_CHARS,
  generateRunwayImage,
  generateRunwayVideo,
} from '../ai/adapters/runway.js'
import {
  generateImage,
  imageModelCandidates,
  isModelUnavailable,
  listAvailableImageModels,
} from '../ai/adapters/openai-media.js'
import { buildPosterBrief, type PosterCopy } from '../ai/poster-brief.js'
import { buildImageDirection, clampImagePrompt } from '../ai/scene-prompt.js'
import { AiService } from '../ai/ai.service.js'
import { CampaignGenerationService } from '../ai/campaign-generation.service.js'
import { WorkflowEngineService } from '../automation/workflow-engine.service.js'

const generateSchema = z
  .object({
    brief: z.string().min(4).max(4000),
    /**
     * The exact words to typeset on every poster in this run.
     *
     * Typed by the person, not inferred from the brief. The model may still
     * decide a per-concept line where the brief asks for one; this fills in
     * anywhere it did not, so a stated instruction cannot be quietly dropped by
     * a model having an off day.
     */
    posterText: z.string().trim().max(70).optional(),
    /**
     * A poster whose look to follow.
     *
     * Validated as a URL and expected to be one of ours — it comes back from
     * `/uploads`, which re-encodes and stores what was uploaded. The adapter
     * fetches it server-side, so accepting an arbitrary address here would make
     * this endpoint a request forwarder.
     */
    referenceImageUrl: z.string().url().max(2000).optional(),
  })
  .strict()
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
  .object({
    variants: z.number().int().min(1).max(3).optional(),
    /**
     * Replace artwork that already exists. Without it the call is idempotent —
     * see the guard in `generateMedia` for why that matters.
     */
    force: z.boolean().optional(),
  })
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
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * The brand kit's facts, shaped for the artwork stamp.
   *
   * Returns empty on any failure, which the overlay treats as "nothing to
   * stamp" — an organisation that has not filled in its brand kit gets plain
   * artwork rather than an error.
   */
  /**
   * Draw a poster: a designed layout with the words composed into it.
   *
   * Deliberately a separate path rather than a flag on the Runway one, because
   * almost nothing is shared. The prompt asks for the opposite thing — it lists
   * the words and demands them spelled, where the photographic prompt forbids
   * text entirely. The output arrives as inline base64 rather than a hosted URL.
   * And the brand band is *not* stamped on afterwards: the design already
   * carries the name and the handle, and a second copy in a grey strip across
   * the bottom is how a designed poster starts looking like a screenshot.
   *
   * What it will not do is put a price on artwork. Offers go through; rupee
   * figures are stripped in `buildPosterBrief`, and stay the template engine's
   * job where they come from the catalogue and cannot drift.
   */
  private async generatePoster(
    asset: { id: string; title: string | null; body: string; posterText: unknown },
    campaignRow: {
      name: string
      theme: string | null
      targetAudience: unknown
      referenceImageUrl?: string | null
    } | null,
    p: Principal,
    id: string,
  ): Promise<unknown> {
    const openai = this.ai.platformImageKey()
    if (!openai) {
      throw new ServiceUnavailableException(
        'Poster generation is not set up on this deployment yet — it needs an OpenAI key.',
      )
    }

    /**
     * The copy, written by the generator from the campaign's own facts.
     *
     * Nothing here requires a person to have typed anything. The reference
     * poster had twelve lines on it and its author typed none of them — they
     * described the campaign and the model wrote the headline, the offer, the
     * condition, four captions and a date badge. Demanding a headline first
     * would reproduce the input rather than the output.
     *
     * The fallback is the campaign's own name, not an invented line: a poster
     * concept that somehow reached here with no copy still says something true
     * about the campaign it belongs to.
     */
    const poster = readPosterText(asset.posterText) ?? {
      headline: asset.title?.trim() || campaignRow?.name?.trim() || 'Special offer',
    }

    // The reference is stored on the campaign, so every concept in the run is
    // designed with the same eye rather than each one borrowing separately.
    const reference =
      typeof campaignRow?.referenceImageUrl === 'string' ? campaignRow.referenceImageUrl : null

    const { branding, products } = await withTenantTransaction(this.db, async (tx) => ({
      branding: await tx.branding.findFirst(),
      products: await tx.product.findMany({
        where: { deletedAt: null },
        select: { name: true },
        take: 3,
        orderBy: { createdAt: 'desc' },
      }),
    }))

    const prompt = buildPosterBrief({
      headline: poster.headline,
      ...(poster.subline ? { subline: poster.subline } : {}),
      copy: poster,
      scene: asset.body,
      brand: {
        displayName: branding?.displayName ?? null,
        primaryColor: branding?.primaryColor ?? null,
        secondaryColor: branding?.secondaryColor ?? null,
        accentColor: branding?.accentColor ?? null,
        headingFont: branding?.headingFont ?? null,
        // No handle field exists in the brand kit yet, so the poster does not
        // claim one. An invented @handle on printed artwork is worse than a
        // footer with only the name on it.
        instagramHandle: null,
        locationLine: firstOffice(branding?.offices),
      },
      products: products.map((product) => product.name),
      hasReference: Boolean(reference),
      direction: buildImageDirection({
        locations: audienceLocations(campaignRow?.targetAudience),
        theme: campaignRow?.theme ?? campaignRow?.name ?? null,
      }),
    })

    /**
     * A provider refusal is not an internal error.
     *
     * This came back as `403 Project … does not have access to model
     * gpt-image-1` — an account setting, fixable in five minutes by whoever
     * owns the OpenAI project — and reached the screen as "An unexpected error
     * occurred. The incident has been recorded." That sentence sends someone
     * looking for an outage; the log had the answer the whole time and nothing
     * carried it forward.
     *
     * The provider's own text stays in the log rather than the response: it
     * names the project id, and a tenant is not the audience for that.
     */
    /**
     * Walk the candidates and keep the first model this project may use.
     *
     * Which models an account can call is an account setting — `gpt-image-1`
     * needs a verified organisation and is refused with 403 without one — so a
     * hard-coded choice means a deploy every time the guess is wrong. Trying in
     * order costs one wasted round trip on a refusal, which is a 403 in about a
     * second, and means the same build works on an account before and after
     * verification.
     *
     * Only a refusal moves to the next one. A timeout, a rate limit or a content
     * rejection stops the loop: those say something about this request, and
     * retrying them against a weaker model would turn one clear failure into
     * three and end with the wrong explanation.
     */
    const candidates = imageModelCandidates(loadEnv().OPENAI_IMAGE_MODEL)
    let result: Awaited<ReturnType<typeof generateImage>> | null = null
    const refusals: { model: string; detail: string }[] = []
    for (const model of candidates) {
      try {
        result = await generateImage({
          apiKey: openai.apiKey,
          prompt,
          size: '1024x1024',
          model,
          // The endpoint that accepts a reference is not available for dall-e-3,
          // and sending one would 400 rather than being ignored.
          ...(reference && model !== 'dall-e-3' ? { referenceImageUrl: reference } : {}),
        })
        if (model !== candidates[0]) {
          this.logger.warn(
            { assetId: id, model, refusals },
            'poster drawn with a fallback image model',
          )
        }
        break
      } catch (err) {
        if (!isModelUnavailable(err)) {
          this.logger.error(
            { assetId: id, model, detail: err instanceof AdapterError ? err.message : String(err) },
            'poster generation failed',
          )
          throw new ServiceUnavailableException(
            'The poster could not be drawn just now — try again, or switch this concept to a photograph.',
          )
        }
        /**
         * Logged as it happens, not only at the end.
         *
         * These were collected and then thrown away unless every candidate
         * refused — so when the walk stopped early on a different kind of error,
         * the log named that last model and said nothing about why the first two
         * were skipped. The reason the preferred model was refused is the single
         * most useful line in this whole path.
         */
        const detail = err instanceof AdapterError ? err.message : String(err)
        this.logger.warn({ assetId: id, model, detail }, 'image model unavailable, trying the next')
        refusals.push({ model, detail })
      }
    }

    if (!result) {
      /**
       * Every candidate refused. Ask the key what it *can* use, and say so.
       *
       * Without this the log reads "none of these worked" and the next step is
       * another guess at a model name, another deploy and another failure — I
       * have done two of those. One free request settles it: either the key can
       * see image models and the names were wrong, or it can see none, and that
       * is a different problem with a different fix.
       */
      const available = await listAvailableImageModels(openai.apiKey)
      this.logger.error(
        {
          assetId: id,
          refusals,
          imageModels: available.image,
          totalModels: available.total,
          // Compare this against the organisation's rate-limit page. A model
          // listed there and absent here is a project allow-list, not an
          // organisation entitlement — the two are set in different places and
          // only this comparison tells them apart.
          sampleModels: available.sample,
        },
        'no image model available to this project',
      )
      /**
       * Three different problems, three different fixes.
       *
       * "No image models" was one message covering all of them, which still
       * left a person guessing. The count of *all* models separates them: a key
       * that lists chat models but no image ones is a permissions problem on a
       * working key; a key that lists nothing is not a working key.
       */
      throw new ServiceUnavailableException(
        available.image.length > 0
          ? `None of ${candidates.join(', ')} can be used by this OpenAI project. It can use: ${available.image.join(', ')}. Set OPENAI_IMAGE_MODEL to one of those.`
          : available.unreadable
            ? 'This OpenAI key was rejected when asked what it can do, so it is probably invalid, revoked or not an OpenAI key at all. Replace OPENAI_API_KEY. Photography still works in the meantime.'
            : available.total > 0
              ? `This OpenAI key can use ${String(available.total)} models but no image model among them, so ${candidates.join(', ')} were all refused. The key works — the project is not allowed to draw. In the OpenAI dashboard: verify the organisation under Settings → Organization, then allow image models for this project under Settings → Project → Limits. Photography still works in the meantime.`
              : 'This OpenAI key can see no models at all, which means it has no access rather than the wrong access. Check that billing is set up on the OpenAI account and that the key belongs to a project with models enabled. Photography still works in the meantime.',
      )
    }
    const usedFallback = result.model !== candidates[0]

    /**
     * Two shapes, because two models.
     *
     * gpt-image-1 answers with inline base64; dall-e-3 answers with a hosted
     * URL that expires within the hour. Either way the bytes end up in our own
     * bucket before anything is written down — storing a provider URL is the
     * mistake the Runway path was built to stop making, and a fallback is not a
     * reason to make it again.
     */
    const bytes = result.b64 ? Buffer.from(result.b64, 'base64') : await fetchImageBytes(result.url)
    if (!bytes) {
      throw new ServiceUnavailableException('The poster came back in an unexpected shape.')
    }
    const stored = await this.storage.persistBytes(
      bytes,
      'image/png',
      `${p.organizationId}/${id}/poster`,
    )
    if (!stored.persisted || !stored.url) {
      throw new ServiceUnavailableException(
        'The poster could not be stored — set SUPABASE_URL and SUPABASE_SERVICE_KEY.',
      )
    }

    return withTenantTransaction(this.db, async (tx) => {
      await tx.mediaAsset.create({
        data: {
          organizationId: p.organizationId,
          type: 'IMAGE',
          storageKey: stored.storageKey,
          url: stored.url,
          prompt,
          generatorProvider: 'OPENAI',
          generatorModel: result.model,
        },
      })
      const updated = await tx.campaignAsset.update({
        where: { id },
        data: {
          mediaUrl: stored.url,
          status: 'NEEDS_REVIEW',
          aiVersions: { variants: [stored.url] },
        },
      })
      await this.comment(
        tx,
        p,
        id,
        usedFallback
          ? `Poster drawn with ${result.model}. The better image models are not enabled for this OpenAI project — verify the organisation to get them.`
          : `Poster drawn with ${result.model}.`,
        'media.generated',
      )
      return updated
    })
  }

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
    const { brief, posterText, referenceImageUrl } = zodBody(generateSchema, body)
    if (referenceImageUrl !== undefined && !isOwnStorageUrl(referenceImageUrl)) {
      // The adapter fetches this URL from the server, so accepting any address
      // would turn this endpoint into a request forwarder — one that reaches
      // whatever the server can reach, including addresses a caller cannot.
      // Only what `/uploads` issued is accepted.
      throw new BadRequestException('The reference image must be one you uploaded here.')
    }
    return this.generation.generate(p, brief, posterText, referenceImageUrl)
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
    // The campaign comes along for its audience and its theme — see the
    // direction built below. Loaded in the same transaction so a poster cannot
    // be generated against a campaign that was deleted mid-request.
    const { asset, campaignRow } = await withTenantTransaction(this.db, async (tx) => {
      const row = await tx.campaignAsset.findFirst({ where: { id, deletedAt: null } })
      const campaign = row?.campaignId
        ? await tx.campaign.findFirst({
            where: { id: row.campaignId, deletedAt: null },
            select: {
              name: true,
              theme: true,
              targetAudience: true,
              referenceImageUrl: true,
            },
          })
        : null
      return { asset: row, campaignRow: campaign }
    })
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

    /**
     * An asset that already has artwork keeps it.
     *
     * The studio auto-generates any poster concept without media as soon as the
     * screen opens, and it tracked "already started" in a React ref — which dies
     * with the component. Navigating away and back, or reloading, while a
     * generation was still in flight started a *second* one. Runway is
     * non-deterministic, so the poster you had been looking at was replaced by a
     * different picture, and whichever request happened to finish last won. That
     * is how artwork changed after it had been created.
     *
     * The guard belongs here, not in the client: the browser's memory is not a
     * safe place to record that an expensive, irreversible thing has begun. It
     * also makes the call idempotent, so a retry costs nothing rather than
     * another generation.
     *
     * `force` is the explicit "give me a different one" path, used by the retry
     * button — a deliberate click, not an effect firing on mount.
     */
    if (asset.mediaUrl && !input.force) {
      return asset
    }

    /**
     * Which model draws this concept.
     *
     * A poster and a photograph are different jobs and the tools are not
     * interchangeable: Runway photographs beautifully and cannot spell, so every
     * prompt it receives ends with "no text anywhere". A concept whose whole
     * point is the words on it therefore cannot go to Runway — it would come
     * back as the picture with the message missing, which is exactly what
     * happened before this existed.
     *
     * Null reads as PHOTO. Everything created before this column is a
     * photograph, and defaulting the other way would re-route old work to a
     * different model on its next regenerate.
     */
    const wantsPoster = asset.visualStyle === 'POSTER' && asset.kind === 'IMAGE_PROMPT'
    if (wantsPoster) {
      return this.generatePoster(asset, campaignRow, p, id)
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
    // Not a plain join: these concept bodies run past Runway's 1000-character
    // promptText limit, and it answers that with a bare 400. See
    // `clampImagePrompt` for why the trim happens from the middle rather than
    // the end.
    /**
     * Locale and occasion, appended at assembly rather than left to the writer.
     *
     * A Rakshabandhan brief for a Hyderabad café produced two East-Asian faces
     * at a table and no rakhi: "a couple at a café" is what the prompt said, and
     * the model's defaults supplied the rest. The audience was in the brief the
     * whole time and never reached the picture, because nothing required it to.
     */
    const direction = buildImageDirection({
      locations: audienceLocations(campaignRow?.targetAudience),
      theme: campaignRow?.theme ?? campaignRow?.name ?? null,
    })
    const prompt = clampImagePrompt(
      asset.title,
      direction ? `${asset.body} ${direction}` : asset.body,
      MAX_PROMPT_CHARS,
    )
    let urls: string[]
    /**
     * Fetched before generation, not after.
     *
     * The overlay used to be applied while copying the finished images into
     * storage. The copy now happens inside the adapter, the moment each image
     * lands, so the stamp has to travel with it — the callback below closes over
     * these facts and is the only place the bytes are written.
     */
    const brand = await this.brandFacts()

    /**
     * The brand signature, plus whatever this particular poster has to say.
     *
     * `posterText` is decided per concept by the generator, from the brief — a
     * campaign asking for "1+1 this Rakshabandhan" records those words on that
     * one asset, and the picture beside it carries none. The image model is
     * still forbidden from drawing them; it left the space, and this fills it
     * with type that is spelled correctly.
     */
    const poster = readPosterText(asset.posterText)
    const facts = {
      ...brand,
      ...(poster ? { headline: poster.headline, subline: poster.subline ?? null } : {}),
    }
    /**
     * Store under a key that is stable for this asset and variant.
     *
     * Regenerating an asset overwrites its files instead of adding a set beside
     * them. The old key ended in `Date.now()`, so every retry left the previous
     * images in the bucket with nothing in the database pointing at them.
     */
    const keep = (
      variant: number,
    ): { persist: (u: string, k: string) => Promise<string>; storageKey: string } => ({
      persist: (url, key) =>
        this.storage.persistDurable(url, key, (bytes, contentType) =>
          this.overlay.apply(bytes, contentType, facts),
        ),
      storageKey: `${p.organizationId}/${id}/v${String(variant)}`,
    })

    if (asset.kind === 'IMAGE_PROMPT') {
      // A/B variants: images render concurrently so picking a winner costs no
      // extra wall-clock. Video stays single — minutes-long and expensive.
      const count = input.variants ?? 2
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_unused, i) =>
          generateRunwayImage({
            apiKey: runway.apiKey,
            prompt,
            ...(runway.imageModel ? { model: runway.imageModel } : {}),
            ...keep(i),
          }),
        ),
      )
      urls = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.url)
      if (urls.length === 0) {
        // `allSettled` collects the reasons and we were discarding every one of
        // them, so the log said only "Media generation failed" — true, useless,
        // and identical whether the key was rejected, the credits ran out or the
        // model name was wrong. Those need different fixes, so record what the
        // provider actually said. It stays in the log: the client keeps the
        // generic message, because Runway's error text is not the caller's
        // business.
        const reasons = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => {
            const e: unknown = r.reason
            return e instanceof AdapterError
              ? { provider: e.providerId, status: e.status, message: e.message }
              : { message: e instanceof Error ? e.message : String(e) }
          })
        this.logger.error(
          { assetId: id, kind: asset.kind, model: runway.imageModel ?? 'default', reasons },
          'Runway rejected every image variant',
        )
        throw new ServiceUnavailableException('Media generation failed — try again')
      }
    } else {
      const result = await generateRunwayVideo({
        apiKey: runway.apiKey,
        prompt,
        ...(runway.videoModel ? { model: runway.videoModel } : {}),
        ...(runway.imageModel ? { imageModel: runway.imageModel } : {}),
        ...keep(0),
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
    // Already ours: the adapter copied each asset into storage, stamped, as it
    // arrived. Copying again would write identical bytes to a second key.
    const durableUrls = urls

    const primary = durableUrls[0]
    if (!primary) throw new ServiceUnavailableException('Media generation failed — try again')

    return withTenantTransaction(this.db, async (tx) => {
      // Every generated creative also lands in the media library, so the
      // Creative Library can browse everything ever made — approved or not.
      for (const [i, url] of durableUrls.entries()) {
        await tx.mediaAsset.create({
          data: {
            organizationId: p.organizationId,
            type: asset.kind === 'IMAGE_PROMPT' ? 'IMAGE' : 'VIDEO',
            // Indexed from the loop, not `urls.indexOf(url)`: two variants can
            // come back identical, and indexOf would give them the same key.
            storageKey: `${p.organizationId}/${id}/v${String(i)}`,
            url,
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

/**
 * Read the words a poster must carry off the asset.
 *
 * A JSON column is untrusted at the boundary like any other: it survives
 * deploys, so a row written by an older shape can reach newer code. Anything
 * that does not match is treated as absent, which produces a poster with no
 * message rather than a crash while compositing one.
 */
function readPosterText(raw: unknown): PosterCopy | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const str = (key: string): string => {
    const value = o[key]
    return typeof value === 'string' ? value.trim() : ''
  }

  const headline = str('headline')
  if (headline.length === 0) return null

  const features = Array.isArray(o['features'])
    ? o['features'].filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    : []

  return {
    headline,
    ...(str('subline') ? { subline: str('subline') } : {}),
    ...(str('offer') ? { offer: str('offer') } : {}),
    ...(str('offerNote') ? { offerNote: str('offerNote') } : {}),
    ...(str('condition') ? { condition: str('condition') } : {}),
    ...(str('dateLine') ? { dateLine: str('dateLine') } : {}),
    ...(str('footnote') ? { footnote: str('footnote') } : {}),
    ...(features.length > 0 ? { features } : {}),
  }
}

/**
 * Pull place names out of the campaign's stored audience.
 *
 * `targetAudience` is JSON written by the generator, so its shape is a
 * convention rather than a contract — it has arrived as `{ locations: [...] }`
 * and as a `description` string. Both are read, and anything else yields no
 * locations rather than a crash, which costs the picture its locale and nothing
 * else.
 */
function audienceLocations(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const o = raw as { locations?: unknown; description?: unknown }

  if (Array.isArray(o.locations)) {
    return o.locations.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
  }

  // "Ages 18–34 · Hyderabad, Secunderabad · Interests: coffee" — the summary the
  // intake composes. The middle segment is the places.
  if (typeof o.description === 'string') {
    const segment = o.description
      .split('·')
      .map((part) => part.trim())
      .find((part) => /^[A-Z]/.test(part) && !/^(?:Ages|Interests|Languages)\b/i.test(part))
    if (segment) {
      return segment
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
    }
  }
  return []
}

/**
 * The first office line from the brand kit, for the poster's footer.
 *
 * `offices` is `[{ label, value }]` — the same business advertises in several
 * places with a different address in each. The first is used rather than a
 * guess at which one fits; a footer naming the wrong branch is worse than one
 * naming only the business.
 */
function firstOffice(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null
  for (const entry of raw as { label?: unknown; value?: unknown }[]) {
    const value = typeof entry?.value === 'string' ? entry.value.trim() : ''
    if (value) return value
  }
  return null
}

/**
 * Whether a URL is one our own storage issued.
 *
 * The reference image is fetched server-side, so this is the boundary between
 * "a picture the client uploaded" and "any address the server can reach". Host
 * comparison rather than a prefix match on the string: `https://ours.example.co`
 * is a prefix of `https://ours.example.co.attacker.test` and is not the same
 * host.
 */
function isOwnStorageUrl(value: string): boolean {
  const base = loadEnv().SUPABASE_URL
  if (!base) return false
  try {
    return new URL(value).host === new URL(base).host
  } catch {
    return false
  }
}

/**
 * Download a hosted image, or null when it cannot be read.
 *
 * Only the DALL·E 3 fallback needs this — its URLs expire within the hour, so
 * the bytes have to be pulled before anything points at them.
 */
async function fetchImageBytes(url: string | undefined): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
