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
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'
import { isOwnStorageUrl } from '../../infrastructure/storage.js'
import { AdapterError } from './adapters/llm.js'
import { AiService } from './ai.service.js'
import { readVisualStyle } from './style-reader.js'

/**
 * Saved looks — the brand's own styles, browsable and reusable.
 *
 * The request behind this was "if I upload the style references in the brand
 * kit that should create a brand template, and the user can have other templates
 * too" — and, decisively, "they never stick to only one type of poster."
 *
 * That last clause is what makes this a table rather than a setting. A single
 * `visualStyle` field on the brand kit, applied to everything, is the shape we
 * already had, and it cannot express a business that runs festive artwork in
 * October and clean product shots in November. A library can.
 *
 * What is stored is the *look in words*, not the picture. See `style-reader.ts`
 * for why: read once, the description is stable across a set, costs nothing to
 * apply, and can be edited by a person who disagrees with it.
 */

const createSchema = z
  .object({
    /**
     * The uploaded picture, as returned by `/uploads`.
     *
     * Checked against our own storage host before anything fetches it. This URL
     * is sent to OpenAI's vision endpoint, so accepting an arbitrary address
     * would turn this route into a request forwarder aimed wherever a caller
     * points it.
     */
    referenceUrl: z.string().url().max(2000),
    /**
     * Optional. The reader proposes a name from the picture; this overrides it.
     *
     * Most people will not bother, which is the point — being made to name a
     * thing before seeing it is how uploads end up called "style 1".
     */
    name: z.string().trim().min(1).max(40).optional(),
  })
  .strict()

const renameSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    /** The description itself is editable — a reading can be nearly right. */
    look: z.string().trim().min(20).max(900).optional(),
  })
  .strict()

@ApiTags('Style templates')
@Controller('style-templates')
export class StyleTemplatesController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(LOGGER) private readonly logger: AppLogger,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'The workspace’s saved looks' })
  async list(): Promise<{ data: unknown[] }> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.styleTemplate.findMany({
        where: { deletedAt: null },
        // Most-used first: a gallery ordered by upload date puts the newest
        // experiment above the look the business actually runs on.
        orderBy: [{ timesUsed: 'desc' }, { createdAt: 'desc' }],
        take: 60,
      }),
    )
    return { data: rows }
  }

  /**
   * Turn an uploaded picture into a named, reusable look.
   *
   * The vision call happens outside the transaction: it is a network round trip
   * of several seconds, and holding a database connection open across it would
   * starve the pool for everyone else.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Read an uploaded picture into a saved look' })
  async create(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<unknown> {
    const parsed = createSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { referenceUrl, name } = parsed.data

    if (!isOwnStorageUrl(referenceUrl)) {
      throw new BadRequestException(
        'The reference must be a picture uploaded here. Upload it first, then save the style.',
      )
    }

    const openai = this.ai.platformImageKey()
    if (!openai) {
      throw new ServiceUnavailableException(
        'Reading a style needs an OpenAI key, which is not set on this deployment yet.',
      )
    }

    let reading
    try {
      reading = await readVisualStyle(openai.apiKey, referenceUrl)
    } catch (err) {
      this.logger.error(
        {
          organizationId: p.organizationId,
          detail: err instanceof AdapterError ? err.message : String(err),
          status: err instanceof AdapterError ? err.status : undefined,
        },
        'could not read the style from the reference picture',
      )
      throw new ServiceUnavailableException(
        'That picture could not be read just now. Try again, or try a different one — a clear, well-lit design reads best.',
      )
    }

    /**
     * Names collide, and the fix is a suffix rather than an error.
     *
     * The reader proposes a name from what it sees, so two festive posters
     * genuinely do both come back as "Warm Festive". Refusing the second upload
     * over a name the person never chose would be an obstruction, not a
     * safeguard.
     */
    const wanted = name ?? reading.name
    return withTenantTransaction(this.db, async (tx) => {
      const taken = await tx.styleTemplate.findMany({
        where: { deletedAt: null, name: { startsWith: wanted } },
        select: { name: true },
      })
      const names = new Set(taken.map((t) => t.name))
      let finalName = wanted
      for (let n = 2; names.has(finalName) && n < 100; n++) finalName = `${wanted} ${String(n)}`

      return tx.styleTemplate.create({
        data: {
          organizationId: p.organizationId,
          name: finalName,
          referenceUrl,
          look: reading.look,
          ...(reading.summary ? { summary: reading.summary } : {}),
          source: 'UPLOAD',
        },
      })
    })
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Rename a look, or correct how it was read' })
  async update(@Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    const parsed = renameSchema.safeParse(body ?? {})
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { name, look } = parsed.data
    if (name === undefined && look === undefined) {
      throw new BadRequestException('Nothing to change')
    }

    return withTenantTransaction(this.db, async (tx) => {
      // `findFirst`, not `findUnique`: the tenant predicate has to be part of
      // the lookup, or the row is fetched before RLS has any say in it.
      const existing = await tx.styleTemplate.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Style not found')
      return tx.styleTemplate.update({
        where: { id },
        data: { ...(name !== undefined ? { name } : {}), ...(look !== undefined ? { look } : {}) },
      })
    })
  }

  /**
   * Soft delete.
   *
   * Campaigns generated in this style keep their artwork — the look was baked
   * into the prompt at generation time and the pictures are already stored. The
   * foreign key is `ON DELETE SET NULL`, so a campaign whose style is removed
   * simply has no style rather than a dangling reference.
   */
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Remove a saved look' })
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.styleTemplate.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Style not found')
      await tx.styleTemplate.update({ where: { id }, data: { deletedAt: new Date() } })
    })
    return { ok: true }
  }
}
