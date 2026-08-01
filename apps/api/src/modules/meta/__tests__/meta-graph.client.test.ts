import { afterEach, describe, expect, it, vi } from 'vitest'

import { MetaApiError, MetaGraphClient } from '../meta-graph.client.js'

function mockFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL | string, init?: RequestInit) =>
      handler(new URL(String(input)), init ?? {}),
    ) as unknown as typeof fetch,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MetaGraphClient', () => {
  it('builds a versioned URL and attaches the access token on GET', async () => {
    let seen: URL | null = null
    mockFetch((url) => {
      seen = url
      return json({ id: '123', name: 'Acme' })
    })
    const client = new MetaGraphClient({ accessToken: 'tok', version: 'v21.0' })
    const res = await client.get<{ id: string }>('123', { fields: 'name' })

    expect(seen!.origin + seen!.pathname).toBe('https://graph.facebook.com/v21.0/123')
    expect(seen!.searchParams.get('access_token')).toBe('tok')
    expect(seen!.searchParams.get('fields')).toBe('name')
    expect(res.id).toBe('123')
  })

  it('adds appsecret_proof when the app secret is supplied', async () => {
    let seen: URL | null = null
    mockFetch((url) => {
      seen = url
      return json({ ok: true })
    })
    const client = new MetaGraphClient({ accessToken: 'tok', version: 'v21.0', appSecret: 's3cr3t' })
    await client.get('me')

    const proof = seen!.searchParams.get('appsecret_proof')
    expect(proof).toMatch(/^[a-f0-9]{64}$/)
  })

  it('POSTs a form body by default', async () => {
    let body: string | null = null
    mockFetch(async (_url, init) => {
      body = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body)
      return json({ id: 'act_1' })
    })
    const client = new MetaGraphClient({ accessToken: 'tok', version: 'v21.0' })
    await client.post('act_1/campaigns', { params: { name: 'Launch', objective: 'OUTCOME_LEADS' } })

    expect(body).toContain('name=Launch')
    expect(body).toContain('objective=OUTCOME_LEADS')
    expect(body).toContain('access_token=tok')
  })

  it('maps a Graph error envelope to MetaApiError', async () => {
    mockFetch(() =>
      json(
        { error: { message: 'Invalid OAuth token', code: 190, error_subcode: 460, fbtrace_id: 'abc' } },
        401,
      ),
    )
    const client = new MetaGraphClient({ accessToken: 'bad', version: 'v21.0' })
    await expect(client.get('me')).rejects.toMatchObject({
      name: 'MetaApiError',
      message: 'Invalid OAuth token',
      code: 190,
      subcode: 460,
      status: 401,
      isRateLimit: false,
    })
  })

  it('flags rate-limit errors so callers can back off', async () => {
    mockFetch(() => json({ error: { message: 'User request limit reached', code: 17 } }, 400))
    const client = new MetaGraphClient({ accessToken: 'tok', version: 'v21.0' })
    await expect(client.get('act_1/insights')).rejects.toMatchObject({ isRateLimit: true })
  })

  it('treats HTTP 429 as a rate limit even without a code', async () => {
    mockFetch(() => new Response('', { status: 429 }))
    const client = new MetaGraphClient({ accessToken: 'tok', version: 'v21.0' })
    const err = await client.get('me').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MetaApiError)
    expect((err as MetaApiError).isRateLimit).toBe(true)
  })
})
