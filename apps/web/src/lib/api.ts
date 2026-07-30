/**
 * The API client.
 *
 * A thin fetch wrapper that speaks the API's conventions: a `/v1` prefix, a bearer
 * token for the platform realm, and RFC 9457 problem+json errors unwrapped into a
 * thrown `ApiError` carrying the stable `code` and `traceId`. Everything the
 * portal does goes through here so error handling is uniform.
 */

const API_BASE = (
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) || 'http://localhost:4000'
).replace(/\/+$/, '')

const PLATFORM_TOKEN_KEY = 'vsp.platform.token'

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
      problem.detail ?? problem.title ?? `Request failed (${String(res.status)})`,
      res.status,
      problem.code ?? 'unknown',
      data as Problem,
    )
  }

  return data as T
}

export const api = {
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
