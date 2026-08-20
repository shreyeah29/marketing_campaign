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
/**
 * One deal on the poster.
 *
 * A list rather than a single field, because a real offer poster is usually
 * several: a salon's Rakshabandhan sheet had four — a gift package, a 1+1 on
 * manicures, a facial combo and a haircut price. Forced through one `offer`
 * slot, the generator produced "1+1+1", which is not any of them and not
 * anything at all. It had four true things and one box.
 */
export interface PosterOffer {
  /** The deal, as large type: "PAY ₹5000", "1+1", "₹8000 ONLY". */
  readonly title: string
  /** What it is: "Gift your sister a makeover", "Hydrafacial combo". */
  readonly label?: string | null
  /** The qualifier: "worth ₹6500", "was ₹12000", "for both". */
  readonly detail?: string | null
}

export interface PosterCopy {
  readonly headline: string
  /** The lighter phrase under the headline, often set as a script. */
  readonly subline?: string | null
  /**
   * Every deal the poster carries, in reading order.
   *
   * Preferred over `offer`. When two or more are present the layout changes to
   * a grid, because one enormous focal number cannot express four deals.
   */
  readonly offers?: readonly PosterOffer[]
  /** The focal element when there is exactly one: "1+1", "40% OFF". */
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
 * Anything that reads as an amount of money.
 *
 * Three shapes, because an amount arrives in three orders and the third is easy
 * to forget: symbol-then-digits (₹99), digits-then-word (99 rupees), and
 * word-then-digits (Rs. 149). The last one is the most common way an Indian
 * price is written.
 */
const MONEY =
  /[₹$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:rupees?|rs\.?|inr|usd|dollars?)\b|\b(?:rupees?|rs\.?|inr|usd)\s?\d[\d,.]*/gi

/**
 * Strip money from a line.
 *
 * **No longer applied to poster copy**, and removing it was the fix to a poster
 * that came back useless. A salon asked for "gift package ₹5000 worth ₹6500,
 * hydrafacial ₹12000 down to ₹8000, haircuts ₹1000 for both" and received a
 * poster with no figure on it anywhere — because every one was stripped here on
 * the way through.
 *
 * The reasoning had been sound for a different question. The cost boundary in
 * this system is about *our* money: credits, ad spend, margin, the figures a
 * client must never be shown. A salon's own price list is not that. It is the
 * entire content of their advertisement, and a discount poster that cannot say
 * a price is not a discount poster.
 *
 * The other argument — that image models mis-draw digits — has also aged. It is
 * still true that a template typesets more reliably, and that path is still
 * there for a catalogue. But refusing to draw a price at all does not protect
 * anyone from a wrong price; it guarantees a poster with no price, which is
 * worse than one that needs checking.
 *
 * Kept and exported because the distinction still matters wherever it is *our*
 * figures in question.
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
  // Prices are kept. See `withoutMoney` — a discount poster that cannot say a
  // price is not a discount poster, and these are the client's own figures.
  const headline = input.headline.trim().slice(0, 70)
  const subline = input.subline ? input.subline.trim().slice(0, 110) : ''
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
  /**
   * Every deal, in reading order.
   *
   * Two or more changes the whole poster: the layout below becomes a grid of
   * cards rather than one enormous number, because four deals cannot be a
   * single focal element. Squeezing them through one slot is what produced
   * "1+1+1" — a figure that matched none of the four offers underneath it.
   */
  const offers = (copy?.offers ?? []).filter((o) => o.title.trim().length > 0).slice(0, 6)

  if (offers.length > 1) {
    lines.push('', `THE ${String(offers.length)} OFFERS, each in its own panel:`)
    for (const [i, offer] of offers.entries()) {
      const parts = [
        `  ${String(i + 1)}. Large: "${offer.title.trim().slice(0, 28)}"`,
        offer.label?.trim() ? `above it, smaller: "${offer.label.trim().slice(0, 48)}"` : null,
        offer.detail?.trim() ? `beneath it, smallest: "${offer.detail.trim().slice(0, 48)}"` : null,
      ].filter((part): part is string => part !== null)
      lines.push(parts.join(' · '))
    }
  } else if (offers[0] || copy?.offer?.trim()) {
    const single = offers[0]?.title.trim() ?? copy?.offer?.trim() ?? ''
    lines.push(`- THE OFFER, the single largest element on the poster: "${single.slice(0, 28)}"`)
    const note = offers[0]?.detail?.trim() ?? copy?.offerNote?.trim()
    if (note) lines.push(`- Directly under the offer, smaller: "${note.slice(0, 48)}"`)
  }

  if (copy?.condition?.trim()) {
    lines.push(`- On a ribbon or banner beneath that: "${copy.condition.trim().slice(0, 60)}"`)
  }
  for (const feature of (copy?.features ?? []).slice(0, 4)) {
    const clean = feature.trim().slice(0, 28)
    if (clean) lines.push(`- One icon caption: "${clean}"`)
  }
  if (copy?.footnote?.trim()) {
    lines.push(`- Small print in a corner: "${copy.footnote.trim().slice(0, 30)}"`)
  }

  if (brandName) lines.push(`- Brand name at the top left: "${brandName}"`)
  const dateLine = copy?.dateLine?.trim() ?? input.dateLine?.trim()
  if (dateLine) lines.push(`- A small date badge: "${dateLine}"`)
  if (input.cta?.trim()) lines.push(`- A call to action: "${input.cta.trim().slice(0, 40)}"`)
  if (input.brand?.instagramHandle?.trim()) {
    lines.push(`- In a footer bar: "${input.brand.instagramHandle.trim()}"`)
  }
  if (input.brand?.locationLine?.trim()) {
    lines.push(`- Also in the footer bar: "${input.brand.locationLine.trim()}"`)
  }

  lines.push(
    '',
    'Spell every one of those exactly, including every number and currency symbol. Do not add any other words, invented offers, prices, phone numbers or web addresses — nothing beyond the lines listed above. Every figure above is a real price this business is charging, so it must appear exactly as written and must not be rounded, altered or dropped.',
    '',
  )

  /**
   * Two layouts, because one enormous number cannot express four deals.
   *
   * The single-offer arrangement — a huge focal figure with photography beside
   * it — is right for "1+1 this weekend" and actively wrong for a price list.
   * Given four offers it has one box to put them in, which is how a poster
   * asking for a ₹5000 package, a 1+1, a ₹8000 combo and a ₹1000 haircut came
   * back reading "1+1+1".
   */
  if (offers.length > 1) {
    lines.push(
      'LAYOUT — an offer sheet:',
      '1. Brand name or mark at the top, centred or top-left, small and calm.',
      '2. The headline directly beneath it, set in two weights — a bold display face for the main words and a lighter script for the secondary phrase.',
      `3. Below the headline, a panel divided into ${offers.length === 2 || offers.length === 4 ? 'a clean two-column grid' : 'evenly sized cards'} — one card per offer, all the same size, separated by thin rules or gentle gaps. Each card holds its small label above and its large figure below, exactly as listed.`,
      '4. Every card is equally weighted. No single offer is enlarged at the expense of the others; a reader should be able to compare them at a glance.',
      '5. The photography occupies one side or the upper corner, behind or beside the panel — never over the figures.',
      '6. A solid footer bar across the very bottom holding the phone number and location.',
      '7. Generous margins. Nothing important within 4% of any edge, and no figure closer than 6% to another.',
    )
  } else {
    lines.push(
      'LAYOUT:',
      '1. Brand name or mark in the top-left corner, small and calm.',
      '2. The headline in the upper-left third, set in two weights — a bold serif or heavy sans for the main words, a lighter script or italic for the secondary phrase.',
      '3. The offer itself as the visual focus: very large, centred in the left column, far bigger than any other text.',
      '4. The product photography on the right, overlapping the lower half, well lit on a clean surface.',
      '5. A thin row of three or four simple line icons with one- or two-word captions near the bottom left.',
      '6. A solid footer bar across the very bottom holding the handle and location.',
      '7. Generous margins. Nothing important within 4% of any edge.',
    )
  }

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
