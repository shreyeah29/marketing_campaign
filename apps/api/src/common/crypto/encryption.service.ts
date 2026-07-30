import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { loadEnv } from '../../config/env.js'

/**
 * Envelope encryption for provider credentials.
 *
 * This is the correction to the previous implementation's worst data-handling
 * flaw: it stored customer API keys as plaintext columns. Here a credential is
 * sealed before it ever reaches a row, and the plaintext exists only in memory,
 * only at the moment of use.
 *
 * The scheme is envelope encryption:
 *   · A fresh random **data key** encrypts the secret with AES-256-GCM.
 *   · The **master key** (from `ENCRYPTION_MASTER_KEY`, held only in the process
 *     environment) wraps the data key.
 *   · The row stores ciphertext, iv, auth tag and the wrapped data key — never the
 *     master key, never a plaintext secret.
 *
 * Why envelope rather than encrypting directly with the master key: rotating the
 * master key re-wraps the data keys without re-encrypting every secret, and a
 * per-record data key limits the blast radius of any single key compromise. The
 * master key never touches a database row, so a database dump alone cannot decrypt
 * anything.
 *
 * GCM gives authenticated encryption: a tampered ciphertext fails to decrypt
 * rather than silently returning corrupted plaintext.
 */

export interface SealedSecret {
  readonly ciphertext: Buffer
  readonly iv: Buffer
  readonly authTag: Buffer
  readonly wrappedKey: Buffer
  /** Which master-key version wrapped this, so rotation can find what to re-wrap. */
  readonly keyVersion: number
}

@Injectable()
export class EncryptionService {
  private readonly masterKey: Buffer
  private static readonly KEY_VERSION = 1
  private static readonly ALGO = 'aes-256-gcm'

  /**
   * @param masterKeyOverride test/rotation hook. Production leaves it unset and the
   * key comes from `ENCRYPTION_MASTER_KEY`. Passing it explicitly is how a key
   * rotation or a test drives a specific key without depending on the env cache.
   */
  constructor(masterKeyOverride?: string) {
    const source = masterKeyOverride ?? loadEnv().ENCRYPTION_MASTER_KEY
    // Derive a fixed-length 256-bit key from the configured secret via HKDF, so
    // the secret can be any length ≥ 32 and the key material is uniform. The salt
    // is a constant label, not a secret — HKDF's security comes from the input key
    // material, and a per-purpose label domain-separates this from any other use
    // of the same secret.
    this.masterKey = Buffer.from(
      hkdfSync('sha256', Buffer.from(source), 'vsp-credential-wrap', 'master-key', 32),
    )
  }

  /**
   * Seals a secret for storage.
   *
   * The secret is the credential object serialised to JSON (an API key, or a set
   * of fields for a multi-part credential). Every call uses a fresh data key and a
   * fresh IV, so encrypting the same secret twice yields different ciphertext —
   * no equality leaks.
   */
  seal(secret: Record<string, unknown>): SealedSecret {
    const plaintext = Buffer.from(JSON.stringify(secret), 'utf8')

    // Fresh per-record data key.
    const dataKey = randomBytes(32)
    const iv = randomBytes(12)

    const cipher = createCipheriv(EncryptionService.ALGO, dataKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Wrap the data key with the master key.
    const wrapIv = randomBytes(12)
    const wrapCipher = createCipheriv(EncryptionService.ALGO, this.masterKey, wrapIv)
    const wrappedBody = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()])
    const wrapTag = wrapCipher.getAuthTag()
    // Store the wrap IV + tag alongside the wrapped key so unwrapping is
    // self-contained: [wrapIv(12)][wrapTag(16)][wrappedBody].
    const wrappedKey = Buffer.concat([wrapIv, wrapTag, wrappedBody])

    return {
      ciphertext,
      iv,
      authTag,
      wrappedKey,
      keyVersion: EncryptionService.KEY_VERSION,
    }
  }

  /**
   * Opens a sealed secret.
   *
   * Unwraps the data key with the master key, then decrypts. A tampered ciphertext
   * or wrapped key throws (GCM auth failure) rather than returning garbage — which
   * is the property that makes storing these safe.
   */
  open(sealed: SealedSecret): Record<string, unknown> {
    const wrapIv = sealed.wrappedKey.subarray(0, 12)
    const wrapTag = sealed.wrappedKey.subarray(12, 28)
    const wrappedBody = sealed.wrappedKey.subarray(28)

    const unwrap = createDecipheriv(EncryptionService.ALGO, this.masterKey, wrapIv)
    unwrap.setAuthTag(wrapTag)
    const dataKey = Buffer.concat([unwrap.update(wrappedBody), unwrap.final()])

    const decipher = createDecipheriv(EncryptionService.ALGO, dataKey, sealed.iv)
    decipher.setAuthTag(sealed.authTag)
    const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()])

    return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
  }

  /**
   * A masked hint for display, so the UI can show "sk-…4f2a" without ever
   * returning the secret. Never derived from the ciphertext — computed from the
   * plaintext at seal time and stored separately.
   */
  maskHint(value: string): string {
    if (value.length <= 8) return '••••'
    return `${value.slice(0, 3)}••••${value.slice(-4)}`
  }

  /** Constant-time equality, for comparing a presented secret against a stored one. */
  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    return ab.length === bb.length && timingSafeEqual(ab, bb)
  }
}
