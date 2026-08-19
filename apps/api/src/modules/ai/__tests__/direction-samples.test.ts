import { describe, expect, it } from 'vitest'

import { hasDirectionSample, readDirectionSample } from '../direction-samples.js'

/**
 * The ids in this catalogue become filenames, which is the whole reason these
 * exist. Everything else about the module is a file read.
 */
describe('reading a direction sample', () => {
  it('refuses anything that is not an id, rather than sanitising it', async () => {
    // A caller passing `../../` is not making a typo. Stripping the dots and
    // continuing would leave a reader unsure whether traversal was possible;
    // refusing outright answers it.
    for (const bad of [
      '../../../etc/passwd',
      '..',
      'a/b',
      'a\\b',
      'ai-premium/../../secret',
      '',
      'A'.repeat(200),
      'ai_premium',
      'ai premium',
      'AI-PREMIUM',
    ]) {
      // Awaited, not a floating `.resolves`: an unawaited assertion here passes
      // whatever the function does, which is worse than having no test at all.
      expect(await readDirectionSample(bad), bad).toBeNull()
    }
  })

  it('returns null for a real-looking id with no committed file', async () => {
    // The ordinary case for a direction whose sample has not been authored yet:
    // the card falls back to a placeholder rather than the request failing.
    expect(await readDirectionSample('definitely-not-a-direction')).toBeNull()
    expect(await hasDirectionSample('definitely-not-a-direction')).toBe(false)
  })

  it('gives the same answer twice, from the cache', async () => {
    // Committed files never change while the process runs, so the second read
    // must not touch the disk — and must not disagree with the first.
    const a = await readDirectionSample('ai-premium')
    const b = await readDirectionSample('ai-premium')
    expect(a).toBe(b)
  })
})
