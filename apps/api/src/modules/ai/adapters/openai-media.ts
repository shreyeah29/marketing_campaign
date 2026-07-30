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
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size: input.size ?? '1024x1024',
    }),
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
