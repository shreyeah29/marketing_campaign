import { describe, expect, it } from 'vitest'

import { AdapterError } from '../llm.js'
import {
  IMAGE_MODEL_CANDIDATES,
  imageModelCandidates,
  isModelUnavailable,
} from '../openai-media.js'

/**
 * Which model a project may call is an account setting, not a code decision.
 *
 * `gpt-image-1` needs a verified OpenAI organisation and answers 403 without
 * one — that is what took posters down in production, and the error read as an
 * internal fault. The caller walks the candidates and keeps the first that is
 * not refused, so the same build works before and after verification.
 *
 * The distinction this file pins is which failures mean "try the next one".
 * Getting it wrong in the permissive direction turns one clear error into three
 * and reports the last, weakest one as the reason.
 */

describe('the candidate list', () => {
  it('runs best to floor, ending on the model that needs no verification', () => {
    expect(IMAGE_MODEL_CANDIDATES[0]).toBe('gpt-image-2')
    expect(IMAGE_MODEL_CANDIDATES[IMAGE_MODEL_CANDIDATES.length - 1]).toBe('dall-e-3')
  })

  it('holds no duplicates, which would double a wasted round trip', () => {
    expect(new Set(IMAGE_MODEL_CANDIDATES).size).toBe(IMAGE_MODEL_CANDIDATES.length)
  })
})

describe('isModelUnavailable', () => {
  it('recognises the refusal that actually happened', () => {
    const real = new AdapterError(
      'Project `proj_CC3ZcJxDoI2Ym5p1roGTr3JW` does not have access to model `gpt-image-1`',
      'openai',
      403,
    )
    expect(isModelUnavailable(real)).toBe(true)
  })

  it('recognises a model this account has never heard of', () => {
    expect(isModelUnavailable(new AdapterError('model_not_found', 'openai', 404))).toBe(true)
    expect(isModelUnavailable(new AdapterError('Unknown model: gpt-image-2', 'openai', 400))).toBe(
      true,
    )
  })

  it('does not treat a rate limit as a reason to try a weaker model', () => {
    // A 429 says something about this request, not about the model. Falling
    // through would draw the poster with dall-e-3 for a reason that had nothing
    // to do with availability.
    expect(isModelUnavailable(new AdapterError('Rate limit reached', 'openai', 429))).toBe(false)
  })

  it('does not fall through on a content rejection or a server fault', () => {
    expect(isModelUnavailable(new AdapterError('content_policy_violation', 'openai', 400))).toBe(
      false,
    )
    expect(isModelUnavailable(new AdapterError('server had an error', 'openai', 500))).toBe(false)
  })

  it('is false for anything that is not an adapter error', () => {
    expect(isModelUnavailable(new Error('socket hang up'))).toBe(false)
    expect(isModelUnavailable(null)).toBe(false)
  })
})

describe('the message matters as much as the status', () => {
  it('recognises "does not exist", which arrives as a 400', () => {
    // The exact line from production: the walk stopped here and reported it as
    // a genuine fault, so nothing said why the preferred model had been skipped.
    const real = new AdapterError("The model 'dall-e-3' does not exist.", 'openai', 400)
    expect(isModelUnavailable(real)).toBe(true)
  })

  it('still refuses to fall through on a real fault carrying a 400', () => {
    expect(isModelUnavailable(new AdapterError('Invalid prompt', 'openai', 400))).toBe(false)
  })
})

describe('imageModelCandidates', () => {
  it('uses the built-in order when nothing is configured', () => {
    expect(imageModelCandidates()).toEqual(IMAGE_MODEL_CANDIDATES)
    expect(imageModelCandidates('')).toEqual(IMAGE_MODEL_CANDIDATES)
    expect(imageModelCandidates('   ')).toEqual(IMAGE_MODEL_CANDIDATES)
  })

  it('lets one model be pinned without a deploy', () => {
    // Which models an account may call depends on verification and tier, and
    // neither is knowable from here — so it is configuration.
    expect(imageModelCandidates('gpt-image-2')).toEqual(['gpt-image-2'])
  })

  it('accepts an ordered list', () => {
    expect(imageModelCandidates('gpt-image-2, dall-e-3')).toEqual(['gpt-image-2', 'dall-e-3'])
  })
})
