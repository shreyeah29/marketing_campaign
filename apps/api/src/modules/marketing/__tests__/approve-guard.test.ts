import { describe, expect, it } from 'vitest'

import { APPROVABLE, needsPictureFirst } from '../review-queue.controller.js'

/**
 * The bug: a poster was drawn, stored, and visible on screen — and Approve
 * answered "Cannot approved an asset that is FAILED".
 *
 * Two causes met. A later generation attempt on the same concept threw, and the
 * failure recorder set `status: FAILED` without checking whether artwork already
 * existed. Then the approval guard refused FAILED outright, so the reviewer was
 * blocked from approving a picture they could plainly see.
 */
describe('what a reviewer may approve', () => {
  it('allows a decision from FAILED', () => {
    // A person looking at a poster and pressing Approve has made the decision.
    // `status` is a machine's opinion about a past generation attempt.
    expect(APPROVABLE.has('FAILED')).toBe(true)
  })

  it('still allows the ordinary review states', () => {
    for (const state of ['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT']) {
      expect(APPROVABLE.has(state), state).toBe(true)
    }
  })

  it('does not let an already-published asset be re-decided', () => {
    // Terminal states stay terminal — widening the set must not have opened
    // these up as a side effect.
    for (const state of ['APPROVED', 'PUBLISHED', 'SCHEDULED', 'PUBLISHING']) {
      expect(APPROVABLE.has(state), state).toBe(false)
    }
  })
})

describe('approving artwork means approving a picture', () => {
  it('refuses an image concept that has no image', () => {
    // Approving this would send an empty asset toward publishing, and the
    // failure would surface at the worst possible moment.
    expect(needsPictureFirst({ kind: 'IMAGE_PROMPT', mediaUrl: null })).toBe(true)
    expect(needsPictureFirst({ kind: 'VIDEO_PROMPT' })).toBe(true)
  })

  it('allows it once the picture exists, whatever the status says', () => {
    // The case that started this: artwork present, status FAILED from a later
    // retry. The picture is what is being approved.
    expect(needsPictureFirst({ kind: 'IMAGE_PROMPT', mediaUrl: 'https://x/p.png' })).toBe(false)
  })

  it('exempts copy, which has nothing to render', () => {
    for (const kind of ['POST', 'CAPTION', 'AD_COPY', 'EMAIL']) {
      expect(needsPictureFirst({ kind, mediaUrl: null }), kind).toBe(false)
    }
  })
})
