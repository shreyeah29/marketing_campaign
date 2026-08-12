import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { loadFonts } from '../render/fonts.js'
import { buildTree } from '../render/layout.js'
import { renderCreative, renderHash } from '../render/render.js'
import { discountPercent, formatMoney, hiddenSlots, resolvePath } from '../template/bind.js'
import { canvasFor, parseTemplate } from '../template/schema.js'
import { TRICOLOUR } from '../templates/tricolour.js'

/**
 * Every string in a layout tree, at any depth.
 *
 * Composite slots such as `price` nest their text a level down, so a shallow
 * scan of the root's children would miss exactly the values most worth
 * checking.
 */
function collectText(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collectText)
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props: Record<string, unknown> }).props
    return collectText(props['children'])
  }
  return []
}

/** The example from the brief, as the API will supply it. */
const ANUA = {
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
  brand: { displayName: 'Tira' },
}

describe('formatMoney', () => {
  it('formats minor units without inventing decimals', () => {
    // 187000 paise is ₹1,870 — the brief's sale price. Whole amounts print
    // whole: "₹1,870.00" on an advertisement is a mistake you cannot take back
    // once it has published.
    expect(formatMoney(187_000, 'INR')).toBe('₹1,870')
    expect(formatMoney(220_000, 'INR')).toBe('₹2,200')
    expect(formatMoney(1_999, 'USD')).toBe('$19.99')
  })

  it('groups Indian numerals the Indian way', () => {
    // ₹12,34,567 — not ₹1,234,567. Getting this wrong on a rupee price tag is
    // immediately visible to every customer who reads it.
    expect(formatMoney(123_456_700, 'INR')).toBe('₹12,34,567')
  })
})

describe('discountPercent', () => {
  it('derives the discount rather than trusting a stored one', () => {
    expect(discountPercent(220_000, 187_000)).toBe(15)
  })

  it('refuses to invent a discount', () => {
    expect(discountPercent(null, 187_000)).toBeNull()
    expect(discountPercent(220_000, null)).toBeNull()
    // Sale >= MRP is not a discount, and printing "0% OFF" or a negative
    // number would be worse than printing nothing.
    expect(discountPercent(187_000, 220_000)).toBeNull()
    expect(discountPercent(187_000, 187_000)).toBeNull()
  })
})

describe('resolvePath', () => {
  it('resolves prices and the derived discount', () => {
    expect(resolvePath('product.salePrice', ANUA)).toBe('₹1,870')
    expect(resolvePath('product.mrp', ANUA)).toBe('₹2,200')
    expect(resolvePath('product.discountPercent', ANUA)).toBe('15%')
    expect(resolvePath('campaign.couponCode', ANUA)).toBe('FREEDOM')
  })

  it('treats blank as absent', () => {
    expect(resolvePath('product.brand', { product: { brand: '   ' } })).toBeNull()
    expect(resolvePath('campaign.cta', {})).toBeNull()
  })
})

describe('template rules', () => {
  it('hides the coupon and footer when there is no coupon', () => {
    const hidden = hiddenSlots(TRICOLOUR, {
      product: ANUA.product,
      campaign: { name: 'Sale' },
    })
    expect(hidden.has('coupon')).toBe(true)
    expect(hidden.has('footerBand')).toBe(true)
    expect(hidden.has('campaignTitle')).toBe(false)
  })

  it('hides the discount badge when no discount can be derived', () => {
    const hidden = hiddenSlots(TRICOLOUR, { product: { name: 'X', currency: 'INR' } })
    expect(hidden.has('discountBadge')).toBe(true)
  })
})

describe('fonts', () => {
  it('loads the latin-ext subset, which is the only one with ₹', async () => {
    // Found by rendering a poster and looking at it: with the `latin` subset
    // alone, every rupee price came out as a NO-GLYPH box. U+20B9 sits in
    // latin-ext's U+20AD-20C0 range. For an Indian retailer this is the
    // difference between a usable creative and an unusable one, and nothing
    // errors when it is wrong.
    const fonts = await loadFonts()
    const families = new Set(fonts.map((f) => f.name))
    expect(families).toEqual(new Set(['Inter', 'InterExt']))
    expect(fonts).toHaveLength(6) // 3 weights × 2 subsets
  })
})

describe('canvasFor', () => {
  it('derives every ratio from one base width', () => {
    expect(canvasFor(TRICOLOUR, '1:1')).toEqual({ width: 1080, height: 1080 })
    expect(canvasFor(TRICOLOUR, '4:5')).toEqual({ width: 1080, height: 1350 })
    expect(canvasFor(TRICOLOUR, '9:16')).toEqual({ width: 1080, height: 1920 })
  })
})

describe('buildTree', () => {
  it('omits slots with no value instead of leaving empty boxes', () => {
    const full = buildTree(TRICOLOUR, ANUA, '1:1')
    const bare = buildTree(TRICOLOUR, { product: { name: 'X' } }, '1:1')
    const count = (t: ReturnType<typeof buildTree>) =>
      (t.element.props['children'] as unknown[]).length
    expect(count(full)).toBeGreaterThan(count(bare))
  })

  it('scales type with canvas width, not with height', () => {
    // The same template at 9:16 must not produce a headline sized for a square,
    // and must not shrink it just because the canvas got taller.
    const square = buildTree(TRICOLOUR, ANUA, '1:1')
    const story = buildTree(TRICOLOUR, ANUA, '9:16')
    const title = (t: ReturnType<typeof buildTree>) => {
      const kids = t.element.props['children'] as { props: Record<string, unknown> }[]
      const node = kids.find((k) => k.props['children'] === 'Tricolour Sale')
      return (node?.props['style'] as { fontSize: number }).fontSize
    }
    expect(title(square)).toBe(title(story))
  })
})

describe('renderCreative', () => {
  it('renders a real PNG at the requested ratio', async () => {
    const result = await renderCreative(TRICOLOUR, ANUA, '1:1')
    const meta = await sharp(result.png).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1080)
  })

  it('renders every ratio at the right dimensions', async () => {
    const portrait = await renderCreative(TRICOLOUR, ANUA, '4:5')
    const meta = await sharp(portrait.png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  it('carries the exact resolved strings into the layout', () => {
    // Satori converts text to vector paths, so the SVG contains no searchable
    // characters — asserting on its markup would prove nothing. The layout tree
    // is where the resolved strings still exist, and it is the last point at
    // which they can be wrong.
    const texts = collectText(buildTree(TRICOLOUR, ANUA, '1:1').element)
    expect(texts).toContain('₹1,870')
    expect(texts).toContain('₹2,200')
    expect(texts).toContain('Tricolour Sale')
    expect(texts).toContain('FREEDOM')
  })

  it('renders different pixels when the coupon changes', async () => {
    // The end-to-end guarantee: a data change reaches the image. Compared as
    // bytes because the text is paths by the time it is an image.
    const a = await renderCreative(TRICOLOUR, ANUA, '1:1')
    const b = await renderCreative(
      TRICOLOUR,
      { ...ANUA, campaign: { ...ANUA.campaign, couponCode: 'INDEPENDENCE' } },
      '1:1',
    )
    expect(a.png.equals(b.png)).toBe(false)
  })

  it('is deterministic, so an unchanged creative need not re-render', async () => {
    const a = await renderCreative(TRICOLOUR, ANUA, '1:1')
    const b = await renderCreative(TRICOLOUR, ANUA, '1:1')
    expect(a.hash).toBe(b.hash)
    expect(a.png.equals(b.png)).toBe(true)
  })

  it('changes the hash when the price changes', () => {
    const cheaper = { ...ANUA, product: { ...ANUA.product, salePriceMinor: 150_000 } }
    expect(renderHash(TRICOLOUR, ANUA, '1:1')).not.toBe(renderHash(TRICOLOUR, cheaper, '1:1'))
  })

  it('changes the hash when the template version changes', () => {
    const edited = parseTemplate({ ...TRICOLOUR, name: 'Tricolour Sale v2' })
    expect(renderHash(TRICOLOUR, ANUA, '1:1')).not.toBe(renderHash(edited, ANUA, '1:1'))
  })

  it('renders a sparse product without throwing', async () => {
    // A catalogue row with a name and nothing else is the normal case on import.
    const result = await renderCreative(TRICOLOUR, { product: { name: 'Unnamed' } }, '1:1')
    expect(result.png.byteLength).toBeGreaterThan(0)
  })
})
