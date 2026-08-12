/**
 * The API client.
 *
 * A thin fetch wrapper that speaks the API's conventions: a `/v1` prefix, a bearer
 * token for the platform realm, and RFC 9457 problem+json errors unwrapped into a
 * thrown `ApiError` carrying the stable `code` and `traceId`. Everything the
 * portal does goes through here so error handling is uniform.
 */

const API_BASE = (
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ||
  'http://localhost:4000'
).replace(/\/+$/, '')

const PLATFORM_TOKEN_KEY = 'vsp.platform.token'
// View-as-client bridge token. sessionStorage on purpose: the read-only visit
// is confined to its tab and dies with it, never outliving the operator's look.
const VIEW_AS_TOKEN_KEY = 'vsp.viewas.token'

export interface Problem {
  type: string
  title: string
  status: number
  code: string
  detail?: string
  traceId?: string
  errors?: { path: string; message: string }[]
}

export class ApiError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly code: string,
    readonly problem?: Problem,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getPlatformToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(PLATFORM_TOKEN_KEY)
}

export function setPlatformToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token === null) window.localStorage.removeItem(PLATFORM_TOKEN_KEY)
  else window.localStorage.setItem(PLATFORM_TOKEN_KEY, token)
}

export function getViewAsToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(VIEW_AS_TOKEN_KEY)
}

export function setViewAsToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token === null) window.sessionStorage.removeItem(VIEW_AS_TOKEN_KEY)
  else window.sessionStorage.setItem(VIEW_AS_TOKEN_KEY, token)
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Attach the platform bearer token (platform-realm routes). */
  platformAuth?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.platformAuth) {
    const token = getPlatformToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  } else {
    // A tab in view-as mode presents the bridge token on every tenant call;
    // the API then resolves a read-only VIEWER principal for that org and
    // ignores any tenant cookie also present.
    const viewAs = getViewAsToken()
    if (viewAs) headers['x-vsp-view-as'] = viewAs
  }

  // `credentials: 'include'` so the Better Auth session cookie is sent on tenant
  // calls. The app and API are same-site in every deployment (same registrable
  // domain), so the SameSite=Lax cookie flows; the port difference does not make
  // them cross-site.
  const init: RequestInit = { method: opts.method ?? 'GET', headers, credentials: 'include' }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)
  if (opts.signal) init.signal = opts.signal

  const res = await fetch(`${API_BASE}/v1${path}`, init)

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const problem = (data ?? {}) as Partial<Problem>
    throw new ApiError(
      problemMessage(data, res.status),
      res.status,
      problem.code ?? 'unknown',
      data as Problem,
    )
  }

  return data as T
}

/**
 * The API reports errors in two shapes: an RFC-7807 problem (detail/title as
 * strings) or a NestJS validation error whose `message` is an ARRAY of zod
 * issues. Rendering the latter directly gives "[object Object]" — flatten it
 * into the human sentence the user actually needs.
 */
function problemMessage(data: unknown, status: number): string {
  const p = (data ?? {}) as Record<string, unknown>
  for (const candidate of [p['detail'], p['title'], p['message']]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
    if (Array.isArray(candidate)) {
      const parts = candidate
        .map((issue) => {
          if (typeof issue === 'string') return issue
          if (issue && typeof issue === 'object' && 'message' in issue) {
            const i = issue as { path?: unknown; message?: unknown }
            const path = Array.isArray(i.path) && i.path.length > 0 ? `${i.path.join('.')}: ` : ''
            return typeof i.message === 'string' ? `${path}${i.message}` : null
          }
          return null
        })
        .filter((s): s is string => s !== null)
      if (parts.length > 0) return parts.join(' · ')
    }
  }
  return `Request failed (${String(status)})`
}

/**
 * Upload a file.
 *
 * Separate from `request` because a multipart body must NOT carry an explicit
 * `Content-Type`: the browser sets it, including the boundary token that
 * separates the parts. Setting it by hand produces a header with no boundary,
 * and the server then cannot parse a body that looks perfectly valid on the
 * wire.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const viewAs = getViewAsToken()
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(viewAs ? { 'x-vsp-view-as': viewAs } : {}),
    },
    body: form,
    credentials: 'include',
  })

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!res.ok) {
    const problem = (data ?? {}) as Partial<Problem>
    throw new ApiError(
      problemMessage(data, res.status),
      res.status,
      problem.code ?? 'unknown',
      data as Problem,
    )
  }
  return data as T
}

export const api = {
  /**
   * The versioned API root, for URLs the browser fetches directly rather than
   * through this client — an `<img src>` pointing at a render endpoint, say.
   */
  base: `${API_BASE}/v1`,
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE', body }),
}
