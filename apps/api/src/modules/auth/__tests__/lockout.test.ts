/**
 * Account lockout logic.
 *
 * Exercised against an in-memory stand-in for the exact Redis surface the service
 * uses, so the behaviour under test is the lockout policy itself — five failures
 * freeze the account, a success clears it — not Redis.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { LockoutService } from '../lockout.service.js'

/** Minimal fake of the ioredis methods LockoutService touches. */
class FakeRedis {
  private store = new Map<string, number>()

  get(key: string): Promise<string | null> {
    const v = this.store.get(key)
    return Promise.resolve(v === undefined ? null : String(v))
  }
  incr(key: string): Promise<number> {
    const next = (this.store.get(key) ?? 0) + 1
    this.store.set(key, next)
    return Promise.resolve(next)
  }
  expire(_key: string, _seconds: number): Promise<number> {
    return Promise.resolve(1)
  }
  del(key: string): Promise<number> {
    const had = this.store.delete(key)
    return Promise.resolve(had ? 1 : 0)
  }
}

describe('LockoutService', () => {
  let redis: FakeRedis
  let lockout: LockoutService

  beforeEach(() => {
    redis = new FakeRedis()
    lockout = new LockoutService(redis as unknown as never)
  })

  it('is not locked before any failures', async () => {
    expect(await lockout.isLocked('user@example.com')).toBe(false)
  })

  it('locks after the threshold of failures', async () => {
    const email = 'target@example.com'
    for (let i = 0; i < LockoutService.maxAttempts - 1; i += 1) {
      await lockout.recordFailure(email)
      expect(await lockout.isLocked(email)).toBe(false)
    }
    // The threshold-th failure trips the lock.
    await lockout.recordFailure(email)
    expect(await lockout.isLocked(email)).toBe(true)
  })

  it('is keyed per identifier, case-insensitively', async () => {
    for (let i = 0; i < LockoutService.maxAttempts; i += 1) await lockout.recordFailure('Victim@Example.com')
    expect(await lockout.isLocked('victim@example.com')).toBe(true)
    // A different account is unaffected.
    expect(await lockout.isLocked('someone-else@example.com')).toBe(false)
  })

  it('clears the lock on a successful login', async () => {
    const email = 'recover@example.com'
    for (let i = 0; i < LockoutService.maxAttempts; i += 1) await lockout.recordFailure(email)
    expect(await lockout.isLocked(email)).toBe(true)
    await lockout.clear(email)
    expect(await lockout.isLocked(email)).toBe(false)
  })
})
