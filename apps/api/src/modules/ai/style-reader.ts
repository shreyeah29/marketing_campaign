import { AdapterError, getLlmAdapter } from './adapters/llm.js'
import { listAvailableImageModels } from './adapters/openai-media.js'

/**
 * Read a picture once, in words, so it never has to be re-read.
 *
 * The campaign's `referenceImageUrl` sends the picture itself to the image model
 * on every single generation. That works, and it has two costs: the reference
 * has to be re-interpreted every time — so five posters in one run can drift
 * apart — and there is nothing to browse, name or reuse. A client who says
 * "these are the kinds of styles we follow" is describing a library, not an
 * attachment.
 *
 * So the picture is read once, here, into a paragraph a generation prompt can
 * carry. After that the reference image is never needed again: the words are
 * stable, cheap, editable, and identical for every poster in the set.
 *
 * ## Look only, and it has to be enforced
 *
 * The temptation is to capture everything visible, which would include the
 * layout — logo top left, headline over a photograph, footer bar. That would
 * break the poster path. `buildPosterBrief` already composes a layout from the
 * campaign's own offer, dates and products, and a second layout arriving from a
 * saved style would contradict it, with whichever the model happened to weight
 * more winning at random.
 *
 * So the reader is told to describe palette, light, composition *feel*, texture
 * and treatment, and explicitly not to describe text, layout, logos, brand names
 * or products. What survives is the eye, which is the reusable part; the
 * arrangement stays with whoever knows what the campaign is selling.
 *
 * ## And it must not copy anything
 *
 * A reference is very often a competitor's advertisement. Reading its words or
 * its brand marks into a saved style is how someone else's slogan ends up on a
 * client's poster, so those are excluded at the point they are read rather than
 * filtered later.
 */

/**
 * Vision-capable models, in the order they are tried.
 *
 * A short walk for the same reason `imageModelCandidates` is one: which models a
 * project may call is an account setting, and a hard-coded choice means a deploy
 * every time the guess is wrong.
 */
const VISION_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const

/**
 * The models to try, configured one first.
 *
 * This list used to be hard-coded alone, and it failed on a project whose chat
 * model was none of those three — while the brief coach, using the *configured*
 * model, worked perfectly on the same key. The reader was refusing to use the
 * one model already known to answer.
 *
 * So whatever `OPENAI_MODEL` is set to leads. It is demonstrably callable —
 * every campaign brief in the system goes through it — and current OpenAI chat
 * models accept images. The hard-coded names follow as fallbacks.
 */
export function visionModelCandidates(configured?: string | null): readonly string[] {
  const preferred = configured?.trim()
  return [...new Set([...(preferred ? [preferred] : []), ...VISION_MODELS])]
}

const PROVIDER_ID = 'openai'

const SYSTEM = `You describe the visual language of an image so another designer could work in the same style without ever seeing it.

Describe ONLY:
- the colour palette, named concretely (e.g. "warm cream, deep terracotta, muted sage"), and which colour dominates
- the lighting: direction, hardness, warmth, time of day it suggests
- the composition FEEL: how full or sparse, how centred, how much breathing room
- surface and texture: matte, glossy, grainy, painterly, flat vector, photographic
- the overall mood in a few words

Never describe, and never mention:
- any text, headline, word, number or price visible in the image
- the layout: where the logo, headline, footer or any element sits
- logos, brand names, company names, or the products themselves
- anything that identifies whose advertisement this is

Those are deliberately excluded. The layout comes from elsewhere, and copying a brand's words or marks into a reusable style would put someone else's advertising on a client's poster.

Reply with JSON only, no code fence:
{"name":"two or three words, title case, naming the look","summary":"one short sentence a person would recognise it by","look":"one paragraph, 40-90 words, written as direction to a designer"}`

export interface StyleReading {
  readonly name: string
  readonly summary: string
  readonly look: string
}

/** Trim and bound a field, so a chatty model cannot write an essay into a card. */
function clamp(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Ask a vision model what a picture looks like.
 *
 * @param imageUrl A URL from our own storage. It is sent to OpenAI, so an
 * arbitrary caller-supplied address would make this a request forwarder — the
 * controller checks provenance before calling.
 */
export async function readVisualStyle(
  apiKey: string,
  imageUrl: string,
  configuredModel?: string | null,
): Promise<StyleReading> {
  /**
   * The bytes, fetched here rather than handed over as a link.
   *
   * This was passing `imageUrl` straight to OpenAI, which means *their* servers
   * have to reach our bucket. That works only if the bucket is publicly
   * readable, and when it is not the call fails with something unhelpful about
   * the image — which reads as "your picture is bad" when nothing is wrong with
   * the picture at all.
   *
   * The poster path never had this problem because it posts the bytes as
   * multipart. Doing the same here removes the dependency on our storage being
   * reachable from outside, on a signed URL not having expired, and on the
   * bucket's visibility setting — none of which is the caller's problem.
   */
  let dataUrl: string
  try {
    const source = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) })
    if (!source.ok) throw new Error(`storage responded ${String(source.status)}`)
    const contentType = source.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/png'
    const bytes = Buffer.from(await source.arrayBuffer())
    // Guarded because the whole thing is inlined into a JSON request body. A
    // 20MB upload becomes ~27MB of base64 and is refused for length rather than
    // for anything to do with its content.
    if (bytes.byteLength > 8 * 1024 * 1024) {
      throw new AdapterError(
        'That picture is too large to read. Under 8MB works best.',
        PROVIDER_ID,
      )
    }
    dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`
  } catch (err) {
    if (err instanceof AdapterError) throw err
    throw new AdapterError(
      `Could not read the uploaded picture: ${err instanceof Error ? err.message : String(err)}`,
      PROVIDER_ID,
    )
  }

  /**
   * Sent through the shared adapter, not a hand-rolled request.
   *
   * This posted its own body with `temperature` and `max_tokens` set, and broke
   * on exactly the models the brief coach handles fine — because the adapter
   * retries after renaming `max_tokens` to `max_completion_tokens` and dropping
   * a `temperature` the newer models reject, and a second copy of the request
   * inherited none of that.
   *
   * The failure was invisible from the outside: a 400 about an unsupported
   * parameter arrived as "that picture could not be read", pointing at the
   * picture, which was fine.
   */
  const adapter = getLlmAdapter('openai')
  if (!adapter) {
    throw new AdapterError('No OpenAI adapter is registered.', PROVIDER_ID)
  }

  const candidates = visionModelCandidates(configuredModel)

  for (const model of candidates) {
    try {
      const result = await adapter.chat({
        apiKey,
        model,
        maxTokens: 400,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the visual language of this image.' },
              // "low" detail is deliberate: palette, light and texture survive
              // downsampling, and the things high detail would recover — small
              // text, fine logo work — are exactly what must not be read.
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
      })

      const reading = parseReading(result.content)
      if (!reading) {
        throw new AdapterError('The style reader did not describe the picture.', PROVIDER_ID)
      }
      return reading
    } catch (err) {
      // 401/403/404 mean this model is not available to the project — try the
      // next. Anything else says something about the request itself and will
      // fail identically on every other model, so stop.
      const status = err instanceof AdapterError ? err.status : undefined
      if (status !== 401 && status !== 403 && status !== 404) throw err
    }
  }

  /**
   * Every candidate refused. Ask the key what it *can* use, and say so.
   *
   * The same move that ended the image-model guessing loop: without it the error
   * is "none of these worked", and the next step is another guess at a model
   * name, another deploy and another failure. One free request settles whether
   * the key is bad or the names were.
   */
  const available = await listAvailableImageModels(apiKey)
  throw new AdapterError(
    available.unreadable
      ? 'This OpenAI key was rejected when asked what it can do, so it is probably invalid or revoked.'
      : `None of ${candidates.join(', ')} can be read by this OpenAI project. It can see ${String(available.total)} models${available.sample.length > 0 ? `, including: ${available.sample.slice(0, 8).join(', ')}` : ''}. Set OPENAI_MODEL to one of those that accepts images.`,
    PROVIDER_ID,
    // Not 403: this is the exhausted-walk case, and the controller maps 403 to
    // "no vision model enabled" — which would hide the list just gathered.
    502,
  )
}

/**
 * Pull the JSON out of the reply.
 *
 * Models fence JSON in markdown roughly half the time even when told not to, so
 * the first `{` to the last `}` is taken rather than trusting the whole string —
 * the same tolerance the campaign generator's parser has, for the same reason.
 */
export function parseReading(raw: string): StyleReading | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const o = parsed as Record<string, unknown>
  const look = clamp(o['look'], 900)
  // The paragraph is the only field that matters — it is what reaches
  // generation. A reading without one is a failed reading, whatever else it
  // returned, and storing it would create a style that silently does nothing.
  if (look.length < 20) return null

  return {
    name: clamp(o['name'], 40) || 'Saved style',
    summary: clamp(o['summary'], 160),
    look,
  }
}
