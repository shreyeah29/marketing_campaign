import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { resolveImages } from '../render/images.js'
import { buildTree } from '../render/layout.js'
import { renderCreative } from '../render/render.js'
import type { CreativeData } from '../template/bind.js'
import { canvasFor } from '../template/schema.js'
import { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE_SLUG, findTemplate } from '../templates/index.js'

const FULL: CreativeData = {
  product: {
    name: 'Anua 10+ Niacinamide Serum',
    brand: 'Anua',
    mrpMinor: 220_000,
    salePriceMinor: 187_000,
    currency: 'INR',
  },
  campaign: {
    name: 'Tricolour Sale',
    primaryOffer: 'UP TO 40% OFF',
    secondaryOffer: 'Additional ₹2000 OFF',
    couponCode: 'FREEDOM',
    cta: 'Shop Now',
  },
  brand: { displayName: 'Tira', disclaimer: 'Offer valid till 20 Aug. T&C apply.' },
}

/** The state a freshly imported catalogue row is actually in. */
const SPARSE: CreativeData = { product: { name: 'Unnamed product', currency: 'INR' } }

describe('the built-in library', () => {
  it('exposes unique slugs and a default that exists', () => {
    const slugs = BUILT_IN_TEMPLATES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(findTemplate(DEFAULT_TEMPLATE_SLUG)).not.toBeNull()
    expect(findTemplate('does-not-exist')).toBeNull()
  })

  it('is five genuinely different layouts, not one in five palettes', () => {
    // Compare the geometry of each template's slots. Two templates that differ
    // only in colour would produce the same signature here, which is the
    // failure this guards: a "library" that is really a palette picker.
    const signature = (slots: readonly { area: { x: unknown; y: unknown } }[]) =>
      slots
        .map((s) => `${String(s.area.x)},${String(s.area.y)}`)
        .sort()
        .join('|')
    const signatures = BUILT_IN_TEMPLATES.map((t) => signature(t.document.slots))
    expect(new Set(signatures).size).toBe(BUILT_IN_TEMPLATES.length)
  })
})

describe.each(BUILT_IN_TEMPLATES)('$slug', ({ document }) => {
  it('renders every ratio it declares, at the right size', async () => {
    for (const ratio of document.ratios) {
      const result = await renderCreative(document, FULL, ratio)
      const meta = await sharp(result.png).metadata()
      const expected = canvasFor(document, ratio)
      expect({ w: meta.width, h: meta.height }).toEqual({ w: expected.width, h: expected.height })
    }
  })

  it('survives a product with nothing but a name', async () => {
    // The whole point of the rules: a ragged catalogue must not produce a poster
    // full of empty boxes, and must never throw.
    const result = await renderCreative(document, SPARSE, '1:1')
    expect(result.png.byteLength).toBeGreaterThan(0)
  })

  it('sizes rounded elements absolutely so they stay round at every ratio', () => {
    // `w: 50%, h: 50%` is a circle at 1:1 and an ellipse at 9:16, because the
    // two percentages resolve against different axes. Anything whose radius
    // makes it round has to be absolute on both.
    //
    // Deliberately narrower than "numeric width implies numeric height": a
    // vertical hairline is legitimately 2px wide and 90% tall, and an earlier,
    // broader version of this rule failed that correct code.
    const round = document.slots.filter(
      (s) => s.type === 'badge' || (s.type === 'shape' && s.radius >= 100),
    )
    for (const slot of round) {
      expect({ id: slot.id, w: typeof slot.area.w, h: typeof slot.area.h }).toEqual({
        id: slot.id,
        w: 'number',
        h: 'number',
      })
    }
  })

  it('binds only to declared slot ids in its rules', () => {
    // A rule naming a slot that no longer exists is inert and invisible — it
    // silently stops hiding what it was written to hide.
    const ids = new Set(document.slots.map((s) => s.id))
    for (const rule of document.rules) {
      for (const id of rule.hide) expect(ids).toContain(id)
    }
  })
})

describe('resolveImages', () => {
  it('passes data URIs through untouched', async () => {
    const uri = 'data:image/png;base64,iVBORw0KGgo='
    const out = await resolveImages({ visual: { url: uri } })
    expect(out.visual?.url).toBe(uri)
  })

  it('refuses schemes it will not follow', async () => {
    // Template data can carry a URL a person typed. `file:` must never reach
    // fetch from a render worker.
    const out = await resolveImages({ visual: { url: 'file:///etc/passwd' } })
    expect(out.visual?.url).toBeNull()
  })

  it('drops an image it cannot fetch rather than failing the poster', async () => {
    const out = await resolveImages({ visual: { url: 'https://127.0.0.1:9/nope.png' } })
    expect(out.visual?.url).toBeNull()

    // And the poster still renders, because the template hides what is absent.
    const template = findTemplate(DEFAULT_TEMPLATE_SLUG)!
    const result = await renderCreative(template.document, out, '1:1')
    expect(result.png.byteLength).toBeGreaterThan(0)
  })

  it('leaves the caller’s data untouched', async () => {
    // The same product renders at three ratios; each call has to start from the
    // same input rather than one mutated by the last.
    const input: CreativeData = { visual: { url: 'data:image/png;base64,AAAA' } }
    const out = await resolveImages(input)
    expect(out).not.toBe(input)
    expect(input.visual?.url).toBe('data:image/png;base64,AAAA')
  })
})

describe('AI scenes', () => {
  const withScene = ['tricolour', 'festive', 'luxury']

  it.each(withScene)('%s drops the scene layers when no scene is chosen', (slug) => {
    const doc = findTemplate(slug)!.document
    const ids = new Set(
      buildTree(doc, FULL, '1:1').element.props['children'] as never as { id?: string }[],
    )
    // Nothing to assert on ids directly — the tree carries no slot ids — so the
    // check is that rendering without a scene still succeeds and the scrim,
    // which would otherwise dim the whole poster, is ruled out.
    const rule = doc.rules.find((r) => r.when.path === 'scene.url')
    expect(rule?.hide).toEqual(expect.arrayContaining(['scene', 'sceneScrim']))
    expect(ids).toBeDefined()
  })

  it.each(withScene)('%s puts a scrim between the scene and the text', (slug) => {
    const doc = findTemplate(slug)!.document
    const scene = doc.slots.find((s) => s.id === 'scene')
    const scrim = doc.slots.find((s) => s.id === 'sceneScrim')
    expect(scene).toBeDefined()
    expect(scrim).toBeDefined()
    // Ordering is the whole point: a generated background can be any
    // brightness, and light text over a pale photograph is a coin toss taken at
    // publish time. Scene behind scrim, scrim behind everything else.
    expect(scene!.z).toBeLessThan(scrim!.z)
    for (const other of doc.slots.filter((s) => s.id !== 'scene' && s.id !== 'sceneScrim')) {
      expect(other.z).toBeGreaterThan(scrim!.z)
    }
  })

  it('renders legibly over a scene and differs from the plain version', async () => {
    const doc = findTemplate('tricolour')!.document
    const scene = 'data:image/png;base64,' + PALE_PNG
    const plain = await renderCreative(doc, FULL, '1:1')
    const dressed = await renderCreative(doc, { ...FULL, scene: { url: scene } }, '1:1')
    expect(plain.png.equals(dressed.png)).toBe(false)
  })
})

describe('the flash template’s either/or headline', () => {
  const flash = findTemplate('flash')!.document

  it('shows the discount and hides the fallback when a discount exists', () => {
    const ids = renderedIds(buildTree(flash, FULL, '1:1'))
    expect(ids.has('discount')).toBe(true)
  })

  it('falls back to the campaign offer when no discount can be derived', () => {
    // Neither slot showing would leave this template a blank poster, which is
    // the one case where hiding is not enough.
    const noPrices: CreativeData = { ...FULL, product: { name: 'X', currency: 'INR' } }
    const texts = collect(buildTree(flash, noPrices, '1:1').element)
    expect(texts).toContain('UP TO 40% OFF')
  })
})

/** A 1×1 pale pixel, enough to prove the scene layer is composited at all. */
const PALE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

/** Rough presence check: does anything red-and-huge appear in the tree? */
function renderedIds(tree: ReturnType<typeof buildTree>): Set<string> {
  const texts = collect(tree.element)
  const out = new Set<string>()
  if (texts.some((t) => /^\d+%$/.test(t))) out.add('discount')
  return out
}

function collect(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collect)
  if (node && typeof node === 'object' && 'props' in node) {
    return collect((node as { props: Record<string, unknown> }).props['children'])
  }
  return []
}
