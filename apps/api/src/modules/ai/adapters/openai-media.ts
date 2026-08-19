/**
 * OpenAI media adapters — image generation and text-to-speech.
 *
 * These mirror the auth/error conventions of `llm.ts`: a `Bearer` key passed in by
 * the caller (already resolved from the platform environment, never a stored
 * credential), a plain `fetch`, and `AdapterError` on any non-2xx response so the
 * controller can map it to a generic 503 without ever leaking OpenAI's error text
 * to the user.
 */

import { AdapterError } from './llm.js'

const PROVIDER_ID = 'openai'

/** Parse a provider error body into an `AdapterError`, mirroring `llm.ts#readError`. */
async function readError(res: Response): Promise<AdapterError> {
  let detail = `${PROVIDER_ID} request failed (${String(res.status)})`
  try {
    const body = (await res.json()) as { error?: { message?: string }; message?: string }
    const msg = body?.error?.message ?? body?.message
    if (typeof msg === 'string' && msg.length > 0) detail = msg
  } catch {
    // Body was not JSON; keep the generic detail.
  }
  return new AdapterError(detail, PROVIDER_ID, res.status)
}

export interface GenerateImageInput {
  readonly apiKey: string
  readonly prompt: string
  readonly size?: string
  readonly model?: string
  /**
   * A picture to work from — a poster whose look should carry over.
   *
   * Sends the request to `/images/edits` instead of `/images/generations`,
   * which is the endpoint that accepts an image alongside the prompt. The model
   * treats it as a reference rather than a canvas to paint over, so the result
   * is a new poster in that visual language rather than the same poster with
   * different words pasted on.
   */
  readonly referenceImageUrl?: string
}

export interface GenerateImageResult {
  /** Base64-encoded PNG, when the model returns inline image data (gpt-image-1). */
  readonly b64?: string
  /** A hosted URL, when an older model returns one instead of inline data. */
  readonly url?: string
  /** The concrete model that served the request. */
  readonly model: string
}

/**
 * Generates an image via OpenAI's Images API. Defaults to `gpt-image-1`, which
 * always returns inline base64; we read `data[0].b64_json` first and fall back to
 * `data[0].url` for models that return a hosted URL instead.
 */
export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const model = input.model ?? 'gpt-image-1'
  const size = input.size ?? '1024x1024'

  const res = input.referenceImageUrl
    ? await editWithReference(input.apiKey, model, input.prompt, size, input.referenceImageUrl)
    : await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({ model, prompt: input.prompt, size }),
      })
  if (!res.ok) throw await readError(res)

  const data = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[]
  }
  const first = data.data?.[0]
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json : undefined
  const url = typeof first?.url === 'string' ? first.url : undefined
  if (!b64 && !url) {
    throw new AdapterError(`${PROVIDER_ID} returned no image`, PROVIDER_ID)
  }
  return { model, ...(b64 ? { b64 } : {}), ...(url ? { url } : {}) }
}

/**
 * Post the reference image and the prompt to `/images/edits`.
 *
 * Multipart rather than JSON, because the endpoint takes a file. The image is
 * fetched from our own storage — it was uploaded through `/uploads`, which
 * re-encodes and stores it, so this is not a request to an arbitrary address
 * supplied by a caller.
 *
 * A failure to fetch it is raised as an adapter error rather than silently
 * falling back to generating without the reference: a poster that ignores the
 * reference someone chose looks like the feature not working, and is worse than
 * an error that says what went wrong.
 */
async function editWithReference(
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  referenceImageUrl: string,
): Promise<Response> {
  let bytes: ArrayBuffer
  let contentType: string
  try {
    const source = await fetch(referenceImageUrl, { signal: AbortSignal.timeout(20_000) })
    if (!source.ok) throw new Error(`reference responded ${String(source.status)}`)
    contentType = source.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/png'
    bytes = await source.arrayBuffer()
  } catch (err) {
    throw new AdapterError(
      `Could not read the reference image: ${err instanceof Error ? err.message : String(err)}`,
      PROVIDER_ID,
    )
  }

  const form = new FormData()
  form.set('model', model)
  form.set('prompt', prompt)
  form.set('size', size)
  form.set(
    'image',
    new Blob([bytes], { type: contentType }),
    contentType === 'image/jpeg' ? 'reference.jpg' : 'reference.png',
  )

  return fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  })
}

export interface SynthesizeSpeechInput {
  readonly apiKey: string
  readonly text: string
  readonly voice?: string
  readonly model?: string
  readonly format?: string
}

export interface SynthesizeSpeechResult {
  readonly audio: Buffer
  readonly contentType: string
}

/**
 * Synthesizes speech via OpenAI's Audio Speech API. The response body is binary
 * audio, so we read it as an `ArrayBuffer`. Defaults to `gpt-4o-mini-tts` with the
 * `alloy` voice, MP3 output.
 */
export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<SynthesizeSpeechResult> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model ?? 'gpt-4o-mini-tts',
      voice: input.voice ?? 'alloy',
      input: input.text,
      response_format: input.format ?? 'mp3',
    }),
  })
  if (!res.ok) throw await readError(res)

  const audio = Buffer.from(await res.arrayBuffer())
  return { audio, contentType: 'audio/mpeg' }
}
