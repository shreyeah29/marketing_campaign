import type { TemplateDocument } from '../template/schema.js'

import { COUNTDOWN } from './countdown.js'
import { EDITORIAL } from './editorial.js'
import { FESTIVE } from './festive.js'
import { FLASH } from './flash.js'
import { LUXURY } from './luxury.js'
import { MENU_BOARD } from './menu-board.js'
import { MINIMAL } from './minimal.js'
import { PAIR } from './pair.js'
import { STORY_STRIP } from './story-strip.js'
import { TRICOLOUR } from './tricolour.js'

/**
 * The built-in template library.
 *
 * Templates ship as code rather than seeded rows. They are versioned with the
 * release that renders them, they cannot drift between environments, and a
 * template that fails to parse fails the build instead of failing a customer's
 * campaign. Organisation-authored templates will live in the database beside
 * these; that is a different lifecycle, not a reason to move these.
 *
 * Each entry is a genuinely different structure — split, centred, diagonal,
 * framed, stacked — because a library where every entry is one layout in five
 * palettes is a colour picker wearing a costume.
 */

export interface BuiltInTemplate {
  /** Stable identifier used in URLs and stored on a creative. */
  readonly slug: string
  readonly document: TemplateDocument
  /** One line, shown under the name in the gallery. */
  readonly description: string
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    slug: 'tricolour',
    document: TRICOLOUR,
    description: 'Split layout with a bold offer and a coupon band. Built for a sale.',
  },
  {
    slug: 'minimal',
    document: MINIMAL,
    description: 'Centred, quiet, generous space. For skincare that does not shout.',
  },
  {
    slug: 'luxury',
    document: LUXURY,
    description: 'Framed and restrained. States one price and never a discount.',
  },
  {
    slug: 'festive',
    document: FESTIVE,
    description: 'Stacked on one axis with a product medallion. Survives a story crop.',
  },
  {
    slug: 'flash',
    document: FLASH,
    description: 'The discount is the poster. One number, half a second to land.',
  },
  {
    slug: 'editorial',
    document: EDITORIAL,
    description: 'Full-bleed photograph with the type set on it. For a real shot, not a packshot.',
  },
  {
    slug: 'menu-board',
    document: MENU_BOARD,
    description:
      'Dish left, name and price right. States a price calmly instead of shouting a discount.',
  },
  {
    slug: 'pair',
    document: PAIR,
    description:
      'Two frames of equal weight with the offer between them. The layout a 1+1 actually needs.',
  },
  {
    slug: 'countdown',
    document: COUNTDOWN,
    description: 'The deadline runs above the offer, because that is what makes it interesting.',
  },
  {
    slug: 'story-strip',
    document: STORY_STRIP,
    description:
      'Composed for the vertical: type banded into the safe middle, nothing near the edges.',
  },
]

const BY_SLUG = new Map(BUILT_IN_TEMPLATES.map((t) => [t.slug, t]))

/** Look up a template, or null. Callers decide whether an unknown slug is an error. */
export function findTemplate(slug: string): BuiltInTemplate | null {
  return BY_SLUG.get(slug) ?? null
}

/** The template used when none is chosen. */
export const DEFAULT_TEMPLATE_SLUG = 'tricolour'

export { COUNTDOWN, FESTIVE, FLASH, LUXURY, MINIMAL, PAIR, TRICOLOUR }
