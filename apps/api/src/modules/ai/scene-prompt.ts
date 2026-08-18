/**
 * Prompts for generating a *background*, never a product.
 *
 * This is the architectural decision from the creative-engine proposal, written
 * down as a prompt. A generative model asked to render a branded product does
 * not preserve it — it produces something that resembles it, with lettering
 * that is nearly the real lettering. On a cosmetics SKU that is a counterfeit
 * label, published as advertising, at scale.
 *
 * So the model is asked for the surface the product sits on and nothing else.
 * The real photograph is composited on top afterwards, which means the product
 * on the poster is the product, pixel for pixel.
 *
 * A second consequence is economic: one scene serves every product in a
 * campaign, so a fifty-product campaign costs one generation rather than fifty.
 */

/** The clauses that keep a product, and any text, out of the frame. */
const EXCLUSIONS = [
  'no product',
  'no bottle',
  'no jar',
  'no tube',
  'no packaging',
  'no cosmetics',
  'no text',
  'no letters',
  'no numbers',
  'no words',
  'no logo',
  'no watermark',
  'no signage',
  'no people',
  'no hands',
  'no faces',
].join(', ')

export interface ScenePromptInput {
  /** The campaign's theme or name — "Tricolour Sale", "Diwali", "Summer". */
  readonly theme?: string | null
  /** Brand voice, so a clinical brand does not get a maximalist set. */
  readonly mood?: string | null
  /** Where the product will be composited, so that area is left clear. */
  readonly clearArea?: 'centre' | 'left' | 'right'
}

const CLEAR_AREA_CLAUSE: Record<'centre' | 'left' | 'right', string> = {
  centre:
    'Leave the centre of the frame visually calm and uncluttered — an even surface, gradient or soft shadow — with no detail competing for attention there.',
  left: 'Keep the left half of the frame simple and even; concentrate any texture or decoration on the right.',
  right:
    'Keep the right half of the frame simple and even; concentrate any texture or decoration on the left.',
}

/**
 * Build the scene prompt.
 *
 * The exclusions are repeated in plain language rather than compressed, because
 * image models weight repeated constraints more heavily and a single "no text"
 * is routinely ignored.
 */
export function buildScenePrompt(input: ScenePromptInput = {}): string {
  const theme = input.theme?.trim()
  const mood = input.mood?.trim()
  const clear = CLEAR_AREA_CLAUSE[input.clearArea ?? 'centre']

  return [
    'A premium product-photography BACKGROUND for a beauty advertisement.',
    'This is an empty set: a surface and its lighting only.',
    theme ? `Styled for a "${theme}" campaign.` : null,
    mood ? `The mood is ${mood}.` : null,
    'Studio lighting, soft realistic shadows, shallow depth of field, editorial colour grading.',
    clear,
    `Absolutely ${EXCLUSIONS}.`,
    'The frame must contain nothing that could be mistaken for a product or for writing.',
  ]
    .filter((line): line is string => line !== null)
    .join(' ')
}

/** The tag the prompt uses to point at the uploaded photograph. */
export const PRODUCT_REFERENCE_TAG = 'product'

export interface ProductShotPromptInput {
  /** What the product is, so the model knows what it is photographing. */
  readonly productName?: string | null
  /** The operator's own words — the whole point of the box on the screen. */
  readonly direction?: string | null
  readonly mood?: string | null
}

/**
 * The prompt for a product shot, built around a reference photograph.
 *
 * Different in kind from `buildScenePrompt`, not just in wording. That one asks
 * for an empty set because the real product is composited on afterwards; this
 * one asks the model to photograph the referenced product itself, which is what
 * makes the result look like a shoot rather than a cutout on a backdrop.
 *
 * `@product` must appear literally — Runway matches the reference by its tag,
 * and a prompt that never names it silently ignores the photograph and invents
 * a product instead. That failure looks like success, which is the worst kind,
 * so the tag is interpolated from the same constant the caller tags with.
 *
 * The text exclusions stay. A model asked for a poster will happily write a
 * price on it, and every figure on the finished creative has to come from the
 * catalogue rather than from a model's idea of what a price looks like.
 */
export function buildProductShotPrompt(input: ProductShotPromptInput = {}): string {
  const name = input.productName?.trim()
  const direction = input.direction?.trim()
  const mood = input.mood?.trim()

  return [
    `A professional product photograph of the @${PRODUCT_REFERENCE_TAG}` +
      (name ? ` (${name})` : '') +
      ', photographed exactly as shown in the reference.',
    'Keep its shape, colour, proportions and every detail faithful to the reference image.',
    direction ? `Art direction: ${direction}.` : null,
    mood ? `The mood is ${mood}.` : null,
    'Real studio lighting, soft realistic contact shadows, shallow depth of field,',
    'natural reflections, editorial colour grading, photorealistic — not an illustration.',
    'Compose it as a hero shot with generous empty space around the subject.',
    `Absolutely ${EXCLUSIONS}.`,
    'No writing of any kind anywhere in the image.',
  ]
    .filter((line): line is string => line !== null)
    .join(' ')
}

/**
 * Ratio strings Runway accepts, keyed by the aspect ratios templates render at.
 *
 * Generated at the poster's own shape so the composite never has to crop the
 * scene — a cropped background loses exactly the calm area it was asked for.
 *
 * Every value must appear in gen4_image's published ratio list. `4:5` used to
 * map to `1080:1350`, which is the right shape and not a ratio Runway offers;
 * `1080:1440` is the nearest one it does. A value the model does not recognise
 * is not a degraded image, it is a 400 and no image at all.
 */
export const RUNWAY_RATIO: Record<string, string> = {
  '1:1': '1080:1080',
  '4:5': '1080:1440',
  '9:16': '1080:1920',
  '16:9': '1920:1080',
}

/**
 * The clause that keeps lettering out of generated artwork.
 *
 * The campaign generator is instructed to end every image prompt with this, and
 * it is the single most important sentence in the prompt: without it the model
 * invents text, and invented text on an advertisement is a phone number nobody
 * answers.
 */
const NO_TEXT_CLAUSE =
  'No text, letters, numbers or logos anywhere in the image. Leave the lower quarter visually calm and uncluttered.'

/**
 * Fit a stored image-concept prompt into Runway's `promptText` budget.
 *
 * The concepts written by the campaign generator are long by design — "a rich,
 * detailed generation prompt: subject, composition, lighting, mood, colours,
 * style" — and routinely exceed Runway's 1000-character limit, which it answers
 * with a flat 400 and no indication of which field was wrong. Every poster in
 * the campaign studio failed this way.
 *
 * Trimming from the end would be worse than the failure it fixes: the no-text
 * instruction lives at the end of these prompts, so a plain truncation deletes
 * the rule and returns artwork covered in invented lettering. The description is
 * shortened instead, and the clause is put back.
 */
export function clampImagePrompt(
  title: string | null | undefined,
  body: string,
  limit: number,
): string {
  const full = [title?.trim(), body.trim()].filter(Boolean).join(' — ')
  if (full.length <= limit) return full

  const room = limit - NO_TEXT_CLAUSE.length - 1
  // A limit too small to hold the clause means the clause wins: artwork with no
  // text and a vague scene beats a detailed scene covered in gibberish.
  if (room <= 0) return NO_TEXT_CLAUSE.slice(0, limit)

  const cut = full.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '')
  return `${head}. ${NO_TEXT_CLAUSE}`
}
