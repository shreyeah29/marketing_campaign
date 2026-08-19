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

/**
 * Every line of copy the poster carries, written by the campaign generator.
 *
 * The reference poster that started this had twelve pieces of text on it and a
 * person typed none of them — they said "a Rakshabandhan 1+1 poster" and the
 * model wrote the headline, the script sub-line, the offer, the condition, four
 * icon captions, a date badge and the small print. Asking someone to type a
 * headline and then designing around that one line reproduces the input, not
 * the output.
 *
 * So the copy is generated from the campaign's own facts — its offer, its
 * dates, its occasion — and every field here is optional except the headline.
 * A field the generator left empty is a piece the poster does without, rather
 * than a placeholder for the design to fill with something invented.
 */
export interface PosterCopy {
  readonly headline: string
  /** The lighter phrase under the headline, often set as a script. */
  readonly subline?: string | null
  /** The focal element: "1+1", "40% OFF", "BUY 2 GET 1". */
  readonly offer?: string | null
  /** What the offer applies to: "ON ALL ITEMS". */
  readonly offerNote?: string | null
  /** The condition, usually on a ribbon: "WHEN YOU BRING YOUR SIBLING". */
  readonly condition?: string | null
  /** Two to four short captions for the icon row. */
  readonly features?: readonly string[]
  /** "9TH – 19TH AUGUST". */
  readonly dateLine?: string | null
  /** Small print: "*T&C Apply". */
  readonly footnote?: string | null
}

export interface PosterBriefInput {
  /** The words the poster must carry, largest first. */
  readonly headline: string
  readonly subline?: string | null
  /** The rest of the copy, when the generator wrote a full poster. */
  readonly copy?: PosterCopy | null
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
  /**
   * The workspace's saved look, in words. See `StyleTemplate`.
   *
   * Deliberately separate from `hasReference`, and they behave differently. A
   * reference picture is attached and interpreted afresh each time; a saved look
   * is a fixed paragraph, so every poster in a run receives the identical
   * direction and the set actually looks like a set.
   *
   * It describes palette, light and texture only — never layout, because the
   * numbered layout below is built from this campaign's own offer and dates, and
   * a second arrangement arriving from a saved style would contradict it.
   */
  readonly styleLook?: string | null
  /**
   * True when a reference poster is attached to the request.
   *
   * Changes what the brief asks for, not just what is sent: without saying so
   * explicitly, a model handed an image and a prompt tends to edit the image —
   * keeping its words and its products and changing the styling. What is wanted
   * is the opposite: their layout language, our content.
   */
  readonly hasReference?: boolean
}

/**
 * Anything that reads as an amount of money, so it can be kept out.
 *
 * Three shapes, because an amount arrives in three orders and the third is easy
 * to forget: symbol-then-digits (₹99), digits-then-word (99 rupees), and
 * word-then-digits (Rs. 149). The last one was missing here and is the most
 * common way an Indian price is written.
 */
const MONEY =
  /[₹$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:rupees?|rs\.?|inr|usd|dollars?)\b|\b(?:rupees?|rs\.?|inr|usd)\s?\d[\d,.]*/gi

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

  const copy = input.copy
  if (copy?.offer?.trim()) {
    lines.push(
      `- THE OFFER, the single largest element on the poster: "${withoutMoney(copy.offer).slice(0, 24)}"`,
    )
  }
  if (copy?.offerNote?.trim()) {
    lines.push(
      `- Directly under the offer, smaller: "${withoutMoney(copy.offerNote).slice(0, 40)}"`,
    )
  }
  if (copy?.condition?.trim()) {
    lines.push(
      `- On a ribbon or banner beneath that: "${withoutMoney(copy.condition).slice(0, 60)}"`,
    )
  }
  for (const feature of (copy?.features ?? []).slice(0, 4)) {
    const clean = withoutMoney(feature).slice(0, 28)
    if (clean) lines.push(`- One icon caption: "${clean}"`)
  }
  if (copy?.footnote?.trim()) {
    lines.push(`- Small print in a corner: "${withoutMoney(copy.footnote).slice(0, 30)}"`)
  }

  if (brandName) lines.push(`- Brand name at the top left: "${brandName}"`)
  const dateLine = copy?.dateLine?.trim() ?? input.dateLine?.trim()
  if (dateLine) lines.push(`- A small date badge: "${dateLine}"`)
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

  /**
   * The house style, after the palette and before the reference.
   *
   * Order is load-bearing. The brand kit's own colours come first because they
   * are facts about the business, and a saved look that disagrees is a
   * preference losing to a fact. The reference block comes last because it is
   * the most specific instruction a person can give — they attached that picture
   * to this campaign — and the closest thing to the end tends to win.
   */
  if (input.styleLook?.trim()) {
    lines.push(
      '',
      'HOUSE STYLE — the visual language this business works in:',
      input.styleLook.trim(),
      'Apply it to the palette, the lighting and the surfaces. Do not let it change the layout above.',
    )
  }

  if (input.hasReference === true) {
    lines.push(
      '',
      'USING THE ATTACHED REFERENCE:',
      'Take its visual language only — the composition, the proportions, the type pairing, the density of decoration, the way photography and graphic elements are combined.',
      'Take none of its content. Do not copy its words, its logo, its brand name, its products, its prices or its dates. Every word on your poster comes from the list above and nothing else.',
      'This is a new poster for a different business that happens to be designed with the same eye — not the attached poster with the text swapped.',
    )
  }

  lines.push(
    '',
    'Not a photograph with a caption bar. Not a screenshot of a website. A single designed poster, the kind a café would print and put in its window.',
  )

  return lines.join('\n')
}
