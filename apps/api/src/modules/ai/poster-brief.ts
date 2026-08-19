/**
 * The design brief for a poster that contains words.
 *
 * This is the other half of the gap. Routing to a model that can typeset is not
 * enough on its own: we were asking a designer to take a photograph. Every image
 * prompt in this system ends with "no text anywhere", because Runway cannot
 * spell — so even a capable model was being told to produce a picture with
 * nothing written on it.
 *
 * A poster brief asks for the opposite thing, and asks for it in the vocabulary
 * of layout rather than photography: where the logo sits, what the headline
 * says, which number is the focal point, what runs along the footer. Everything
 * it names comes from data already in the workspace — the brand kit's colours
 * and logo, the campaign's offer and dates, the product catalogue. Nothing here
 * invents a fact about the business.
 *
 * The one rule that survives from the photographic path is the important one:
 * **no prices**. An offer like "1+1" is a claim the campaign already made and
 * can be checked at a glance; a rupee figure is a number a customer will act on,
 * and every image model gets digits wrong eventually. Prices stay typeset by the
 * template engine, where they come from the catalogue and cannot drift.
 */

export interface PosterBrand {
  readonly displayName?: string | null
  readonly primaryColor?: string | null
  readonly secondaryColor?: string | null
  readonly accentColor?: string | null
  readonly headingFont?: string | null
  readonly instagramHandle?: string | null
  readonly locationLine?: string | null
}

export interface PosterBriefInput {
  /** The words the poster must carry, largest first. */
  readonly headline: string
  readonly subline?: string | null
  /** The concept's own description — what should be in the picture. */
  readonly scene?: string | null
  readonly brand?: PosterBrand
  /** Product names to feature. Names only — never prices. */
  readonly products?: readonly string[]
  /** "9–19 August", already formatted. Absent when the campaign has no dates. */
  readonly dateLine?: string | null
  readonly cta?: string | null
  /** Locale and occasion direction, from `buildImageDirection`. */
  readonly direction?: string | null
}

/** Anything that reads as an amount of money, so it can be kept out. */
const MONEY = /[₹$€£]\s?\d|\b\d[\d,.]*\s?(?:rupees?|rs\.?|inr|usd|dollars?)\b/gi

/**
 * Strip money from a line bound for the poster.
 *
 * Applied to the headline and subline rather than trusted, because those come
 * from a person typing freely and "Everything at ₹99" is a natural thing to
 * type. The offer survives; the figure does not, and the template path remains
 * the way to put a real price on artwork.
 */
export function withoutMoney(value: string): string {
  return value
    .replace(MONEY, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
}

function paletteLine(brand: PosterBrand | undefined): string | null {
  const colours = [brand?.primaryColor, brand?.secondaryColor, brand?.accentColor]
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c))
  if (colours.length === 0) return null
  return `Palette: ${colours.join(', ')} — use these and their tints, and keep the background light and warm unless the scene says otherwise.`
}

/**
 * Build the prompt.
 *
 * Written as a numbered layout rather than a paragraph of adjectives. An image
 * model given "a beautiful festive poster" produces a mood; given "logo top
 * left, headline beneath it, the offer as the largest element, a row of four
 * simple icons, a footer bar with the handle" it produces a composition — which
 * is what separates a designed poster from a photograph with a caption.
 */
export function buildPosterBrief(input: PosterBriefInput): string {
  const headline = withoutMoney(input.headline).slice(0, 70)
  const subline = input.subline ? withoutMoney(input.subline).slice(0, 110) : ''
  const brandName = input.brand?.displayName?.trim()
  const products = (input.products ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3)

  const lines: string[] = [
    'A polished, professional marketing POSTER — a designed graphic, not a photograph.',
    'Square composition, print-quality, clean vector-style graphic elements combined with photographic food and drink.',
    '',
    'TEXT THAT MUST APPEAR, spelled exactly as written and nothing else:',
    `- Headline, the largest and boldest element: "${headline}"`,
  ]

  if (subline) lines.push(`- Supporting line beneath the headline: "${subline}"`)
  if (brandName) lines.push(`- Brand name at the top left: "${brandName}"`)
  if (input.dateLine?.trim()) lines.push(`- A small date badge: "${input.dateLine.trim()}"`)
  if (input.cta?.trim()) lines.push(`- A call to action: "${withoutMoney(input.cta).slice(0, 40)}"`)
  if (input.brand?.instagramHandle?.trim()) {
    lines.push(`- In a footer bar: "${input.brand.instagramHandle.trim()}"`)
  }
  if (input.brand?.locationLine?.trim()) {
    lines.push(`- Also in the footer bar: "${input.brand.locationLine.trim()}"`)
  }

  lines.push(
    '',
    'Spell every one of those exactly. Do not add any other words, invented offers, prices, amounts of money, phone numbers or web addresses — nothing beyond the lines listed above.',
    '',
    'LAYOUT:',
    '1. Brand name or mark in the top-left corner, small and calm.',
    '2. The headline in the upper-left third, set in two weights — a bold serif or heavy sans for the main words, a lighter script or italic for the secondary phrase.',
    '3. The offer itself as the visual focus: very large, centred in the left column, far bigger than any other text.',
    '4. The product photography on the right, overlapping the lower half, well lit on a clean surface.',
    '5. A thin row of three or four simple line icons with one- or two-word captions near the bottom left.',
    '6. A solid footer bar across the very bottom holding the handle and location.',
    '7. Generous margins. Nothing important within 4% of any edge.',
  )

  if (products.length > 0) {
    lines.push(
      '',
      `PRODUCTS IN FRAME: ${products.join(', ')}. Photograph them appetisingly and accurately — these are real menu items, not decoration.`,
    )
  }

  const palette = paletteLine(input.brand)
  if (palette) lines.push('', palette)
  if (input.brand?.headingFont?.trim()) {
    lines.push(`Typography should feel like ${input.brand.headingFont.trim()}.`)
  }
  if (input.direction?.trim()) lines.push('', input.direction.trim())
  if (input.scene?.trim()) lines.push('', `Mood and setting: ${input.scene.trim()}`)

  lines.push(
    '',
    'Not a photograph with a caption bar. Not a screenshot of a website. A single designed poster, the kind a café would print and put in its window.',
  )

  return lines.join('\n')
}
