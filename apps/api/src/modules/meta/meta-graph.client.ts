import { createHmac } from 'node:crypto'

/**
 * Low-level client for the Meta Graph API (graph.facebook.com) — the single place
 * every Meta feature (OAuth token exchange, ad management, lead retrieval, WhatsApp
 * send, insights) makes HTTP calls. Higher layers speak in domain terms; this one
 * only knows how to sign a request, send it, and turn a Meta error body into a
 * typed `MetaApiError`.
 *
 * Two Meta-specific concerns are handled here:
 *   1. `appsecret_proof` — when the app secret is known, every call is signed with
 *      an HMAC of the access token, which Meta recommends to stop a leaked token
 *      being used off-platform.
 *   2. Rate limits — Meta signals throttling with specific error codes (and 429).
 *      Those surface as `MetaApiError` with `isRateLimit`, so callers/queues can
 *      back off rather than treat them as hard failures.
 */

export interface MetaGraphOptions {
  readonly accessToken: string
  /** Graph version, e.g. "v21.0". */
  readonly version: string
  /** App secret, to sign calls with appsecret_proof. Optional but recommended. */
  readonly appSecret?: string
  /** Override base URL (tests / the WhatsApp host). Defaults to the Graph host. */
  readonly baseUrl?: string
}

export interface MetaRequest {
  readonly method?: 'GET' | 'POST' | 'DELETE'
  /** Query params (GET) or form/body fields (POST). Values are stringified. */
  readonly params?: Record<string, string | number | boolean | undefined>
  /** JSON body for POST. When set, sent as application/json instead of form. */
  readonly json?: unknown
}

// Meta throttling error codes (application, page, and custom-audience limits) plus
// the HTTP 429 fallback. See Graph API "Rate Limiting".
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004])

export class MetaApiError extends Error {
  readonly code?: number
  readonly subcode?: number
  readonly status: number
  readonly fbtraceId?: string
  readonly isRateLimit: boolean

  constructor(
    message: string,
    opts: { status: number; code?: number; subcode?: number; fbtraceId?: string },
  ) {
    super(message)
    this.name = 'MetaApiError'
    this.status = opts.status
    if (opts.code !== undefined) this.code = opts.code
    if (opts.subcode !== undefined) this.subcode = opts.subcode
    if (opts.fbtraceId !== undefined) this.fbtraceId = opts.fbtraceId
    this.isRateLimit =
      opts.status === 429 || (opts.code !== undefined && RATE_LIMIT_CODES.has(opts.code))
  }
}

export class MetaGraphClient {
  private readonly base: string

  constructor(private readonly opts: MetaGraphOptions) {
    const host = opts.baseUrl ?? 'https://graph.facebook.com'
    this.base = `${host.replace(/\/$/, '')}/${opts.version}`
  }

  /** GET a Graph edge and return its parsed JSON. */
  get<T>(path: string, params?: MetaRequest['params']): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...(params ? { params } : {}) })
  }

  /** POST to a Graph edge (form-encoded unless `json` is given). */
  post<T>(path: string, req: Omit<MetaRequest, 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...req, method: 'POST' })
  }

  /** DELETE a Graph object. */
  delete<T>(path: string, params?: MetaRequest['params']): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', ...(params ? { params } : {}) })
  }

  private appsecretProof(): string | undefined {
    if (!this.opts.appSecret) return undefined
    return createHmac('sha256', this.opts.appSecret).update(this.opts.accessToken).digest('hex')
  }

  private async request<T>(path: string, req: MetaRequest): Promise<T> {
    const method = req.method ?? 'GET'
    const url = new URL(`${this.base}/${path.replace(/^\//, '')}`)

    const proof = this.appsecretProof()
    const auth: Record<string, string> = { access_token: this.opts.accessToken }
    if (proof) auth['appsecret_proof'] = proof

    const init: RequestInit = { method, headers: {} }

    if (method === 'GET' || method === 'DELETE') {
      for (const [k, v] of Object.entries({ ...auth, ...stringify(req.params) })) {
        url.searchParams.set(k, v)
      }
    } else if (req.json !== undefined) {
      // JSON body; auth still travels as query params (Graph accepts both).
      for (const [k, v] of Object.entries(auth)) url.searchParams.set(k, v)
      ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
      init.body = JSON.stringify(req.json)
    } else {
      // Form-encoded body — the common case for ad + WhatsApp writes.
      const form = new URLSearchParams({ ...auth, ...stringify(req.params) })
      init.body = form
    }

    const res = await fetch(url, init)
    if (!res.ok) throw await readMetaError(res)
    // Some Graph deletes return an empty body.
    const text = await res.text()
    return (text ? JSON.parse(text) : {}) as T
  }
}

/** Drop undefined values and stringify the rest, for query/form encoding. */
function stringify(params: MetaRequest['params']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!params) return out
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = String(v)
  }
  return out
}

/** Parse a Graph error envelope into a `MetaApiError`. */
async function readMetaError(res: Response): Promise<MetaApiError> {
  let message = `Meta request failed (${String(res.status)})`
  let code: number | undefined
  let subcode: number | undefined
  let fbtraceId: string | undefined
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string }
    }
    const err = body.error
    if (err) {
      if (err.message) message = err.message
      code = err.code
      subcode = err.error_subcode
      fbtraceId = err.fbtrace_id
    }
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  return new MetaApiError(message, {
    status: res.status,
    ...(code !== undefined ? { code } : {}),
    ...(subcode !== undefined ? { subcode } : {}),
    ...(fbtraceId !== undefined ? { fbtraceId } : {}),
  })
}
