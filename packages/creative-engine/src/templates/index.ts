import type { TemplateDocument } from '../template/schema.js'

import { FESTIVE } from './festive.js'
import { FLASH } from './flash.js'
import { LUXURY } from './luxury.js'
import { MINIMAL } from './minimal.js'
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
]

const BY_SLUG = new Map(BUILT_IN_TEMPLATES.map((t) => [t.slug, t]))

/** Look up a template, or null. Callers decide whether an unknown slug is an error. */
export function findTemplate(slug: string): BuiltInTemplate | null {
  return BY_SLUG.get(slug) ?? null
}

/** The template used when none is chosen. */
export const DEFAULT_TEMPLATE_SLUG = 'tricolour'

export { FESTIVE, FLASH, LUXURY, MINIMAL, TRICOLOUR }
