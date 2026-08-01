/**
 * The publish contract shared by every platform adapter.
 *
 * An adapter receives a fully-resolved, platform-agnostic post (text already
 * composed with hashtags, media already resolved to public URLs, the account's
 * decrypted token and external id) and performs the one real network call that
 * publishes it. It returns the platform's own post id and a permalink, or throws
 * `SocialPublishError` — nothing platform-specific leaks past this boundary.
 */

export type MediaKind = 'IMAGE' | 'VIDEO'

export interface PublishMedia {
  readonly url: string
  readonly kind: MediaKind
}

export interface PublishInput {
  /** Post text with hashtags already appended. */
  readonly text: string
  readonly media: readonly PublishMedia[]
  /** The account's decrypted OAuth access token. */
  readonly accessToken: string
  /** The platform's own id for the account: page id, user id, channel id, etc. */
  readonly accountExternalId: string
  readonly handle?: string | null
}

export interface PublishResult {
  /** The platform's id for the created post. */
  readonly externalPostId: string
  /** A public URL to the post (best-effort for platforms that don't return one). */
  readonly permalink: string
}

export interface SocialPublisher {
  /** The `ChannelType` value this publisher serves. */
  readonly platform: string
  publish(input: PublishInput): Promise<PublishResult>
}

/** A publish failure carrying the platform and, when known, the HTTP status. */
export class SocialPublishError extends Error {
  constructor(
    message: string,
    readonly platform: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SocialPublishError'
  }
}

/** Read an error body into a `SocialPublishError`, tolerating non-JSON. */
export async function publishError(res: Response, platform: string): Promise<SocialPublishError> {
  let detail = `${platform} publish failed (${String(res.status)})`
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string
      message?: string
      title?: string
    }
    const msg =
      (typeof body.error === 'object' ? body.error?.message : body.error) ??
      body.message ??
      body.title
    if (typeof msg === 'string' && msg.length > 0) detail = msg
  } catch {
    // Non-JSON body; keep the generic detail.
  }
  return new SocialPublishError(detail, platform, res.status)
}

/** Compose the final post text from a body and its hashtags. */
export function composeText(body: string, hashtags: readonly string[]): string {
  const tags = hashtags
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
    .trim()
  return tags.length > 0 ? `${body}\n\n${tags}` : body
}
