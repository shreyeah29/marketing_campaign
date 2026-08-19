import type { IconName } from '@/components/icon'
import type { CreateDraft } from './types'

/**
 * Recipes — a campaign that already knows what it is, before anyone types.
 *
 * What this replaces was a stack of one-line suggestions grouped under Launch /
 * Grow / Channel / Analyse. Each one dropped a sentence into the box and stopped
 * there, so every campaign still began by guessing how many pictures to make,
 * whether they should be designed posters or photographs, and whether any of it
 * needed a video. Those are the decisions that actually change the output, and
 * they were being made by defaults nobody chose.
 *
 * A recipe answers all of them at once. Picking "Festival poster set" is not a
 * sentence — it is five designed posters carrying the offer in type, no
 * photography, no video, captions for the chosen channels. The brief text comes
 * with it, and stays editable, because the recipe is a starting point rather
 * than a form.
 *
 * ## Why the counts are shown, and why they are honest
 *
 * Every card states exactly what it produces. That is not decoration: the number
 * of concepts is the single biggest driver of what a run costs and how long it
 * takes, and it used to be invisible until the assets appeared. Choosing between
 * "3 posters" and "10 posters" is a real decision, so it happens on the card.
 *
 * ## No fabricated previews
 *
 * There are deliberately no sample images here. The honest options were to ship
 * stock artwork that no client will ever receive, or to describe the output
 * precisely and let the first real run fill the gallery. Showing invented
 * examples of what a generator will produce is a promise made on its behalf.
 */

export interface Recipe {
  readonly id: string
  readonly name: string
  /** One line, in the language of the outcome rather than the mechanism. */
  readonly blurb: string
  readonly icon: IconName
  /**
   * Industries this suits, for filtering. Empty means it suits any business —
   * most do, and tagging everything with everything would make the filter noise.
   */
  readonly industries: readonly string[]
  /** The brief text this drops into the box. Fully editable afterwards. */
  readonly brief: string
  /**
   * The draft fields the recipe decides.
   *
   * Only what the recipe genuinely has an opinion about. Channels, audience and
   * duration are the client's business and stay untouched — a recipe that
   * silently picked someone's audience would be worse than no recipe.
   */
  readonly settings: Partial<
    Pick<
      CreateDraft,
      | 'postCount'
      | 'videoCount'
      | 'wantPosterDesigns'
      | 'wantPhotography'
      | 'wantEmails'
      | 'wantLanding'
      | 'formats'
    >
  >
}

/** Human summary of what a recipe produces, built from its own settings. */
export function recipeOutputs(recipe: Recipe): string[] {
  const s = recipe.settings
  const posts = s.postCount ?? 5
  const out: string[] = []

  if (s.wantPosterDesigns === true && s.wantPhotography === true) {
    out.push(`${String(posts)} concepts — posters and photography`)
  } else if (s.wantPosterDesigns === true) {
    out.push(`${String(posts)} designed posters, offer written on the artwork`)
  } else {
    out.push(`${String(posts)} photographs, no text on the picture`)
  }

  out.push(`${String(posts)} captions, adapted per channel`)
  if (s.videoCount) out.push(`${String(s.videoCount)} video concept${s.videoCount > 1 ? 's' : ''}`)
  if (s.wantEmails) out.push('An email sequence')
  if (s.wantLanding) out.push('Landing page copy')
  return out
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'festival-posters',
    name: 'Festival poster set',
    blurb: 'Designed posters for a festival, with the offer written on the artwork.',
    icon: 'sparkles',
    industries: ['Food & beverage', 'Retail', 'Fashion', 'Beauty'],
    brief:
      'Run a festival campaign with designed posters that carry the offer in type — the greeting, the offer, the dates and the terms all readable on the artwork. Warm and celebratory, recognisably for this occasion, and clearly for our own audience rather than generic stock.',
    settings: {
      postCount: 5,
      wantPosterDesigns: true,
      wantPhotography: false,
      videoCount: 0,
      formats: ['posts', 'stories'],
    },
  },
  {
    id: 'product-launch',
    name: 'Product launch',
    blurb: 'Photography-led introduction of one new product, with ad copy.',
    icon: 'zap',
    industries: [],
    brief:
      'Introduce a new product to people who have not seen it before. Lead with photography that shows what it actually is, then say plainly what it does and why it is worth trying. Include ad copy aimed at cold audiences and captions for warm ones.',
    settings: {
      postCount: 5,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 1,
      formats: ['posts', 'stories', 'ads'],
    },
  },
  {
    id: 'weekend-offer',
    name: 'Weekend offer',
    blurb: 'A short, urgent run — three posters for a two-day window.',
    icon: 'clock',
    industries: ['Food & beverage', 'Retail', 'Fitness', 'Beauty'],
    brief:
      'Promote a short weekend offer with a real deadline. Three designed posters, each stating the offer and the exact window it runs. Urgency without shouting — the offer and the dates do the work.',
    settings: {
      postCount: 3,
      wantPosterDesigns: true,
      wantPhotography: false,
      videoCount: 0,
      formats: ['posts', 'stories'],
    },
  },
  {
    id: 'menu-showcase',
    name: 'Menu showcase',
    blurb: 'Ten dishes, photographed properly, one per post.',
    icon: 'images',
    industries: ['Food & beverage'],
    brief:
      'Show what we actually serve, one dish per post, photographed appetisingly and honestly. No offers and no prices on the pictures — this is about making people hungry and telling them what the dish is.',
    settings: {
      postCount: 10,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 0,
      formats: ['posts'],
    },
  },
  {
    id: 'before-after',
    name: 'Before and after',
    blurb: 'Results-led proof for a service business.',
    icon: 'refresh',
    industries: ['Beauty', 'Fitness', 'Healthcare', 'Home services'],
    brief:
      'Show the result of the service, framed as a change rather than a claim. Each concept pairs the situation someone arrives with against what they leave with. Keep the language specific and avoid promising outcomes we cannot evidence.',
    settings: {
      postCount: 5,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 1,
      formats: ['posts', 'reels'],
    },
  },
  {
    id: 'customer-story',
    name: 'Customer story',
    blurb: 'Three posts built around what a real customer said.',
    icon: 'message-square',
    industries: [],
    brief:
      'Build three posts around genuine customer feedback. Lead with what they said in their own words, keep our own copy short underneath, and let the quote carry the post. Do not invent quotes — leave clear space for real ones to be dropped in.',
    settings: {
      postCount: 3,
      wantPosterDesigns: true,
      wantPhotography: true,
      videoCount: 0,
      formats: ['posts'],
    },
  },
  {
    id: 'new-opening',
    name: 'New opening',
    blurb: 'Announce a new location — where, when, and what to expect.',
    icon: 'globe',
    industries: ['Food & beverage', 'Retail', 'Fitness', 'Beauty', 'Healthcare'],
    brief:
      'Announce a new location. Say clearly where it is, when it opens, and what someone will find when they get there. Mix designed posters carrying the address and date with photography of the space itself.',
    settings: {
      postCount: 5,
      wantPosterDesigns: true,
      wantPhotography: true,
      videoCount: 1,
      formats: ['posts', 'stories'],
    },
  },
  {
    id: 'reels-week',
    name: 'A week of Reels',
    blurb: 'Three short-video concepts with hooks written for sound-off viewing.',
    icon: 'video',
    industries: [],
    brief:
      'Plan a week of short-form video. Three distinct concepts, each with a hook that works in the first two seconds with the sound off, and captions written to be read rather than heard.',
    settings: {
      postCount: 3,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 3,
      formats: ['reels', 'stories'],
    },
  },
  {
    id: 'lead-magnet',
    name: 'Lead magnet',
    blurb: 'Something worth giving an email address for, plus the page and follow-up.',
    icon: 'filter',
    industries: ['B2B', 'Education', 'Professional services', 'Healthcare'],
    brief:
      'Build a campaign around something genuinely useful given away in exchange for contact details. Ads that state the offer plainly, a landing page that delivers it without friction, and an email sequence that follows up without nagging.',
    settings: {
      postCount: 3,
      wantPosterDesigns: true,
      wantPhotography: false,
      videoCount: 0,
      wantEmails: true,
      wantLanding: true,
      formats: ['posts', 'ads'],
    },
  },
  {
    id: 'seasonal-sale',
    name: 'Seasonal sale',
    blurb: 'A full sale run — posters, ads and a reminder near the end.',
    icon: 'megaphone',
    industries: ['Retail', 'Fashion', 'Beauty', 'Food & beverage'],
    brief:
      'Run a seasonal sale from announcement to last call. Open by stating the offer clearly, sustain it in the middle with what is actually included, and close with a genuine deadline reminder. Designed posters throughout so the offer is always readable.',
    settings: {
      postCount: 10,
      wantPosterDesigns: true,
      wantPhotography: true,
      videoCount: 1,
      formats: ['posts', 'stories', 'ads'],
    },
  },
  {
    id: 'behind-scenes',
    name: 'Behind the scenes',
    blurb: 'Quieter posts about how the work is actually done.',
    icon: 'users',
    industries: [],
    brief:
      'Show how the work actually gets done — the people, the process, the ordinary parts. Unpolished on purpose. No offers, no calls to action beyond following along; this campaign is for people who already know us.',
    settings: {
      postCount: 5,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 1,
      formats: ['posts', 'stories'],
    },
  },
  {
    id: 'brand-story',
    name: 'Brand story',
    blurb: 'Who we are and why, told across three posts and a page.',
    icon: 'book',
    industries: [],
    brief:
      'Tell the story of the business across three posts and a page: why it started, what we believe about the work, and who it is for. Warm and specific rather than corporate — no mission-statement language.',
    settings: {
      postCount: 3,
      wantPosterDesigns: false,
      wantPhotography: true,
      videoCount: 0,
      wantLanding: true,
      formats: ['posts'],
    },
  },
] as const

/** Every industry named by at least one recipe, for the filter row. */
export const RECIPE_INDUSTRIES: readonly string[] = [
  ...new Set(RECIPES.flatMap((r) => r.industries)),
].sort()

/**
 * Recipes for an industry.
 *
 * An untagged recipe suits any business and always appears — those are the ones
 * that describe a marketing job rather than a sector, and hiding "Product launch"
 * from a café because it was not tagged for food would be a filter working
 * against the person using it.
 */
export function recipesFor(industry: string | null): readonly Recipe[] {
  if (!industry) return RECIPES
  return RECIPES.filter((r) => r.industries.length === 0 || r.industries.includes(industry))
}
