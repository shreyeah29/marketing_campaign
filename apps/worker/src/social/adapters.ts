/**
 * Real per-platform publish adapters.
 *
 * Each makes the genuine API call that publishes a post to its network, given a
 * user access token. They are dormant until a platform's OAuth app is approved and
 * an account is connected (which is what supplies the token) — the worker falls
 * back to a simulated result when no token is present — but the network calls
 * themselves are real and correct, so posting switches on the moment a token
 * exists. Nothing here is a mock.
 *
 * Facebook/Instagram use the Meta Graph API; the rest use each platform's own v2
 * endpoints. Text-only platforms (LinkedIn, X, Facebook) post the caption; media
 * platforms (Instagram, TikTok, YouTube) require an asset and throw without one.
 */

import {
  publishError,
  type PublishInput,
  type PublishMedia,
  type PublishResult,
  type SocialPublisher,
  SocialPublishError,
} from './types.js'

const GRAPH = 'https://graph.facebook.com/v21.0'

function firstOfKind(
  media: readonly PublishMedia[],
  kind: PublishMedia['kind'],
): PublishMedia | undefined {
  return media.find((m) => m.kind === kind)
}

// ── LinkedIn (UGC Posts) ───────────────────────────────────────────────────────
const linkedin: SocialPublisher = {
  platform: 'LINKEDIN',
  async publish(input: PublishInput): Promise<PublishResult> {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:person:${input.accountExternalId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: input.text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
    if (!res.ok) throw await publishError(res, 'LINKEDIN')
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    const id = body.id ?? res.headers.get('x-restli-id') ?? ''
    if (!id) throw new SocialPublishError('LINKEDIN returned no post id', 'LINKEDIN')
    return { externalPostId: id, permalink: `https://www.linkedin.com/feed/update/${id}` }
  },
}

// ── X / Twitter (v2 tweets) ─────────────────────────────────────────────────────
const x: SocialPublisher = {
  platform: 'X',
  async publish(input: PublishInput): Promise<PublishResult> {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: input.text }),
    })
    if (!res.ok) throw await publishError(res, 'X')
    const body = (await res.json()) as { data?: { id?: string } }
    const id = body.data?.id
    if (!id) throw new SocialPublishError('X returned no tweet id', 'X')
    return {
      externalPostId: id,
      permalink: `https://x.com/${input.handle ?? 'i'}/status/${id}`,
    }
  },
}

// ── Facebook (Page feed / photos) ───────────────────────────────────────────────
const facebook: SocialPublisher = {
  platform: 'FACEBOOK',
  async publish(input: PublishInput): Promise<PublishResult> {
    const image = firstOfKind(input.media, 'IMAGE')
    // A photo post and a text post are different Graph edges.
    const url = image
      ? `${GRAPH}/${input.accountExternalId}/photos`
      : `${GRAPH}/${input.accountExternalId}/feed`
    const form = new URLSearchParams({ access_token: input.accessToken })
    if (image) {
      form.set('url', image.url)
      form.set('caption', input.text)
    } else {
      form.set('message', input.text)
    }
    const res = await fetch(url, { method: 'POST', body: form })
    if (!res.ok) throw await publishError(res, 'FACEBOOK')
    const body = (await res.json()) as { id?: string; post_id?: string }
    const id = body.post_id ?? body.id
    if (!id) throw new SocialPublishError('FACEBOOK returned no post id', 'FACEBOOK')
    return { externalPostId: id, permalink: `https://www.facebook.com/${id}` }
  },
}

// ── Instagram (two-step container publish; requires media) ──────────────────────
const instagram: SocialPublisher = {
  platform: 'INSTAGRAM',
  async publish(input: PublishInput): Promise<PublishResult> {
    const video = firstOfKind(input.media, 'VIDEO')
    const image = firstOfKind(input.media, 'IMAGE')
    if (!video && !image) {
      throw new SocialPublishError('INSTAGRAM requires an image or video', 'INSTAGRAM')
    }

    // Step 1: create a media container.
    const createForm = new URLSearchParams({
      access_token: input.accessToken,
      caption: input.text,
    })
    if (video) {
      createForm.set('media_type', 'REELS')
      createForm.set('video_url', video.url)
    } else if (image) {
      createForm.set('image_url', image.url)
    }
    const createRes = await fetch(`${GRAPH}/${input.accountExternalId}/media`, {
      method: 'POST',
      body: createForm,
    })
    if (!createRes.ok) throw await publishError(createRes, 'INSTAGRAM')
    const created = (await createRes.json()) as { id?: string }
    if (!created.id) throw new SocialPublishError('INSTAGRAM container not created', 'INSTAGRAM')

    // Step 2: publish the container.
    const pubForm = new URLSearchParams({
      access_token: input.accessToken,
      creation_id: created.id,
    })
    const pubRes = await fetch(`${GRAPH}/${input.accountExternalId}/media_publish`, {
      method: 'POST',
      body: pubForm,
    })
    if (!pubRes.ok) throw await publishError(pubRes, 'INSTAGRAM')
    const published = (await pubRes.json()) as { id?: string }
    const id = published.id
    if (!id) throw new SocialPublishError('INSTAGRAM returned no media id', 'INSTAGRAM')

    // Best-effort permalink lookup; fall back to the media id URL form.
    let permalink = `https://www.instagram.com/p/${id}`
    try {
      const linkRes = await fetch(
        `${GRAPH}/${id}?fields=permalink&access_token=${encodeURIComponent(input.accessToken)}`,
      )
      if (linkRes.ok) {
        const linkBody = (await linkRes.json()) as { permalink?: string }
        if (linkBody.permalink) permalink = linkBody.permalink
      }
    } catch {
      // Keep the fallback permalink.
    }
    return { externalPostId: id, permalink }
  },
}

// ── TikTok (Content Posting API; requires a video) ──────────────────────────────
const tiktok: SocialPublisher = {
  platform: 'TIKTOK',
  async publish(input: PublishInput): Promise<PublishResult> {
    const video = firstOfKind(input.media, 'VIDEO')
    if (!video) throw new SocialPublishError('TIKTOK requires a video', 'TIKTOK')

    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: input.text.slice(0, 2200),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: video.url },
      }),
    })
    if (!res.ok) throw await publishError(res, 'TIKTOK')
    const body = (await res.json()) as { data?: { publish_id?: string }; error?: { message?: string } }
    const id = body.data?.publish_id
    if (!id) throw new SocialPublishError(body.error?.message ?? 'TIKTOK returned no publish id', 'TIKTOK')
    // TikTok has no post URL until processing completes; link to the profile.
    return {
      externalPostId: id,
      permalink: input.handle ? `https://www.tiktok.com/@${input.handle}` : 'https://www.tiktok.com',
    }
  },
}

// ── YouTube (resumable-free multipart upload; requires a video) ─────────────────
const youtube: SocialPublisher = {
  platform: 'YOUTUBE',
  async publish(input: PublishInput): Promise<PublishResult> {
    const video = firstOfKind(input.media, 'VIDEO')
    if (!video) throw new SocialPublishError('YOUTUBE requires a video', 'YOUTUBE')

    // Fetch the asset bytes, then upload as a single multipart request (adequate for
    // short marketing clips; large videos would want a resumable session).
    const asset = await fetch(video.url)
    if (!asset.ok) throw new SocialPublishError('YOUTUBE could not fetch the video asset', 'YOUTUBE')
    const bytes = Buffer.from(await asset.arrayBuffer())

    const metadata = {
      snippet: {
        title: input.text.slice(0, 100) || 'Untitled',
        description: input.text.slice(0, 5000),
      },
      status: { privacyStatus: 'public' },
    }

    const boundary = 'vsp_yt_boundary_0xA1B2C3'
    const head =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: video/*\r\n\r\n'
    const tail = `\r\n--${boundary}--\r\n`
    const multipart = Buffer.concat([Buffer.from(head, 'utf8'), bytes, Buffer.from(tail, 'utf8')])

    const res = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    )
    if (!res.ok) throw await publishError(res, 'YOUTUBE')
    const body = (await res.json()) as { id?: string }
    const id = body.id
    if (!id) throw new SocialPublishError('YOUTUBE returned no video id', 'YOUTUBE')
    return { externalPostId: id, permalink: `https://www.youtube.com/watch?v=${id}` }
  },
}

const PUBLISHERS: Record<string, SocialPublisher> = {
  LINKEDIN: linkedin,
  X: x,
  FACEBOOK: facebook,
  INSTAGRAM: instagram,
  TIKTOK: tiktok,
  YOUTUBE: youtube,
}

/** The publisher for a `ChannelType`, or null if that channel isn't a social network. */
export function getPublisher(platform: string): SocialPublisher | null {
  return PUBLISHERS[platform] ?? null
}
