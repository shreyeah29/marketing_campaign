import { AdapterError } from './adapters/llm.js'

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
const VISION_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] as const

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
export async function readVisualStyle(apiKey: string, imageUrl: string): Promise<StyleReading> {
  let lastError: unknown = null

  for (const model of VISION_MODELS) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model,
          // Low creativity: this is a description of something that exists, and
          // an inventive reading of it is simply a wrong one.
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe the visual language of this image.' },
                // "low" detail is deliberate: palette, light and texture survive
                // downsampling, and the things high detail would recover — small
                // text, fine logo work — are exactly what must not be read.
                { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
              ],
            },
          ],
        }),
      })

      if (!res.ok) {
        const detail = await res.text()
        lastError = new AdapterError(detail.slice(0, 300), PROVIDER_ID, res.status)
        // 401/403/404 mean this model is not available to the project; anything
        // else is about the request and will fail the same way on the next one.
        if (res.status === 401 || res.status === 403 || res.status === 404) continue
        throw lastError
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[]
      }
      const raw = body.choices?.[0]?.message?.content
      if (typeof raw !== 'string') {
        throw new AdapterError('The style reader returned no text.', PROVIDER_ID)
      }

      const reading = parseReading(raw)
      if (!reading) {
        throw new AdapterError('The style reader did not describe the picture.', PROVIDER_ID)
      }
      return reading
    } catch (err) {
      lastError = err
      // A thrown AdapterError from the non-availability branch above has already
      // been rethrown; reaching here for any other reason means try the next.
      if (err instanceof AdapterError && err.status !== undefined && err.status < 500) {
        if (err.status !== 401 && err.status !== 403 && err.status !== 404) throw err
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AdapterError('No vision model was available to read the picture.', PROVIDER_ID)
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
