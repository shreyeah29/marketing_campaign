import type { CreativeData } from '../template/bind.js'

/**
 * Inlining images before rendering.
 *
 * Satori resolves `<img src>` itself, over the network, with no timeout and no
 * failure handling we can reach. That makes rendering — the fast, free half of
 * this system — quietly dependent on a bucket responding, and a missing product
 * photo would take the whole poster down with it.
 *
 * So images are fetched *here*, on a leash, and handed to the renderer as data
 * URIs. Render then touches no network at all, which is what makes it
 * deterministic and what lets a batch of fifty run without fifty racing fetches.
 *
 * A URL that fails is dropped, not thrown: a poster without its product shot is
 * still a poster, and the template's rules already know how to hide a slot whose
 * value is absent.
 */

const FETCH_TIMEOUT_MS = 8_000
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/** Formats Satori can rasterise. Anything else is dropped rather than guessed at. */
const RENDERABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export interface ResolveImagesOptions {
  /** Reuse across a batch so one product's photo is fetched once, not per ratio. */
  readonly cache?: Map<string, string | null>
}

/** Fetch one image and return it as a data URI, or null if it cannot be used. */
async function inline(url: string): Promise<string | null> {
  // Already inline, or a scheme we will not follow. Data URIs pass through;
  // anything else (file:, ftp:, and friends) is refused rather than handed to
  // fetch, since template data can carry a URL a user typed.
  if (url.startsWith('data:')) return url
  if (!/^https?:\/\//i.test(url)) return null

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null

    const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!RENDERABLE.has(type)) return null

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null

    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Replace every image URL in `data` with a data URI.
 *
 * Returns a new object; the input is not mutated, because the same product data
 * is rendered at several ratios and each call must start from the same place.
 */
export async function resolveImages(
  data: CreativeData,
  options: ResolveImagesOptions = {},
): Promise<CreativeData> {
  const cache = options.cache ?? new Map<string, string | null>()

  const resolve = async (url: string | null | undefined): Promise<string | null> => {
    const href = url?.trim()
    if (!href) return null
    const hit = cache.get(href)
    if (hit !== undefined) return hit
    const inlined = await inline(href)
    cache.set(href, inlined)
    return inlined
  }

  const [visual, productImage, logo, scene] = await Promise.all([
    resolve(data.visual?.url),
    resolve(data.product?.imageUrl),
    resolve(data.brand?.logoUrl),
    resolve(data.scene?.url),
  ])

  return {
    ...data,
    ...(data.product ? { product: { ...data.product, imageUrl: productImage } } : {}),
    ...(data.brand ? { brand: { ...data.brand, logoUrl: logo } } : {}),
    visual: { url: visual },
    scene: { url: scene },
  }
}
