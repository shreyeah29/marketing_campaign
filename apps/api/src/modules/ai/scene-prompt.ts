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

/**
 * Ratio strings Runway accepts, keyed by the aspect ratios templates render at.
 *
 * Generated at the poster's own shape so the composite never has to crop the
 * scene — a cropped background loses exactly the calm area it was asked for.
 */
export const RUNWAY_RATIO: Record<string, string> = {
  '1:1': '1080:1080',
  '4:5': '1080:1350',
  '9:16': '1080:1920',
  '16:9': '1920:1080',
}
