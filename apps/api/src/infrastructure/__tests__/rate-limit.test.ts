import { describe, expect, it } from 'vitest'

import { presentsSession } from '../rate-limit.js'

/**
 * Which allowance a request gets.
 *
 * The regression this pins: the limiter chose its tier from
 * `request.principal`, which is attached by a Nest guard and is therefore always
 * undefined on Fastify's `onRequest` hook where the limiter runs. Every signed-in
 * user was metered at the anonymous 60/minute, and a screen that polls exhausted
 * it in about a minute. Nothing failed loudly — the API simply started answering
 * 429 to a logged-in customer while claiming not to know them.
 */

const cookie = (value: string): unknown => ({ headers: { cookie: value } })

describe('presentsSession', () => {
  it('recognises the session cookie among others', () => {
    expect(presentsSession(cookie('theme=dark; mos.session_token=abc123; other=1'))).toBe(true)
  })

  it('recognises the __Secure- prefixed form used over https', () => {
    expect(presentsSession(cookie('__Secure-mos.session_token=abc123'))).toBe(true)
  })

  it('is false with no cookie header at all', () => {
    expect(presentsSession({ headers: {} })).toBe(false)
    expect(presentsSession({})).toBe(false)
    expect(presentsSession(null)).toBe(false)
  })

  it('is false for unrelated cookies', () => {
    expect(presentsSession(cookie('theme=dark; mos.other=1'))).toBe(false)
  })

  it('does not mistake a differently named token for a session', () => {
    // The platform bearer lives in localStorage and never arrives as a cookie;
    // nothing else should be able to claim the higher tier by accident.
    expect(presentsSession(cookie('mos.platform.token=abc'))).toBe(false)
  })
})
