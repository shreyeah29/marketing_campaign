import { createHash } from 'node:crypto'

import satori from 'satori'
import sharp from 'sharp'

import type { CreativeData } from '../template/bind.js'
import type { AspectRatio, TemplateDocument } from '../template/schema.js'

import { loadFonts } from './fonts.js'
import { buildTree } from './layout.js'

/**
 * Rendering a creative: template + data → PNG.
 *
 * Two stages, both deterministic. Satori lays the document out and emits SVG;
 * sharp rasterises that SVG to PNG. Neither stage calls a model, neither touches
 * the network, and the whole thing runs in roughly 200ms — which is the point.
 * Editing a price must not cost what generating a poster costs.
 *
 * Determinism is load-bearing: identical inputs produce identical bytes, so
 * `renderHash` can skip a re-render that would change nothing. On a fifty-product
 * batch where one product changed, that is the difference between fifty renders
 * and one.
 */

export interface RenderResult {
  readonly png: Buffer
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly ratio: AspectRatio
  /** Stable fingerprint of (template, version, data, ratio). */
  readonly hash: string
}

/**
 * A fingerprint of everything that affects the output.
 *
 * Includes the template *version* rather than only its id: a template edit must
 * invalidate every creative built from it, and an id alone would silently serve
 * the old render forever.
 */
export function renderHash(
  template: TemplateDocument,
  data: CreativeData,
  ratio: AspectRatio,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ t: template, d: data, r: ratio }))
    .digest('hex')
    .slice(0, 32)
}

export async function renderCreative(
  template: TemplateDocument,
  data: CreativeData,
  ratio: AspectRatio,
): Promise<RenderResult> {
  const fonts = await loadFonts()
  const { element, width, height } = buildTree(template, data, ratio)

  const svg = await satori(element as never, {
    width,
    height,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: f.style,
    })),
    // Satori would fetch any remaining URL itself, unbounded and untimed.
    // Callers inline images with `resolveImages` first, so this only ever fires
    // on a URL that slipped through — and it refuses rather than fetching.
    loadAdditionalAsset: async () => '',
  })

  const png = await sharp(Buffer.from(svg)).png().toBuffer()

  return { png, svg, width, height, ratio, hash: renderHash(template, data, ratio) }
}

/**
 * Render every ratio the template declares.
 *
 * Sequential rather than parallel: each render is CPU-bound, and the worker
 * already runs several creatives at once. Racing the ratios inside one job would
 * just contend with the jobs beside it.
 */
export async function renderAllRatios(
  template: TemplateDocument,
  data: CreativeData,
): Promise<RenderResult[]> {
  const out: RenderResult[] = []
  for (const ratio of template.ratios) {
    out.push(await renderCreative(template, data, ratio))
  }
  return out
}
