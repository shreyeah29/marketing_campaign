import { describe, expect, it } from 'vitest'

import { BUILT_IN_TEMPLATES } from '@marketing-os/creative-engine'

import {
  CREATIVE_DIRECTIONS,
  directionLook,
  findDirection,
  type CreativeDirection,
} from '../creative-directions.js'
import { buildPosterBrief } from '../poster-brief.js'

const SLUGS = new Set(BUILT_IN_TEMPLATES.map((t) => t.slug))

describe('the direction catalogue', () => {
  it('binds every template direction to a layout that exists', () => {
    // A direction pointing at a missing slug offers a card whose preview never
    // renders and whose click produces nothing — and it would ship silently,
    // because nothing else connects these two lists.
    for (const d of CREATIVE_DIRECTIONS.filter((x) => x.kind === 'template')) {
      expect(SLUGS.has(d.templateSlug ?? ''), `${d.id} → ${String(d.templateSlug)}`).toBe(true)
    }
  })

  it('gives every AI direction a look, and no template direction one', () => {
    for (const d of CREATIVE_DIRECTIONS) {
      if (d.kind === 'ai') {
        // Without a look, an AI direction is an ordinary generation wearing a
        // name — the card would promise a style it never applies.
        expect(d.look?.length ?? 0, d.id).toBeGreaterThan(60)
        expect(d.templateSlug, d.id).toBeUndefined()
      } else {
        // A look on a template direction is dead configuration: nothing on that
        // path ever sends a prompt to an image model.
        expect(d.look, d.id).toBeUndefined()
      }
    }
  })

  it('has no duplicate ids or names', () => {
    // Ids address a direction from a stored draft; names are how a person tells
    // two cards apart. A repeat of either is a bug in a gallery.
    const ids = CREATIVE_DIRECTIONS.map((d) => d.id)
    const names = CREATIVE_DIRECTIONS.map((d) => d.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('never shows the same picture on two promotional cards', () => {
    // The whole point of the shelf. Ten offer names sharing three layouts would
    // reproduce the "fifty random templates" problem it exists to end, and the
    // previews are true renders, so the duplication would be visible.
    const used = CREATIVE_DIRECTIONS.filter((d) => d.kind === 'template').map((d) => d.templateSlug)
    expect(new Set(used).size).toBe(used.length)
  })

  it('asks for a product wherever the layout needs one', () => {
    // Every template binds product fields, so a template direction offered with
    // `needs: 'nothing'` would send someone to an empty catalogue.
    for (const d of CREATIVE_DIRECTIONS.filter((x) => x.kind === 'template')) {
      expect(d.needs, d.id).toBe('product')
    }
  })

  it('keeps at least one picture kind on for every AI direction', () => {
    // Both off means a direction that generates no pictures at all, which is
    // never what choosing one meant.
    for (const d of CREATIVE_DIRECTIONS.filter((x) => x.kind === 'ai')) {
      const some = d.settings.wantPosterDesigns === true || d.settings.wantPhotography !== false
      expect(some, d.id).toBe(true)
    }
  })

  it('describes light and colour rather than adjectives', () => {
    // "Beautiful" and "premium" change nothing about a generated picture. A
    // palette, a light and a density change all of it, so every look must name
    // them — this is what separates eight directions from one in eight tints.
    for (const d of CREATIVE_DIRECTIONS.filter((x) => x.kind === 'ai')) {
      expect(d.look, d.id).toMatch(/light|lit|lighting/i)
      expect(d.look, d.id).toMatch(/composition/i)
    }
  })
})

describe('finding a direction', () => {
  it('returns null for an unknown or missing id rather than throwing', () => {
    // A stored draft can name a direction removed in a later release, and that
    // must generate an ordinary picture rather than fail the run.
    expect(findDirection('nope')).toBeNull()
    expect(findDirection(null)).toBeNull()
    expect(findDirection(undefined)).toBeNull()
    expect(directionLook('nope')).toBeNull()
  })

  it('gives a look for an AI direction and none for a template one', () => {
    const ai = CREATIVE_DIRECTIONS.find((d) => d.kind === 'ai') as CreativeDirection
    const tpl = CREATIVE_DIRECTIONS.find((d) => d.kind === 'template') as CreativeDirection
    expect(directionLook(ai.id)).toBeTruthy()
    expect(directionLook(tpl.id)).toBeNull()
  })
})

describe('a direction inside a poster brief', () => {
  it('travels through the same slot a client’s saved look does', () => {
    // One path for both, so a built-in direction and an uploaded style cannot
    // start behaving differently.
    const brief = buildPosterBrief({
      headline: 'Rakshabandhan Special',
      styleLook: directionLook('ai-festive') ?? '',
    })
    expect(brief).toContain('HOUSE STYLE')
    expect(brief).toContain('marigold')
    expect(brief).toMatch(/not let it change the layout/i)
  })

  it('still refuses to print money when a direction is applied', () => {
    const brief = buildPosterBrief({
      headline: 'Everything at ₹99',
      styleLook: directionLook('ai-bold-sale') ?? '',
    })
    expect(brief).not.toContain('₹99')
  })
})
