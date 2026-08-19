/**
 * Creative directions — one shelf for every way this system can make a picture.
 *
 * The problem this names: "template" was being used for four different things.
 * A designed layout the engine typesets, a look an image model paints in, a
 * saved reference a client uploaded, and a campaign preset were all called
 * templates and all shown in different places. So the one that never spells
 * anything wrong — the layout engine — was buried under Library, while the one
 * that draws its own letters was the default.
 *
 * A direction says plainly which of those you are choosing, and the grouping is
 * by *what you have to give it*:
 *
 * - `ai-poster` — nothing but words. The model composes the whole thing.
 * - `promotional` — your catalogue. The engine typesets it, so the price and the
 *   offer are correct by construction rather than by luck.
 * - `product` — a product photograph, kept as the hero with a world built around.
 * - `transform` — a photograph you already have, re-rendered in another style.
 *
 * ## Why this lives in code
 *
 * Same reasoning as `BUILT_IN_TEMPLATES`: directions are versioned with the
 * release that renders them, cannot drift between environments, and a broken one
 * fails the build rather than a client's campaign. A client's *own* saved looks
 * are the database-backed resource beside these — a different lifecycle, not a
 * reason to move these.
 *
 * ## Why the API serves it rather than the web app owning a copy
 *
 * The look text has to reach the prompt builder, which is here. Duplicating the
 * catalogue in the frontend would mean two lists that drift, and the drift would
 * be silent: a direction the UI offers and the API has never heard of just
 * generates without it.
 */

export type DirectionGroup = 'ai-poster' | 'promotional' | 'product' | 'transform'

/** How the picture is actually made. The honest distinction the word "template" hid. */
export type DirectionKind =
  /** An image model draws it, letters and all. */
  | 'ai'
  /** The layout engine typesets it. Text cannot come out wrong. */
  | 'template'

/** What the person has to bring. Decides where the card sends them. */
export type DirectionNeeds = 'nothing' | 'product' | 'photo'

export interface CreativeDirection {
  readonly id: string
  readonly name: string
  /** One line, about the outcome rather than the mechanism. */
  readonly blurb: string
  readonly group: DirectionGroup
  readonly kind: DirectionKind
  readonly needs: DirectionNeeds
  /**
   * The visual language, in words, folded into every image prompt in the run.
   *
   * Present only on `ai` directions. Reaches generation through the same slot as
   * a client's saved look, so the two cannot behave differently — see
   * `buildPosterBrief`'s HOUSE STYLE block.
   *
   * Look only. Never layout: the poster brief composes that from the campaign's
   * own offer and dates, and a second arrangement arriving here would contradict
   * it with whichever the model weighted more winning at random.
   */
  readonly look?: string
  /**
   * The layout that renders it. Present only on `template` directions.
   *
   * A real slug from `BUILT_IN_TEMPLATES`, asserted in a test — a direction
   * pointing at a template that does not exist would offer a card that renders
   * nothing.
   */
  readonly templateSlug?: string
  /** Industries this suits. Empty means any — most directions are any. */
  readonly industries: readonly string[]
  /**
   * What the direction decides about the run, mirroring the draft's own fields.
   *
   * Only what it genuinely has an opinion about. Channels, audience and duration
   * stay the client's business; a direction that silently picked someone's
   * audience would be worse than no direction at all.
   */
  readonly settings: {
    readonly postCount?: 1 | 2 | 3 | 5 | 10 | 20
    readonly videoCount?: 0 | 1 | 2 | 3
    readonly wantPosterDesigns?: boolean
    readonly wantPhotography?: boolean
  }
}

/**
 * Eight ways an image model can compose a poster.
 *
 * Genuinely different directions rather than one look in eight palettes — the
 * failure mode a gallery falls into when it grows by tinting. Each names a
 * palette, a light and a density, because those three are what actually change
 * the picture; adjectives like "beautiful" change nothing.
 */
const AI_POSTERS: readonly CreativeDirection[] = [
  {
    id: 'ai-premium',
    name: 'Premium',
    blurb: 'Deep, restrained, expensive-looking. For a brand that does not discount.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'A deep, restrained palette — near-black, warm charcoal and a single muted metallic. Light is low and directional, raking across surfaces so edges catch and everything else falls away. Composition is sparse with generous negative space. Surfaces read matte with a fine grain, closer to print than to screen.',
    industries: [],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-minimal',
    name: 'Minimal',
    blurb: 'Almost nothing on it. One idea, a lot of air.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Off-white and pale grey with one quiet accent. Light is flat, even and shadowless, like an overcast window. Composition is very sparse — a single subject small in a wide field, everything else empty. Surfaces are clean and untextured. Calm to the point of austerity.',
    industries: [],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-festive',
    name: 'Indian Festive',
    blurb: 'Warm, celebratory, and specific to the occasion rather than generic.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Deep crimson, marigold and gold with cream breathing space. Light is warm and low, as though from lamps rather than daylight, catching on gold and leaving soft pools. Composition is generous and full without becoming cluttered — decoration frames the subject rather than crowding it. Surfaces are textured: woven cloth, brushed metal, printed paper.',
    industries: ['Food & beverage', 'Retail', 'Fashion', 'Beauty'],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-bold-sale',
    name: 'Bold Sale',
    blurb: 'Loud on purpose. The offer is the whole picture.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Saturated primary colour — one dominant hue against black or white, no third colour. Light is hard and frontal with crisp shadows. Composition is dense and centred, filling the frame edge to edge. Surfaces are flat and graphic rather than photographic. Reads at a glance from across a room.',
    industries: ['Retail', 'Fashion', 'Food & beverage', 'Fitness'],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-luxury',
    name: 'Luxury',
    blurb: 'Marble, glass and slow light. Nothing shouts.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Ivory, pale stone and champagne with cool shadow. Light is soft, side-on and slow, with long gentle gradients and no hard edge anywhere. Composition is symmetrical and still, with wide margins. Surfaces are polished — marble, glass, brushed gold — reflecting rather than absorbing.',
    industries: ['Beauty', 'Fashion', 'Healthcare', 'Professional services'],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-playful',
    name: 'Playful',
    blurb: 'Bright, round and friendly. For a brand that is not serious.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Bright candy colours — coral, mint, butter yellow — three or four at once with none dominant. Light is bright and even with soft round shadows. Composition is bouncy and slightly off-grid, with elements at playful angles. Surfaces are smooth and slightly plastic, like moulded toys.',
    industries: ['Food & beverage', 'Education', 'Retail'],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-editorial',
    name: 'Editorial',
    blurb: 'Like a page from a magazine, not an advertisement.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Muted naturals — bone, clay, sage and ink — desaturated rather than grey. Light is available and imperfect, from a real window with real falloff. Composition is asymmetric and confident, with the subject well off centre and space held deliberately empty. Surfaces are honest: uncoated paper, linen, unpolished wood.',
    industries: [],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 0 },
  },
  {
    id: 'ai-cinematic',
    name: 'Cinematic',
    blurb: 'A frame from a film. Dark, wide and atmospheric.',
    group: 'ai-poster',
    kind: 'ai',
    needs: 'nothing',
    look: 'Teal shadow against warm amber highlight, deeply graded, with crushed blacks. Light is dramatic and motivated — one strong source with visible haze and falloff into darkness. Composition is wide and layered, with something in the foreground out of focus. Surfaces carry fine film grain and a subtle halation around bright edges.',
    industries: [],
    settings: { postCount: 5, wantPosterDesigns: true, wantPhotography: false, videoCount: 1 },
  },
]

/**
 * Ten promotional directions, each bound to a real layout.
 *
 * Deliberately one direction per template rather than ten offer names sharing
 * three layouts. Two cards showing the same picture is precisely the "fifty
 * random templates" problem this shelf exists to end — and it would be a lie,
 * because the preview is a true render of the layout underneath.
 *
 * These never spell anything wrong. The price comes from the catalogue and the
 * words are typeset, not drawn, so "1+1 OFEER" is not a failure mode that
 * exists here. That is the reason this group is on the front screen at all.
 */
const PROMOTIONAL: readonly CreativeDirection[] = [
  {
    id: 'promo-pair',
    name: '1+1 / Buy one get one',
    blurb: 'Two frames of equal weight with the offer between them.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'pair',
    industries: ['Food & beverage', 'Retail', 'Fashion'],
    settings: {},
  },
  {
    id: 'promo-flash',
    name: 'Flash sale',
    blurb: 'One number, half a second to land. The discount is the poster.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'flash',
    industries: ['Retail', 'Fashion', 'Beauty'],
    settings: {},
  },
  {
    id: 'promo-countdown',
    name: 'Limited time',
    blurb: 'The deadline runs above the offer, where it gets read first.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'countdown',
    industries: ['Retail', 'Fashion', 'Food & beverage', 'Fitness'],
    settings: {},
  },
  {
    id: 'promo-flat',
    name: 'Flat discount',
    blurb: 'Split layout with the offer and a coupon band. Built for a sale.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'tricolour',
    industries: ['Retail', 'Fashion', 'Beauty'],
    settings: {},
  },
  {
    id: 'promo-festive',
    name: 'Festive offer',
    blurb: 'Stacked on one axis with a product medallion. Survives a story crop.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'festive',
    industries: ['Food & beverage', 'Retail', 'Fashion', 'Beauty'],
    settings: {},
  },
  {
    id: 'promo-launch',
    name: 'New launch',
    blurb: 'Centred, quiet, generous space. For something that does not shout.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'minimal',
    industries: ['Beauty', 'Healthcare', 'B2B'],
    settings: {},
  },
  {
    id: 'promo-bestseller',
    name: 'Best seller',
    blurb: 'Framed and restrained. States one price and never a discount.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'luxury',
    industries: ['Beauty', 'Fashion', 'Professional services'],
    settings: {},
  },
  {
    id: 'promo-menu',
    name: 'Menu or price list',
    blurb: 'Dish left, name and price right. Calm, not shouted.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'menu-board',
    industries: ['Food & beverage'],
    settings: {},
  },
  {
    id: 'promo-lifestyle',
    name: 'Lifestyle offer',
    blurb: 'Full-bleed photograph with the type set on it.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'editorial',
    industries: [],
    settings: {},
  },
  {
    id: 'promo-story',
    name: 'Story offer',
    blurb: 'Composed for the vertical — type in the safe middle, edges left clear.',
    group: 'promotional',
    kind: 'template',
    needs: 'product',
    templateSlug: 'story-strip',
    industries: [],
    settings: {},
  },
]

export const CREATIVE_DIRECTIONS: readonly CreativeDirection[] = [...AI_POSTERS, ...PROMOTIONAL]

const BY_ID = new Map(CREATIVE_DIRECTIONS.map((d) => [d.id, d]))

/** Look up a direction, or null. An unknown id generates without one. */
export function findDirection(id: string | null | undefined): CreativeDirection | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

/**
 * The look a direction contributes to image prompts, if any.
 *
 * Template directions contribute nothing here and that is correct: their
 * appearance comes from the layout document, and folding a look into a prompt
 * that is never sent to an image model would be dead configuration.
 */
export function directionLook(id: string | null | undefined): string | null {
  return findDirection(id)?.look ?? null
}
