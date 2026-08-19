import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One sample picture per AI direction, shipped beside the code.
 *
 * These began as generated files in object storage, written once per deployment
 * by an operator button. That worked and was still wrong four ways: it cost a
 * set of images every time a fresh environment came up, staging and production
 * ended up with different pictures on the same card, a deployment that had never
 * pressed the button showed blank cards, and nothing appeared at all until an
 * OpenAI key was configured.
 *
 * A sample is a fixed property of a direction, exactly as a template's layout is
 * a fixed property of the template. It belongs with the code, not in a bucket
 * that varies per environment.
 *
 * ## They are the reference, not decoration
 *
 * The important use is the second one. A direction used to contribute a
 * *paragraph* describing its look; it now also contributes the picture, sent to
 * the image model as the reference. "Make it look like this" is a far stronger
 * instruction than a sentence of adjectives, and `buildPosterBrief` already
 * knows to take a reference's visual language and none of its content — which is
 * why a sample showing a coffee cup can direct a festival poster without a cup
 * appearing anywhere in it.
 *
 * Read from disk rather than fetched: no origin to configure, no URL to expire,
 * and nothing to be unavailable at the moment somebody generates.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * `apps/api/assets/creative-directions`.
 *
 * Resolved from this module rather than from `process.cwd()`, which is whatever
 * directory the process happened to start in and differs between a local run, a
 * test and the deployed container.
 *
 * Three levels up lands on `apps/api` from *both* `src/modules/ai` and
 * `dist/modules/ai`, because `tsc` mirrors the source tree under `dist` — the
 * two are the same depth. That is why one path works in development and in
 * production. Moving this file changes the number of levels, so it moves with
 * the constant or not at all.
 */
const SAMPLES_DIR = resolve(HERE, '../../../assets/creative-directions')

/**
 * Ids are used as filenames, so they are checked before they touch a path.
 *
 * Every real id is lowercase letters, digits and hyphens. Anything else is
 * refused rather than sanitised — a caller passing `../../etc/passwd` is not
 * making a typo, and quietly stripping the dots would leave a reader unsure
 * whether traversal was possible.
 */
const SAFE_ID = /^[a-z0-9-]{1,64}$/

export interface DirectionSample {
  readonly bytes: Buffer
  readonly contentType: string
}

/**
 * A one-entry-per-direction cache.
 *
 * The files never change while the process runs — they are committed assets, not
 * uploads — so re-reading them on every generation and every gallery render is
 * pure disk traffic. `null` is cached too, so a direction with no committed
 * sample yet does not stat the filesystem on every request.
 */
const cache = new Map<string, DirectionSample | null>()

export async function readDirectionSample(id: string): Promise<DirectionSample | null> {
  if (!SAFE_ID.test(id)) return null
  const cached = cache.get(id)
  if (cached !== undefined) return cached

  let sample: DirectionSample | null = null
  for (const [ext, contentType] of [
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['jpg', 'image/jpeg'],
  ] as const) {
    try {
      const bytes = await readFile(join(SAMPLES_DIR, `${id}.${ext}`))
      sample = { bytes, contentType }
      break
    } catch {
      // Missing is the ordinary case for a direction whose sample has not been
      // committed yet, and the card falls back to a placeholder.
    }
  }
  cache.set(id, sample)
  return sample
}

/** Whether a direction has a committed sample, for the gallery to decide what to show. */
export async function hasDirectionSample(id: string): Promise<boolean> {
  return (await readDirectionSample(id)) !== null
}
