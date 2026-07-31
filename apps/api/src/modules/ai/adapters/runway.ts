/**
 * Runway media adapter — text-to-image and video generation via Runway's developer
 * API (api.dev.runwayml.com).
 *
 * Operator-level, exactly like `openai-media.ts`: the caller passes a Bearer key
 * already resolved from the platform environment (`RUNWAY_API_KEY`), never a stored
 * per-tenant credential. Any non-2xx response becomes an `AdapterError` so the
 * controller maps it to a generic 503 without ever leaking Runway's error text.
 *
 * Two facts of Runway's API shape this file:
 *   1. There is no text-to-video endpoint. Video is always image-to-video, so a
 *      pure text prompt is realised as text_to_image → image_to_video.
 *   2. Generation is asynchronous. A POST returns a task id; the result is polled
 *      from GET /v1/tasks/{id} until it SUCCEEDs. Runway asks callers not to poll
 *      more than once every five seconds.
 */

import { AdapterError } from './llm.js'

const PROVIDER_ID = 'runway'
const BASE_URL = 'https://api.dev.runwayml.com/v1'
// Runway requires this exact version header on every request.
const API_VERSION = '2024-11-06'

const DEFAULT_IMAGE_MODEL = 'gen4_image'
const DEFAULT_VIDEO_MODEL = 'gen4_turbo'
// Ratios valid for both gen4_image and gen4_turbo; a single value keeps the seed
// frame and the animated video the same shape.
const DEFAULT_RATIO = '1280:720'
const DEFAULT_VIDEO_DURATION = 5

// Runway asks for no more than one poll per 5s. A Gen-4 image lands in ~10-30s and
// a short clip in ~60-180s, so we cap generously and then give up cleanly.
const POLL_INTERVAL_MS = 5_000
const IMAGE_TIMEOUT_MS = 120_000
const VIDEO_TIMEOUT_MS = 300_000

function headers(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    'x-runway-version': API_VERSION,
  }
}

/** Parse a Runway error body into an `AdapterError`, mirroring `openai-media.ts`. */
async function readError(res: Response): Promise<AdapterError> {
  let detail = `${PROVIDER_ID} request failed (${String(res.status)})`
  try {
    const body = (await res.json()) as { error?: string; message?: string }
    const msg = body?.error ?? body?.message
    if (typeof msg === 'string' && msg.length > 0) detail = msg
  } catch {
    // Body was not JSON; keep the generic detail.
  }
  return new AdapterError(detail, PROVIDER_ID, res.status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TaskResponse {
  readonly id?: string
  readonly status?: string
  readonly output?: unknown
  readonly failure?: string
}

/** Create a generation task and return its id. */
async function createTask(apiKey: string, path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res)
  const data = (await res.json()) as TaskResponse
  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new AdapterError(`${PROVIDER_ID} returned no task id`, PROVIDER_ID)
  }
  return data.id
}

/**
 * Poll a task to completion and return its output URLs. Throws on a terminal
 * failure state or when the deadline passes.
 */
async function pollTask(apiKey: string, taskId: string, timeoutMs: number): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // A freshly created task is never ready before one interval; wait first.
    await sleep(POLL_INTERVAL_MS)
    const res = await fetch(`${BASE_URL}/tasks/${taskId}`, { headers: headers(apiKey) })
    if (!res.ok) throw await readError(res)
    const task = (await res.json()) as TaskResponse

    switch (task.status) {
      case 'SUCCEEDED': {
        const output = Array.isArray(task.output)
          ? task.output.filter((u): u is string => typeof u === 'string')
          : []
        if (output.length === 0) {
          throw new AdapterError(`${PROVIDER_ID} succeeded with no output`, PROVIDER_ID)
        }
        return output
      }
      case 'FAILED':
      case 'CANCELLED':
      case 'EXPIRED':
        throw new AdapterError(
          `${PROVIDER_ID} task ${task.status.toLowerCase()}${task.failure ? `: ${task.failure}` : ''}`,
          PROVIDER_ID,
        )
      default:
        // CREATED / QUEUED / RUNNING / THROTTLED — keep waiting.
        break
    }
  }
  throw new AdapterError(`${PROVIDER_ID} task timed out`, PROVIDER_ID)
}

export interface RunwayImageInput {
  readonly apiKey: string
  readonly prompt: string
  readonly ratio?: string
  readonly model?: string
}

export interface RunwayImageResult {
  /** A hosted URL. Runway returns URLs, not inline data; they are ephemeral. */
  readonly url: string
  readonly model: string
}

/** Generate an image from text via Runway's `text_to_image`. */
export async function generateRunwayImage(input: RunwayImageInput): Promise<RunwayImageResult> {
  const model = input.model ?? DEFAULT_IMAGE_MODEL
  const taskId = await createTask(input.apiKey, '/text_to_image', {
    model,
    promptText: input.prompt,
    ratio: input.ratio ?? DEFAULT_RATIO,
  })
  const [url] = await pollTask(input.apiKey, taskId, IMAGE_TIMEOUT_MS)
  return { url: url as string, model }
}

export interface RunwayVideoInput {
  readonly apiKey: string
  readonly prompt: string
  /** Seed image URL. When absent, a first frame is generated from the prompt. */
  readonly promptImage?: string
  readonly ratio?: string
  readonly duration?: number
  readonly model?: string
  readonly imageModel?: string
}

export interface RunwayVideoResult {
  readonly url: string
  readonly model: string
}

/**
 * Generate a video from a text prompt via Runway. Because Runway has no
 * text-to-video endpoint, a first frame is synthesised from the prompt with
 * `text_to_image` and then animated with `image_to_video`.
 */
export async function generateRunwayVideo(input: RunwayVideoInput): Promise<RunwayVideoResult> {
  const model = input.model ?? DEFAULT_VIDEO_MODEL
  const ratio = input.ratio ?? DEFAULT_RATIO

  const promptImage =
    input.promptImage ??
    (
      await generateRunwayImage({
        apiKey: input.apiKey,
        prompt: input.prompt,
        ratio,
        ...(input.imageModel ? { model: input.imageModel } : {}),
      })
    ).url

  const taskId = await createTask(input.apiKey, '/image_to_video', {
    model,
    promptImage,
    promptText: input.prompt,
    ratio,
    duration: input.duration ?? DEFAULT_VIDEO_DURATION,
  })
  const [url] = await pollTask(input.apiKey, taskId, VIDEO_TIMEOUT_MS)
  return { url: url as string, model }
}
