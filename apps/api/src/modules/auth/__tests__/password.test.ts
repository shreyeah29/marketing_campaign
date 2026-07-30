/**
 * Shared password hashing.
 *
 * This is the scheme both Better Auth and provisioning use, so the property that
 * matters is simple and load-bearing: a password hashed here verifies here, and a
 * wrong password does not. If this ever diverged, a provisioned owner could not log
 * in — the exact bug Phase 6 set out to remove.
 */

import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '../password.js'

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(await verifyPassword({ hash, password: 'correct-horse-battery-staple' })).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('the-right-one')
    expect(await verifyPassword({ hash, password: 'the-wrong-one' })).toBe(false)
  })

  it('produces a different hash each time (salted)', async () => {
    const a = await hashPassword('same-input')
    const b = await hashPassword('same-input')
    expect(a).not.toBe(b)
    // Both still verify — the salt is embedded in the hash.
    expect(await verifyPassword({ hash: a, password: 'same-input' })).toBe(true)
    expect(await verifyPassword({ hash: b, password: 'same-input' })).toBe(true)
  })
})
