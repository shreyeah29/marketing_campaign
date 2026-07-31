import { createDecipheriv, hkdfSync } from 'node:crypto'

/**
 * Worker-side counterpart to the API's envelope decryption
 * (`apps/api/src/common/crypto/encryption.service.ts`). The publishing worker must
 * open a social account's stored OAuth token without depending on the Nest DI
 * container, so the `open()` half of the scheme is reproduced here verbatim.
 *
 * The scheme, unchanged: a per-record AES-256-GCM data key encrypts the secret;
 * the master key (HKDF-derived from `ENCRYPTION_MASTER_KEY`) wraps the data key;
 * the wrapped key is laid out as [wrapIv(12)][wrapTag(16)][wrappedBody]. Any
 * tampering fails the GCM auth check and throws rather than returning garbage.
 */

const ALGO = 'aes-256-gcm'

export interface SealedSecret {
  readonly ciphertext: Uint8Array
  readonly iv: Uint8Array
  readonly authTag: Uint8Array
  readonly wrappedKey: Uint8Array
  readonly keyVersion: number
}

function deriveMasterKey(source: string): Buffer {
  // Identical derivation to the API: same salt label and info, so a token sealed
  // by the API opens here. Diverging any argument would silently break decryption.
  return Buffer.from(hkdfSync('sha256', Buffer.from(source), 'vsp-credential-wrap', 'master-key', 32))
}

/** Opens a sealed credential object. Throws on a tampered or mismatched key. */
export function openSealed(sealed: SealedSecret, masterKeySource: string): Record<string, unknown> {
  const masterKey = deriveMasterKey(masterKeySource)
  const wrapped = Buffer.from(sealed.wrappedKey)

  const wrapIv = wrapped.subarray(0, 12)
  const wrapTag = wrapped.subarray(12, 28)
  const wrappedBody = wrapped.subarray(28)

  const unwrap = createDecipheriv(ALGO, masterKey, wrapIv)
  unwrap.setAuthTag(wrapTag)
  const dataKey = Buffer.concat([unwrap.update(wrappedBody), unwrap.final()])

  const decipher = createDecipheriv(ALGO, dataKey, Buffer.from(sealed.iv))
  decipher.setAuthTag(Buffer.from(sealed.authTag))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext)),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
}
