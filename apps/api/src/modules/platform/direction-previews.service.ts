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
   * One stored picture's URL, or null.
   *
   * A single-row lookup rather than `all()`, because this runs inside poster
   * generation: reading the whole table to find one row would be a needless
   * query on every picture a client makes.
   */
  async urlFor(directionId: string): Promise<string | null> {
    if (!directionId) return null
    try {
      const row = await this.owner.directionPreview.findUnique({
        where: { directionId },
        select: { url: true },
      })
      return row?.url ?? null
    } catch {
      // A missing reference costs the picture its style guidance and nothing
      // more — the text look still applies. Not worth failing a generation for.
      return null
    }
  }

  /**
   * Draw a batch of the missing ones.
   *
   * @param force Redraw directions that already have a picture.
   * @param limit How many to draw in this call.
   *
   * Batched, and that is the whole point of the parameter. There are 28 AI
   * directions and an image takes 25 to 40 seconds, so drawing the set in one
   * call is a fifteen-minute HTTP request — which no proxy, browser or platform
   * will hold open. The first version did exactly that and simply hung.
   *
   * A batch returns in about two minutes, well inside anything's patience, and
   * `remaining` tells the caller to come back. The client loops; the server
   * never holds a long request.
   *
   * Sequential *within* the batch, because image accounts are metered per minute
   * and firing five at once fails most of them on a limit that means "wait".
   *
   * Each picture is committed the moment it is drawn rather than at the end, so
   * an interrupted run keeps everything it finished. That is what makes this
   * safe to press repeatedly: the next call skips what exists and costs nothing
   * for it.
   *
   * Every failure is collected rather than stopping the run — one refused
   * direction should not deny the rest their picture.
   */
  async generate(
    force: boolean,
    limit = 5,
  ): Promise<{
    made: string[]
    skipped: string[]
    failed: { id: string; reason: string }[]
    /** Still to draw after this batch. Zero means the set is complete. */
    remaining: number
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
        remaining: 0,
      }
    }

    const existing = force ? {} : await this.all()
    // Only AI directions. A template direction's preview is a live render of its
    // own layout, which is exact and free — generating a picture of it would be
    // a worse copy of something we already have.
    const targets = CREATIVE_DIRECTIONS.filter((d) => d.kind === 'ai' && d.look)
    const model = imageModelCandidates(env.OPENAI_IMAGE_MODEL)[0] ?? 'gpt-image-2'

    // Everything still without a picture, before this batch takes its share.
    const outstanding = targets.filter((d) => !existing[d.id])
    for (const direction of targets) {
      if (existing[direction.id]) {
        skipped.push(direction.id)
        continue
      }
      // The batch is full. The rest are reported as remaining and drawn on the
      // next call, which is what keeps this request short enough to complete.
      if (made.length + failed.length >= limit) continue
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

    // Failures count as done for this purpose: a direction the provider refuses
    // will be refused again, and reporting it as "remaining" forever would make
    // the client loop until it gave up.
    const remaining = Math.max(0, outstanding.length - made.length - failed.length)
    this.logger.info(
      { made: made.length, skipped: skipped.length, failed: failed.length, remaining },
      'direction preview batch finished',
    )
    return { made, skipped, failed, remaining }
  }
}
