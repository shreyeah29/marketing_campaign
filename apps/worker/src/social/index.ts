import type { PrismaClient } from '@vsp/database'

import { getPublisher } from './adapters.js'
import { openSealed } from './crypto.js'
import { composeText, type PublishMedia } from './types.js'

export { getPublisher } from './adapters.js'
export { SocialPublishError } from './types.js'

/**
 * The seam between the scheduler and the real platform adapters.
 *
 * `publishToTarget` decides, for one target, whether a genuine publish is possible
 * — a known social platform *and* a connected account with a decryptable token —
 * and if so performs it. When either is missing it returns `{ kind: 'simulate' }`,
 * and the caller records the same simulated result the product has always shown.
 * This is what lets real posting light up automatically once OAuth apps are live,
 * without changing the scheduler or breaking the demo in the meantime.
 */

export type PublishOutcome =
  | { readonly kind: 'published'; readonly externalPostId: string; readonly permalink: string }
  | { readonly kind: 'simulate' }

export interface PublishablePost {
  readonly body: string
  readonly hashtags: string[]
  readonly mediaIds: string[]
}

export interface PublishableAccount {
  readonly platform: string
  readonly externalId: string
  readonly handle: string | null
  readonly credentialId: string | null
}

export async function publishToTarget(
  db: PrismaClient,
  masterKeySource: string,
  post: PublishablePost,
  account: PublishableAccount,
): Promise<PublishOutcome> {
  const publisher = getPublisher(account.platform)
  if (!publisher) return { kind: 'simulate' }

  const accessToken = await resolveToken(db, account.credentialId, masterKeySource)
  if (!accessToken) return { kind: 'simulate' }

  const media = await resolveMedia(db, post.mediaIds)
  const result = await publisher.publish({
    text: composeText(post.body, post.hashtags),
    media,
    accessToken,
    accountExternalId: account.externalId,
    handle: account.handle,
  })
  return { kind: 'published', externalPostId: result.externalPostId, permalink: result.permalink }
}

/** Decrypt a connected account's OAuth token, or null if none is usable. */
async function resolveToken(
  db: PrismaClient,
  credentialId: string | null,
  masterKeySource: string,
): Promise<string | null> {
  if (!credentialId) return null
  const cred = await db.providerCredential.findUnique({
    where: { id: credentialId },
    select: { ciphertext: true, iv: true, authTag: true, wrappedKey: true, keyVersion: true },
  })
  if (!cred) return null
  try {
    const opened = openSealed(cred, masterKeySource)
    // OAuth connect flows store the token under one of these keys.
    const token = opened['accessToken'] ?? opened['token'] ?? opened['apiKey']
    return typeof token === 'string' && token.length > 0 ? token : null
  } catch {
    // A credential that fails to decrypt is treated as absent, never a crash.
    return null
  }
}

/** Resolve a post's media ids to public URLs with their kind. */
async function resolveMedia(db: PrismaClient, mediaIds: string[]): Promise<PublishMedia[]> {
  if (mediaIds.length === 0) return []
  const assets = await db.mediaAsset.findMany({
    where: { id: { in: mediaIds } },
    select: { url: true, type: true },
  })
  return assets
    .filter((a): a is { url: string; type: (typeof a)['type'] } => typeof a.url === 'string' && a.url.length > 0)
    .map((a) => ({ url: a.url, kind: a.type === 'VIDEO' ? 'VIDEO' : 'IMAGE' }))
}
