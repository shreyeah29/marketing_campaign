import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto'

import type { PrismaClient } from '@marketing-os/database'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { publishToTarget, type PublishableAccount, type PublishContext } from './index.js'

/**
 * The decision table for "can this actually be posted".
 *
 * The property under test is that there are exactly two answers — published, or
 * unavailable with a reason — and never a third one that reports success without
 * having posted. That third branch existed: with no token the scheduler marked
 * the target PUBLISHED and stamped `https://instagram.com/<handle>/p/<id>`, so
 * the product told the client a post was live on Instagram when nothing had left
 * the building. A test is the only thing that stops it coming back, because the
 * reintroduced version would look helpful and break nothing.
 *
 * The second property is subtler and equally load-bearing: a hand-connected
 * account must never have its `manual:INSTAGRAM:<handle>` id passed to Meta. It
 * is not an id, it is a row label. Instagram addresses posts by numeric business
 * account id, so the id has to come from the Meta connection or the publish must
 * not be attempted at all.
 */

const MASTER = 'test-master-key-at-least-32-characters-long'

/** Seals a secret exactly as the API does, so `openSealed` can open it. */
function seal(payload: Record<string, unknown>): {
  ciphertext: Uint8Array
  iv: Uint8Array
  authTag: Uint8Array
  wrappedKey: Uint8Array
  keyVersion: number
} {
  const masterKey = Buffer.from(
    hkdfSync('sha256', Buffer.from(MASTER), 'vsp-credential-wrap', 'master-key', 32),
  )
  const dataKey = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final(),
  ])

  const wrapIv = randomBytes(12)
  const wrap = createCipheriv('aes-256-gcm', masterKey, wrapIv)
  const wrappedBody = Buffer.concat([wrap.update(dataKey), wrap.final()])

  return {
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
    wrappedKey: Buffer.concat([wrapIv, wrap.getAuthTag(), wrappedBody]),
    keyVersion: 1,
  }
}

const CTX: PublishContext = {
  masterKeySource: MASTER,
  organizationId: 'org_1',
  graphVersion: 'v21.0',
  appSecret: undefined,
}

const POST = { body: 'Caramel iced latte is here', hashtags: ['latte'], mediaIds: ['media_1'] }

const MANUAL_IG: PublishableAccount = {
  platform: 'INSTAGRAM',
  externalId: 'manual:INSTAGRAM:3kinderjoy',
  handle: '3kinderjoy',
  credentialId: null,
}

interface FakeDbOptions {
  /** A connected Meta connection, or null for none at all. */
  readonly meta?: { credentialId: string | null; igUserId: string | null; pageId: string | null }
  /** Payloads by credential id. A missing id behaves as a missing row. */
  readonly credentials?: Record<string, Record<string, unknown>>
  readonly media?: { url: string; type: string }[]
}

function fakeDb(opts: FakeDbOptions): PrismaClient {
  const creds = opts.credentials ?? {}
  return {
    metaConnection: {
      findFirst: vi.fn(async () => opts.meta ?? null),
    },
    providerCredential: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const payload = creds[where.id]
        return payload ? seal(payload) : null
      }),
    },
    mediaAsset: {
      findMany: vi.fn(async () => opts.media ?? [{ url: 'https://cdn.test/a.jpg', type: 'IMAGE' }]),
    },
  } as unknown as PrismaClient
}

/**
 * The handler always receives a string. Real callers pass both forms — the
 * adapters build a template string, `graphGet` builds a URL object — and a
 * handler doing `url.includes(...)` on a URL throws, which
 * `exchangeForPageToken` catches as "no page token" and quietly falls back. The
 * coercion belongs here so a harness slip cannot masquerade as a code path.
 */
function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) =>
      handler(String(input), init),
    ) as unknown as typeof fetch,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a publish never reports success it did not achieve', () => {
  it('refuses a hand-connected Instagram account with no Meta connection', async () => {
    const outcome = await publishToTarget(fakeDb({}), CTX, POST, MANUAL_IG)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') throw new Error('unreachable')
    // The reason has to name the fix. "Publishing failed" sends someone hunting.
    expect(outcome.reason).toContain('Instagram business account')
    expect(outcome.reason).toContain('Channels')
  })

  it('refuses a platform with no publisher at all', async () => {
    const outcome = await publishToTarget(fakeDb({}), CTX, POST, {
      platform: 'PINTEREST',
      externalId: 'p_1',
      handle: null,
      credentialId: null,
    })
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') throw new Error('unreachable')
    expect(outcome.reason).toContain('PINTEREST')
  })

  it('refuses a platform whose app is not approved on this deployment', async () => {
    for (const platform of ['LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE']) {
      const outcome = await publishToTarget(fakeDb({}), CTX, POST, {
        platform,
        externalId: `${platform}_1`,
        handle: 'acme',
        credentialId: null,
      })
      expect(outcome.kind, platform).toBe('unavailable')
      if (outcome.kind !== 'unavailable') throw new Error('unreachable')
      expect(outcome.reason, platform).toContain('no approved app')
    }
  })

  it('refuses when the Meta connection exists but its token cannot be read', async () => {
    // credentialId points at a row that is not there — a revoked or purged
    // credential. Treated as absent, and it must not fall through to a success.
    const db = fakeDb({
      meta: { credentialId: 'cred_gone', igUserId: '17841400000', pageId: null },
    })
    const outcome = await publishToTarget(db, CTX, POST, MANUAL_IG)
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') throw new Error('unreachable')
    expect(outcome.reason).toContain('Reconnect Meta')
  })

  it('refuses an Instagram post with no media rather than posting an empty one', async () => {
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: '17841400000', pageId: null },
      credentials: { cred_1: { accessToken: 'user_token' } },
      media: [],
    })
    // The adapter throws; the caller records that as a failure. What matters here
    // is that it is not silently turned into a published target.
    await expect(publishToTarget(db, CTX, { ...POST, mediaIds: [] }, MANUAL_IG)).rejects.toThrow(
      /requires an image or video/i,
    )
  })
})

describe('Instagram publishes through the Meta connection', () => {
  it('addresses the igUserId, never the manual: row label', async () => {
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: '17841400000', pageId: null },
      credentials: { cred_1: { accessToken: 'user_token' } },
    })
    const calls: string[] = []
    mockFetch((url) => {
      calls.push(url)
      if (url.includes('/media_publish')) return json({ id: 'ig_media_9' })
      if (url.includes('/media')) return json({ id: 'container_1' })
      return json({ permalink: 'https://www.instagram.com/p/REAL/' })
    })

    const outcome = await publishToTarget(db, CTX, POST, MANUAL_IG)
    expect(outcome.kind).toBe('published')
    if (outcome.kind !== 'published') throw new Error('unreachable')
    expect(outcome.externalPostId).toBe('ig_media_9')
    expect(outcome.permalink).toBe('https://www.instagram.com/p/REAL/')

    // Every Graph call carries the numeric account, and none carries the label.
    expect(calls.some((u) => u.includes('/17841400000/media'))).toBe(true)
    expect(calls.some((u) => u.includes('manual'))).toBe(false)
  })

  it('uses the Page token when a Page is connected', async () => {
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: '17841400000', pageId: '9988' },
      credentials: { cred_1: { accessToken: 'user_token' } },
    })
    const bodies: string[] = []
    mockFetch((url, init) => {
      if (url.includes('/9988') && url.includes('fields=access_token')) {
        return json({ access_token: 'page_token' })
      }
      if (init?.body !== undefined) bodies.push(String(init.body))
      if (url.includes('/media_publish')) return json({ id: 'ig_media_9' })
      if (url.includes('/media')) return json({ id: 'container_1' })
      return json({})
    })

    const outcome = await publishToTarget(db, CTX, POST, MANUAL_IG)
    expect(outcome.kind).toBe('published')
    expect(bodies.every((b) => b.includes('page_token'))).toBe(true)
    expect(bodies.some((b) => b.includes('user_token'))).toBe(false)
  })

  it('falls back to the user token when the Page token exchange fails', async () => {
    // A failed exchange must not become a failed publish on its own — let the
    // real Graph error be the thing that decides, rather than guessing here.
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: '17841400000', pageId: '9988' },
      credentials: { cred_1: { accessToken: 'user_token' } },
    })
    const bodies: string[] = []
    mockFetch((url, init) => {
      if (url.includes('fields=access_token')) return json({ error: { message: 'nope' } }, 400)
      if (init?.body !== undefined) bodies.push(String(init.body))
      if (url.includes('/media_publish')) return json({ id: 'ig_media_9' })
      if (url.includes('/media')) return json({ id: 'container_1' })
      return json({})
    })

    const outcome = await publishToTarget(db, CTX, POST, MANUAL_IG)
    expect(outcome.kind).toBe('published')
    expect(bodies.every((b) => b.includes('user_token'))).toBe(true)
  })

  it('reads the Facebook Page id for a Facebook target', async () => {
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: null, pageId: '9988' },
      credentials: { cred_1: { accessToken: 'user_token' } },
    })
    const calls: string[] = []
    mockFetch((url) => {
      if (url.includes('fields=access_token')) return json({ access_token: 'page_token' })
      calls.push(url)
      return json({ id: 'fb_post_1', post_id: '9988_1' })
    })

    const outcome = await publishToTarget(db, CTX, POST, {
      platform: 'FACEBOOK',
      externalId: 'manual:FACEBOOK:alwayssunday',
      handle: 'alwayssunday',
      credentialId: null,
    })
    expect(outcome.kind).toBe('published')
    expect(calls.some((u) => u.includes('/9988/photos'))).toBe(true)
  })

  it('tells a Facebook target with no Page connected to connect one', async () => {
    const db = fakeDb({
      meta: { credentialId: 'cred_1', igUserId: '17841400000', pageId: null },
      credentials: { cred_1: { accessToken: 'user_token' } },
    })
    const outcome = await publishToTarget(db, CTX, POST, {
      platform: 'FACEBOOK',
      externalId: 'manual:FACEBOOK:alwayssunday',
      handle: 'alwayssunday',
      credentialId: null,
    })
    expect(outcome.kind).toBe('unavailable')
    if (outcome.kind !== 'unavailable') throw new Error('unreachable')
    expect(outcome.reason).toContain('Facebook Page')
  })
})

describe("an account's own OAuth credential", () => {
  it('is used directly when the account is a real OAuth connection', async () => {
    const db = fakeDb({ credentials: { cred_x: { accessToken: 'own_token' } } })
    let seen = ''
    mockFetch((url, init) => {
      seen = `${url}|${String(init?.headers && JSON.stringify(init.headers))}`
      return json({ data: { id: 'tweet_1' } })
    })

    const outcome = await publishToTarget(db, CTX, POST, {
      platform: 'X',
      externalId: '99887766',
      handle: 'acme',
      credentialId: 'cred_x',
    })
    expect(outcome.kind).toBe('published')
    expect(seen).toContain('own_token')
  })

  it('is not enough for a manual account, because its id is not a real id', async () => {
    // A token on a hand-entered row would otherwise send `manual:INSTAGRAM:x` to
    // Meta as an account id. Resolution must still go through the connection.
    const db = fakeDb({ credentials: { cred_x: { accessToken: 'own_token' } } })
    const outcome = await publishToTarget(db, CTX, POST, {
      ...MANUAL_IG,
      credentialId: 'cred_x',
    })
    expect(outcome.kind).toBe('unavailable')
  })
})
