import { Inject, Injectable } from '@nestjs/common'

import { createAdminClient, type PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import { loadEnv } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'
import { StorageService } from '../../infrastructure/storage.js'
import { generateImage, imageModelCandidates } from '../ai/adapters/openai-media.js'
import { CREATIVE_DIRECTIONS } from '../ai/creative-directions.js'

/**
 * Generate one true example of each AI direction, once, for everybody.
 *
 * The shelf shows real renders for template directions — those come free, the
 * layout engine draws them exactly. AI directions had nothing to show, so the
 * cards were blank, because the alternative was stock artwork that promises
 * output nobody has seen.
 *
 * This is the honest version: generate a genuine example with the same pipeline
 * a client's own campaign runs through, keep it, and show that.
 *
 * ## Why one set serves every tenant
 *
 * A direction is ours and identical in every workspace, so its example is too.
 * Generating per tenant would bill each of them to discover what the same eight
 * looks look like, and the pictures would differ slightly for no reason anyone
 * benefits from.
 *
 * ## Why the subject is deliberately generic
 *
 * The card is judged on palette, light and mood — not on the coffee cup. A
 * preview built from a real client's product would be that client's artwork
 * appearing on every other client's screen, and a preview with words on it would
 * be judged on spelling instead of style.
 */

/**
 * The neutral subject every preview is drawn around.
 *
 * One subject across all of them so the shelf is comparable: a row where the
 * palette changes *and* the subject changes tells you nothing about either.
 */
const PREVIEW_SUBJECT =
  'A single ceramic coffee cup on a plain surface, centred, with a small sprig of greenery beside it.'

@Injectable()
export class DirectionPreviewsService {
  private readonly owner: PrismaClient

  constructor(
    @Inject(LOGGER) private readonly logger: AppLogger,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {
    this.owner = createAdminClient(loadEnv().DIRECT_DATABASE_URL ?? loadEnv().DATABASE_URL)
  }

  /** Every stored preview, as `{ directionId: url }`. Read by the shelf. */
  async all(): Promise<Record<string, string>> {
    try {
      const rows = await this.owner.directionPreview.findMany({
        select: { directionId: true, url: true },
      })
      return Object.fromEntries(rows.map((r) => [r.directionId, r.url]))
    } catch (err) {
      // A shelf without previews is the state it shipped in and still works.
      // Failing the whole catalogue because its pictures are unavailable would
      // turn a cosmetic problem into a broken screen.
      this.logger.warn(
        { detail: err instanceof Error ? err.message : String(err) },
        'could not read direction previews',
      )
      return {}
    }
  }

  /**
   * Draw the missing ones.
   *
   * @param force Redraw directions that already have a preview.
   *
   * Sequential rather than parallel, and skipping what exists: image accounts
   * are metered per minute, and firing eighteen at once fails most of them on a
   * limit that means "wait". Skipping also makes this safe to press twice — the
   * second press costs nothing rather than regenerating the set.
   *
   * Every failure is collected and reported rather than stopping the run. One
   * refused direction should not deny the other seventeen their preview.
   */
  async generate(force: boolean): Promise<{
    made: string[]
    skipped: string[]
    failed: { id: string; reason: string }[]
  }> {
    const env = loadEnv()
    const made: string[] = []
    const skipped: string[] = []
    const failed: { id: string; reason: string }[] = []

    if (!env.OPENAI_API_KEY) {
      return {
        made,
        skipped,
        failed: [{ id: 'all', reason: 'OPENAI_API_KEY is not set on this service.' }],
      }
    }

    const existing = force ? {} : await this.all()
    // Only AI directions. A template direction's preview is a live render of its
    // own layout, which is exact and free — generating a picture of it would be
    // a worse copy of something we already have.
    const targets = CREATIVE_DIRECTIONS.filter((d) => d.kind === 'ai' && d.look)
    const model = imageModelCandidates(env.OPENAI_IMAGE_MODEL)[0] ?? 'gpt-image-2'

    for (const direction of targets) {
      if (existing[direction.id]) {
        skipped.push(direction.id)
        continue
      }
      try {
        const result = await generateImage({
          apiKey: env.OPENAI_API_KEY,
          prompt: [
            PREVIEW_SUBJECT,
            direction.look ?? '',
            'No text, words, letters, numbers or logos anywhere in the image.',
          ].join(' '),
          size: '1024x1024',
          model,
        })
        const bytes = result.b64 ? Buffer.from(result.b64, 'base64') : null
        if (!bytes) {
          failed.push({ id: direction.id, reason: 'The model returned no image data.' })
          continue
        }

        const storageKey = `platform/direction-previews/${direction.id}`
        const stored = await this.storage.persistBytes(bytes, 'image/png', storageKey)
        if (!stored.persisted || !stored.url) {
          failed.push({
            id: direction.id,
            reason: 'Storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY.',
          })
          continue
        }

        await this.owner.directionPreview.upsert({
          where: { directionId: direction.id },
          create: {
            directionId: direction.id,
            url: stored.url,
            storageKey: stored.storageKey,
            model: result.model,
          },
          update: { url: stored.url, storageKey: stored.storageKey, model: result.model },
        })
        made.push(direction.id)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        this.logger.warn({ directionId: direction.id, reason }, 'direction preview failed')
        // Trimmed: this reaches an operator screen, and a provider's full text
        // can name the project and the account.
        failed.push({ id: direction.id, reason: reason.slice(0, 160) })
      }
    }

    this.logger.info(
      { made: made.length, skipped: skipped.length, failed: failed.length },
      'direction previews generated',
    )
    return { made, skipped, failed }
  }
}
