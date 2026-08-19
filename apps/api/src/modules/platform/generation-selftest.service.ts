import { Inject, Injectable } from '@nestjs/common'

import type { AppLogger } from '@marketing-os/observability'

import { loadEnv } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'
import { StorageService } from '../../infrastructure/storage.js'
import {
  generateImage,
  imageModelCandidates,
  listAvailableImageModels,
} from '../ai/adapters/openai-media.js'
import { checkRunwayKey } from '../ai/adapters/runway.js'

/**
 * Can this deployment actually make a picture, and if not, which part is broken?
 *
 * `GET /platform/diagnostics` answers "is the key set". That is a different and
 * much weaker question than "does the key work", and the gap between them is
 * where every incident this month lived: a key that was set and rejected, a key
 * that was valid for chat and not for images, an image that generated and could
 * not be stored. All three present identically — a poster that never appears.
 *
 * Finding out took the same shape every time: change something, deploy, build a
 * whole campaign, watch it fail, read Render's logs, guess again. That loop is
 * expensive in minutes and in provider credits, and it is entirely avoidable,
 * because each step can be checked directly in about a second.
 *
 * So this walks the real path in order — key present, key accepted, a model this
 * project may use, an actual drawing, an actual upload — and reports every step
 * with what to do about it. The first failure is the answer; the steps after it
 * are skipped rather than guessed at, because a storage check means nothing when
 * nothing was drawn.
 *
 * Two rules it inherits from the diagnostics endpoint next door:
 *
 * - **Never echo a secret.** Keys are reported as present or absent and their
 *   provider text is summarised, never forwarded. A self-test that prints the
 *   key it tested is a credential-exfiltration endpoint with a helpful name.
 * - **Operator plane only.** It names models, providers and configuration, which
 *   is operator business and not a tenant's.
 */

export type StepStatus = 'pass' | 'fail' | 'skip'

export interface SelfTestStep {
  /** Stable id, so the console can key rows without matching on prose. */
  readonly id: string
  /** What was tried, in the order a person would try it by hand. */
  readonly label: string
  readonly status: StepStatus
  /**
   * The result, and when it failed, the fix.
   *
   * Written to be the last thing anyone needs to read: not "storage error" but
   * which environment variable to set. The whole point is that this replaces a
   * round trip through the deployment logs.
   */
  readonly detail: string
}

export interface SelfTestResult {
  readonly ok: boolean
  readonly ranAt: string
  /** Whether a real picture was drawn, which is the part that costs money. */
  readonly drew: boolean
  readonly steps: readonly SelfTestStep[]
}

/**
 * Small, cheap, and unmistakably a test.
 *
 * A plain shape on a plain background: nothing to refuse on content grounds,
 * nothing that could be mistaken for a client's artwork if it turns up in a
 * bucket listing.
 */
const PROBE_PROMPT = 'A plain flat-colour circle centred on a plain background. No text, no detail.'

@Injectable()
export class GenerationSelfTestService {
  constructor(
    @Inject(LOGGER) private readonly logger: AppLogger,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /**
   * @param draw Actually generate and store a picture. Costs one image.
   *
   * Off by default because it bills the account, and most of the time the answer
   * is found before this step — a rejected key fails at step two and drawing
   * would only fail again more slowly. When something subtler is wrong (the key
   * lists a model it cannot actually call, or storage is misconfigured) this is
   * the only step that finds it.
   */
  async run(draw: boolean): Promise<SelfTestResult> {
    const env = loadEnv()
    const steps: SelfTestStep[] = []
    const add = (step: SelfTestStep): SelfTestStep => {
      steps.push(step)
      return step
    }

    // ── 1. Is there an OpenAI key at all? ──────────────────────────────────
    const openaiKey = env.OPENAI_API_KEY
    if (!openaiKey) {
      add({
        id: 'openai-key',
        label: 'OpenAI key is set',
        status: 'fail',
        detail:
          'OPENAI_API_KEY is not set on this service. Posters cannot be drawn without it. Set it on both the API and the worker — they are separate services and each reads its own environment.',
      })
      return this.finish(steps, false)
    }
    add({
      id: 'openai-key',
      label: 'OpenAI key is set',
      status: 'pass',
      detail: 'Present in this process.',
    })

    // ── 2. Does OpenAI accept it? ──────────────────────────────────────────
    const report = await listAvailableImageModels(openaiKey)
    if (report.unreadable) {
      add({
        id: 'openai-reachable',
        label: 'OpenAI accepts the key',
        status: 'fail',
        detail:
          'OpenAI rejected the key when asked what it can do, so it is probably invalid, revoked, or not an OpenAI key at all. Replace OPENAI_API_KEY.',
      })
      return this.finish(steps, false)
    }
    add({
      id: 'openai-reachable',
      label: 'OpenAI accepts the key',
      status: 'pass',
      detail: `The key can see ${String(report.total)} models.`,
    })

    // ── 3. Is one of them a model we would actually call? ──────────────────
    /**
     * The listing and the candidate list, compared.
     *
     * This is the step that would have ended the gpt-image-1 afternoon in
     * seconds. The organisation's rate-limit page showed the model; the project
     * the key belonged to could not call it; and from the outside those look
     * identical. Naming both lists side by side is what tells them apart.
     */
    const candidates = imageModelCandidates(env.OPENAI_IMAGE_MODEL)
    const usable = candidates.filter((c) => report.image.includes(c))
    if (usable.length === 0) {
      add({
        id: 'openai-image-model',
        label: 'An image model this project may use',
        status: 'fail',
        detail:
          report.image.length > 0
            ? `None of ${candidates.join(', ')} are available to this key, but it can use: ${report.image.join(', ')}. Set OPENAI_IMAGE_MODEL to one of those.`
            : `This key can use ${String(report.total)} models and none of them draw. The key works — the project is not allowed to draw. In the OpenAI dashboard: verify the organisation under Settings → Organization, then allow image models under Settings → Project → Limits.`,
      })
      return this.finish(steps, false)
    }
    add({
      id: 'openai-image-model',
      label: 'An image model this project may use',
      status: 'pass',
      detail: `${usable.join(', ')} — ${String(usable[0])} will be tried first.`,
    })

    // ── 4. Storage configuration, checked before anything is drawn. ────────
    /**
     * Deliberately ahead of the draw.
     *
     * Drawing first and then discovering the bucket is unset means paying for a
     * picture to learn something that was knowable for free — and that is
     * exactly the order the real path runs in, which is how a generated poster
     * ended up with nowhere to go.
     */
    const storageConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY)
    add({
      id: 'storage-config',
      label: 'Durable storage is configured',
      status: storageConfigured ? 'pass' : 'fail',
      detail: storageConfigured
        ? 'SUPABASE_URL and SUPABASE_SERVICE_KEY are both set.'
        : 'SUPABASE_URL and SUPABASE_SERVICE_KEY are not both set. Pictures would be stored as the provider’s own URL, which expires within days — last month’s posters become broken links. Set both, on the API and the worker.',
    })

    // ── 5 & 6. The real thing: draw, then store. ───────────────────────────
    if (!draw) {
      add({
        id: 'openai-draw',
        label: 'Draw a test picture',
        status: 'skip',
        detail: 'Not attempted — this step bills the account for one image.',
      })
      add({
        id: 'storage-write',
        label: 'Store the test picture',
        status: 'skip',
        detail: 'Nothing was drawn, so there was nothing to store.',
      })
    } else {
      const drawn = await this.drawProbe(openaiKey, usable)
      add(drawn.step)
      if (!drawn.bytes) {
        add({
          id: 'storage-write',
          label: 'Store the test picture',
          status: 'skip',
          detail: 'Nothing was drawn, so there was nothing to store.',
        })
      } else {
        add(await this.storeProbe(drawn.bytes))
      }
    }

    // ── 7. Runway, for photography and video. ──────────────────────────────
    /**
     * Checked, and counted against the verdict, but it does not stop the walk.
     *
     * The two providers do different jobs — OpenAI designs posters, Runway
     * photographs and films — so one being broken does not stop the other being
     * worth reporting. That is why this runs after the OpenAI steps rather than
     * short-circuiting them, and why the console lists every step rather than a
     * single verdict: the useful answer is usually "posters work, photography
     * does not", and one word cannot say that.
     *
     * It does still count as a failure. A deployment that cannot photograph is
     * not a working deployment, and `ok` meaning "everything on this list works"
     * is the only definition that stays honest as steps are added.
     */
    await this.checkRunway(env.RUNWAY_API_KEY, add)

    return this.finish(
      steps,
      steps.every((s) => s.status !== 'fail'),
    )
  }

  /** Draw the probe, walking the usable models exactly as the real path does. */
  private async drawProbe(
    apiKey: string,
    usable: readonly string[],
  ): Promise<{ step: SelfTestStep; bytes?: Buffer }> {
    let lastDetail = 'No model was tried.'
    for (const model of usable) {
      try {
        const result = await generateImage({
          apiKey,
          prompt: PROBE_PROMPT,
          size: '1024x1024',
          model,
        })
        const bytes = result.b64 ? Buffer.from(result.b64, 'base64') : await fetchBytes(result.url)
        if (!bytes) {
          lastDetail = `${model} answered, but in a shape with no image in it.`
          continue
        }
        return {
          step: {
            id: 'openai-draw',
            label: 'Draw a test picture',
            status: 'pass',
            detail: `${model} returned an image of ${String(Math.round(bytes.byteLength / 1024))} KB.`,
          },
          bytes,
        }
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : String(err)
        this.logger.warn({ model, detail: lastDetail }, 'self-test: image model refused')
      }
    }
    return {
      step: {
        id: 'openai-draw',
        label: 'Draw a test picture',
        status: 'fail',
        detail: `Every usable model refused. The last said: ${lastDetail.slice(0, 200)}`,
      },
    }
  }

  /** Upload the probe and confirm a durable URL comes back. */
  private async storeProbe(bytes: Buffer): Promise<SelfTestStep> {
    try {
      const stored = await this.storage.persistBytes(bytes, 'image/png', 'platform/self-test/probe')
      if (!stored.persisted) {
        return {
          id: 'storage-write',
          label: 'Store the test picture',
          status: 'fail',
          detail:
            'The upload did not happen, so the provider’s temporary URL would have been stored instead. Check SUPABASE_URL, SUPABASE_SERVICE_KEY, and that the bucket exists and is writable by the service key.',
        }
      }
      return {
        id: 'storage-write',
        label: 'Store the test picture',
        status: 'pass',
        detail: 'Uploaded, and a durable URL came back.',
      }
    } catch (err) {
      return {
        id: 'storage-write',
        label: 'Store the test picture',
        status: 'fail',
        detail: `The upload threw: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
      }
    }
  }

  /** Runway's key, checked without generating anything. */
  private async checkRunway(
    key: string | undefined,
    add: (step: SelfTestStep) => SelfTestStep,
  ): Promise<void> {
    if (!key) {
      add({
        id: 'runway-key',
        label: 'Runway key is set',
        status: 'fail',
        detail:
          'RUNWAY_API_KEY is not set. Photography and video cannot be generated; designed posters are unaffected because those go to OpenAI.',
      })
      return
    }
    add({
      id: 'runway-key',
      label: 'Runway key is set',
      status: 'pass',
      detail: 'Present in this process.',
    })

    const check = await checkRunwayKey(key)
    add({
      id: 'runway-reachable',
      label: 'Runway accepts the key',
      status: check.ok ? 'pass' : 'fail',
      detail: check.ok
        ? 'The key was accepted.'
        : check.status === 401 || check.status === 403
          ? 'Runway rejected the key. It is expired, revoked, or belongs to another account.'
          : `Runway did not accept the key (${check.status ? String(check.status) : 'no response'}). Photography and video will fail until this clears.`,
    })
  }

  private finish(steps: readonly SelfTestStep[], ok: boolean): SelfTestResult {
    /**
     * Logged as one line with the outcome of every step.
     *
     * The console shows this to whoever pressed the button; the log is for
     * afterwards, when the question is "was this already broken on Tuesday".
     */
    this.logger.info(
      { ok, steps: steps.map((s) => ({ id: s.id, status: s.status })) },
      'generation self-test finished',
    )
    return {
      ok,
      ranAt: new Date().toISOString(),
      drew: steps.some((s) => s.id === 'openai-draw' && s.status === 'pass'),
      steps,
    }
  }
}

/** Pull bytes from a hosted URL, for the models that answer with one. */
async function fetchBytes(url: string | undefined): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
