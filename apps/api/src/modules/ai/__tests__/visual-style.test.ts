import { describe, expect, it } from 'vitest'

import { resolveVisualStyle } from '../campaign-generation.service.js'

/**
 * The bug this pins down: someone ticked "posters with text", the model omitted
 * `visualStyle` on the concept, the code fell back to PHOTO, and they received a
 * plain photograph with a brand strip and none of their offer on it. The choice
 * was made by a person and discarded by a missing key.
 */
describe('choosing between a poster and a photograph', () => {
  const POSTERS = { posters: true, photography: false }
  const PHOTOS = { posters: false, photography: true }
  const BOTH = { posters: true, photography: true }

  it('honours "posters only" even when the model says nothing at all', () => {
    // The exact failure. Undefined used to mean PHOTO regardless of the tick.
    expect(resolveVisualStyle('IMAGE_PROMPT', undefined, POSTERS)).toBe('POSTER')
    expect(resolveVisualStyle('IMAGE_PROMPT', '', POSTERS)).toBe('POSTER')
  })

  it('honours "posters only" even when the model actively disagrees', () => {
    // A person ticking one box outranks a model's opinion about one concept.
    expect(resolveVisualStyle('IMAGE_PROMPT', 'PHOTO', POSTERS)).toBe('POSTER')
  })

  it('honours "photography only" even when the model asks for a poster', () => {
    // The mirror case, and the more damaging one to get wrong: a poster the
    // person did not ask for comes back with invented lettering on it.
    expect(resolveVisualStyle('IMAGE_PROMPT', 'POSTER', PHOTOS)).toBe('PHOTO')
  })

  it('lets the model decide per concept when both kinds are wanted', () => {
    // Ticking both is asking for the model's judgement; overriding it there
    // would make the second checkbox do nothing.
    expect(resolveVisualStyle('IMAGE_PROMPT', 'POSTER', BOTH)).toBe('POSTER')
    expect(resolveVisualStyle('IMAGE_PROMPT', 'PHOTO', BOTH)).toBe('PHOTO')
  })

  it('defaults an unlabelled concept to a photograph when both are wanted', () => {
    // The safe direction: a poster mislabelled a photograph is a picture missing
    // its words — visible, and one click from being regenerated. The reverse
    // comes back covered in lettering a model invented.
    expect(resolveVisualStyle('IMAGE_PROMPT', undefined, BOTH)).toBe('PHOTO')
  })

  it('keeps the old behaviour when the caller states no preference', () => {
    // An older client sends nothing. That is not the same as ticking both, and
    // it must not be silently switched to posters.
    expect(resolveVisualStyle('IMAGE_PROMPT', 'POSTER', undefined)).toBe('POSTER')
    expect(resolveVisualStyle('IMAGE_PROMPT', undefined, undefined)).toBe('PHOTO')
  })

  it('never marks copy as a poster, whatever anyone asked for', () => {
    // A caption has no artwork to typeset onto. Marking it POSTER would send it
    // down the drawing path with nothing to draw.
    for (const kind of ['POST', 'CAPTION', 'AD_COPY', 'VIDEO_PROMPT']) {
      expect(resolveVisualStyle(kind, 'POSTER', POSTERS), kind).toBe('PHOTO')
    }
  })
})
