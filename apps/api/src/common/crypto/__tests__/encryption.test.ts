/**
 * Envelope encryption — round trip and tamper detection.
 *
 * Provider credentials are the platform's most sensitive stored data, and the
 * previous system leaked them as plaintext columns. These tests hold the
 * replacement to its two guarantees: a sealed secret opens back to exactly what
 * went in, and any tampering with the stored bytes is detected rather than
 * silently accepted.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { EncryptionService } from '../encryption.service.js'

// The service reads ENCRYPTION_MASTER_KEY from the environment at construction.
process.env['ENCRYPTION_MASTER_KEY'] ??= 'test-master-key-at-least-32-characters-long'
process.env['DATABASE_URL'] ??= 'postgresql://x:x@localhost:5432/x'
process.env['REDIS_URL'] ??= 'redis://localhost:6379'
process.env['BETTER_AUTH_SECRET'] ??= 'test-better-auth-secret-32-chars-minimum'

let svc: EncryptionService

beforeAll(() => {
  svc = new EncryptionService()
})

describe('round trip', () => {
  it('opens a sealed secret back to the original', () => {
    const secret = { apiKey: 'sk-live-abcdef123456', region: 'us-east-1' }
    const sealed = svc.seal(secret)
    expect(svc.open(sealed)).toEqual(secret)
  })

  it('never stores the plaintext in the sealed bytes', () => {
    const secret = { apiKey: 'sk-super-secret-value-42' }
    const sealed = svc.seal(secret)
    // The secret must not appear in any stored field.
    const haystack = Buffer.concat([
      sealed.ciphertext,
      sealed.iv,
      sealed.authTag,
      sealed.wrappedKey,
    ]).toString('latin1')
    expect(haystack).not.toContain('sk-super-secret-value-42')
  })

  it('produces different ciphertext for the same secret each time', () => {
    // Fresh data key + IV per call, so encrypting the same value twice cannot be
    // correlated by equal ciphertext.
    const secret = { apiKey: 'identical-key' }
    const a = svc.seal(secret)
    const b = svc.seal(secret)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
    expect(a.wrappedKey.equals(b.wrappedKey)).toBe(false)
    // Both still open to the same plaintext.
    expect(svc.open(a)).toEqual(secret)
    expect(svc.open(b)).toEqual(secret)
  })
})

describe('tamper detection', () => {
  it('rejects a modified ciphertext', () => {
    const sealed = svc.seal({ apiKey: 'tamper-me' })
    const tampered = { ...sealed, ciphertext: flipByte(sealed.ciphertext) }
    // GCM authentication fails rather than returning corrupted plaintext.
    expect(() => svc.open(tampered)).toThrow()
  })

  it('rejects a modified auth tag', () => {
    const sealed = svc.seal({ apiKey: 'tamper-tag' })
    const tampered = { ...sealed, authTag: flipByte(sealed.authTag) }
    expect(() => svc.open(tampered)).toThrow()
  })

  it('rejects a modified wrapped key', () => {
    const sealed = svc.seal({ apiKey: 'tamper-wrap' })
    const tampered = { ...sealed, wrappedKey: flipByte(sealed.wrappedKey) }
    expect(() => svc.open(tampered)).toThrow()
  })

  it('cannot be opened by a service with a different master key', () => {
    const sealed = svc.seal({ apiKey: 'wrong-key-test' })
    // Construct a service with a genuinely different master key. Explicit override
    // rather than mutating the env, which loadEnv() memoises.
    const other = new EncryptionService('a-completely-different-master-key-32chars')
    // A different master key cannot unwrap the data key.
    expect(() => other.open(sealed)).toThrow()
  })
})

describe('masking', () => {
  it('shows only the ends of a key', () => {
    expect(svc.maskHint('sk-live-abcdef1234')).toBe('sk-••••1234')
    expect(svc.maskHint('short')).toBe('••••')
  })
})

function flipByte(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer)
  copy[0] = (copy[0] ?? 0) ^ 0xff
  return copy
}
