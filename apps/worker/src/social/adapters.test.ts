import { afterEach, describe, expect, it, vi } from 'vitest'

import { getPublisher } from './adapters.js'
import { composeText, SocialPublishError, type PublishInput } from './types.js'

const BASE: PublishInput = {
  text: 'Hello world',
  media: [],
  accessToken: 'tok_123',
  accountExternalId: 'acct_1',
  handle: 'acme',
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): void {
  vi.stubGlobal('fetch', vi.fn(handler as unknown as typeof fetch))
}

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('composeText', () => {
  it('appends normalised hashtags', () => {
    expect(composeText('Body', ['sale', '#now'])).toBe('Body\n\n#sale #now')
  })
  it('leaves the body alone with no hashtags', () => {
    expect(composeText('Body', [])).toBe('Body')
  })
})

describe('getPublisher', () => {
  it('resolves social platforms and rejects non-social channels', () => {
    expect(getPublisher('LINKEDIN')?.platform).toBe('LINKEDIN')
    expect(getPublisher('YOUTUBE')?.platform).toBe('YOUTUBE')
    expect(getPublisher('EMAIL')).toBeNull()
    expect(getPublisher('SMS')).toBeNull()
  })
})

describe('LinkedIn publisher', () => {
  it('posts a UGC share and returns a permalink', async () => {
    let seenUrl = ''
    let seenAuth = ''
    mockFetch((url, init) => {
      seenUrl = url
      seenAuth = (init?.headers as Record<string, string>).authorization ?? ''
      return json({ id: 'urn:li:share:42' }, 201)
    })
    const res = await getPublisher('LINKEDIN')!.publish(BASE)
    expect(seenUrl).toBe('https://api.linkedin.com/v2/ugcPosts')
    expect(seenAuth).toBe('Bearer tok_123')
    expect(res.externalPostId).toBe('urn:li:share:42')
    expect(res.permalink).toContain('urn:li:share:42')
  })

  it('throws SocialPublishError on a non-2xx', async () => {
    mockFetch(() => json({ message: 'bad token' }, 401))
    await expect(getPublisher('LINKEDIN')!.publish(BASE)).rejects.toBeInstanceOf(SocialPublishError)
  })
})

describe('X publisher', () => {
  it('creates a tweet and builds the status URL', async () => {
    mockFetch(() => json({ data: { id: '9001' } }))
    const res = await getPublisher('X')!.publish(BASE)
    expect(res.externalPostId).toBe('9001')
    expect(res.permalink).toBe('https://x.com/acme/status/9001')
  })
})

describe('Facebook publisher', () => {
  it('posts to the feed edge for a text-only post', async () => {
    let seenUrl = ''
    mockFetch((url) => {
      seenUrl = url
      return json({ id: 'page_post_7' })
    })
    const res = await getPublisher('FACEBOOK')!.publish(BASE)
    expect(seenUrl).toContain('/acct_1/feed')
    expect(res.externalPostId).toBe('page_post_7')
  })

  it('posts to the photos edge when an image is attached', async () => {
    let seenUrl = ''
    mockFetch((url) => {
      seenUrl = url
      return json({ id: 'photo_9' })
    })
    await getPublisher('FACEBOOK')!.publish({
      ...BASE,
      media: [{ url: 'https://cdn.example/i.jpg', kind: 'IMAGE' }],
    })
    expect(seenUrl).toContain('/acct_1/photos')
  })
})

describe('media-required platforms', () => {
  it('Instagram rejects a post with no media', async () => {
    await expect(getPublisher('INSTAGRAM')!.publish(BASE)).rejects.toBeInstanceOf(
      SocialPublishError,
    )
  })
  it('TikTok rejects a post with no video', async () => {
    await expect(getPublisher('TIKTOK')!.publish(BASE)).rejects.toBeInstanceOf(SocialPublishError)
  })
  it('YouTube rejects a post with no video', async () => {
    await expect(getPublisher('YOUTUBE')!.publish(BASE)).rejects.toBeInstanceOf(SocialPublishError)
  })
})
