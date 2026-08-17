import type { PrismaClient } from '@marketing-os/database'

import { graphGet } from '../meta/graph.js'
import { getPublisher } from './adapters.js'
import { openSealed } from './crypto.js'
import { composeText, type PublishMedia } from './types.js'

export { getPublisher } from './adapters.js'
export { SocialPublishError } from './types.js'

/**
 * The seam between the scheduler and the real platform adapters.
 *
 * `publishToTarget` works out whether a genuine publish is possible for one
 * target, and either performs it or says why it cannot. There is no third
 * behaviour: this used to return `{ kind: 'simulate' }` and the scheduler marked
 * the target PUBLISHED with a fabricated permalink, which meant the product
 * claimed a post had gone to Instagram when nothing had left the building. A
 * visible failure is recoverable; a false success is told to a client.
 *
 * Two ways a token can arrive, tried in that order:
 *
 *  1. The social account's own credential — the per-platform OAuth path, for when
 *     each network's app is approved. Nothing writes this column today.
 *  2. The organisation's Meta connection. This is the one that works now: the
 *     Meta OAuth flow already asks for `instagram_content_publish` and already
 *     stores the Page's `instagram_business_account.id` as `igUserId`. Manually
 *     "connecting" an Instagram handle records the handle and nothing else, so
 *     the id and the token both have to come from Meta.
 */

export type PublishOutcome =
  | { readonly kind: 'published'; readonly externalPostId: string; readonly permalink: string }
  /** Cannot publish, and the reason is safe to show the person who scheduled it. */
  | { readonly kind: 'unavailable'; readonly reason: string }

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

export interface PublishContext {
  readonly masterKeySource: string
  /** Whose Meta connection to fall back to. Never inferred from the account. */
  readonly organizationId: string
  readonly graphVersion: string
  readonly appSecret?: string | undefined
}

/** A token together with the id the platform actually addresses posts by. */
interface ResolvedAuth {
  readonly accessToken: string
  readonly accountExternalId: string
}

/**
 * A hand-entered account. The id is `manual:<platform>:<handle>`, which is fine
 * for identifying a row and useless to an API — Instagram addresses posts by a
 * numeric business-account id. Anything manual must resolve through Meta.
 */
function isManual(externalId: string): boolean {
  return externalId.startsWith('manual:')
}

export async function publishToTarget(
  db: PrismaClient,
  ctx: PublishContext,
  post: PublishablePost,
  account: PublishableAccount,
): Promise<PublishOutcome> {
  const publisher = getPublisher(account.platform)
  if (!publisher) {
    return {
      kind: 'unavailable',
      reason: `Marketing OS has no publisher for ${account.platform} yet, so this could not be posted.`,
    }
  }

  const auth = await resolveAuth(db, ctx, account)
  if ('reason' in auth) return { kind: 'unavailable', reason: auth.reason }

  const media = await resolveMedia(db, post.mediaIds)
  const result = await publisher.publish({
    text: composeText(post.body, post.hashtags),
    media,
    accessToken: auth.accessToken,
    accountExternalId: auth.accountExternalId,
    handle: account.handle,
  })
  return { kind: 'published', externalPostId: result.externalPostId, permalink: result.permalink }
}

async function resolveAuth(
  db: PrismaClient,
  ctx: PublishContext,
  account: PublishableAccount,
): Promise<ResolvedAuth | { reason: string }> {
  // 1. The account's own OAuth credential.
  const own = await resolveCredentialToken(db, account.credentialId, ctx.masterKeySource)
  if (own && !isManual(account.externalId)) {
    return { accessToken: own, accountExternalId: account.externalId }
  }

  // 2. Meta, for the two platforms it can publish to.
  if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
    return resolveViaMeta(db, ctx, account.platform)
  }

  return {
    reason: `${titleCase(account.platform)} has no approved app on this deployment, so Marketing OS cannot post on your behalf yet.`,
  }
}

async function resolveViaMeta(
  db: PrismaClient,
  ctx: PublishContext,
  platform: 'INSTAGRAM' | 'FACEBOOK',
): Promise<ResolvedAuth | { reason: string }> {
  const connection = await db.metaConnection.findFirst({
    where: { organizationId: ctx.organizationId, status: 'CONNECTED' },
    select: { credentialId: true, igUserId: true, pageId: true },
  })

  const target = platform === 'INSTAGRAM' ? connection?.igUserId : connection?.pageId
  const noun = platform === 'INSTAGRAM' ? 'Instagram business account' : 'Facebook Page'
  if (!connection?.credentialId || !target) {
    return {
      reason: `No ${noun} is connected through Meta. Connecting a handle by hand records the name but cannot post — connect Meta under Channels and choose the ${noun}.`,
    }
  }

  const userToken = await resolveCredentialToken(db, connection.credentialId, ctx.masterKeySource)
  if (!userToken) {
    return {
      reason: `The Meta connection's token could not be read. Reconnect Meta under Channels.`,
    }
  }

  // Both edges want a Page token. Meta issues one per Page to whoever manages it,
  // and a user token is accepted in some cases and refused in others — asking for
  // the Page token is one request and removes the guesswork. If the exchange
  // fails, go on with the user token so the platform's own error is what surfaces
  // rather than one invented here.
  const pageToken = connection.pageId
    ? await exchangeForPageToken(connection.pageId, userToken, ctx)
    : null

  return { accessToken: pageToken ?? userToken, accountExternalId: target }
}

async function exchangeForPageToken(
  pageId: string,
  userToken: string,
  ctx: PublishContext,
): Promise<string | null> {
  try {
    const body = await graphGet<{ access_token?: string }>(
      { accessToken: userToken, version: ctx.graphVersion, appSecret: ctx.appSecret },
      pageId,
      { fields: 'access_token' },
    )
    return body.access_token && body.access_token.length > 0 ? body.access_token : null
  } catch {
    return null
  }
}

function titleCase(platform: string): string {
  return platform.charAt(0) + platform.slice(1).toLowerCase()
}

/** Decrypt a stored OAuth token, or null if none is usable. */
async function resolveCredentialToken(
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
    .filter(
      (a): a is { url: string; type: (typeof a)['type'] } =>
        typeof a.url === 'string' && a.url.length > 0,
    )
    .map((a) => ({ url: a.url, kind: a.type === 'VIDEO' ? 'VIDEO' : 'IMAGE' }))
}
