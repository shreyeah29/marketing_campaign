import { createHmac } from 'node:crypto'

/**
 * Minimal Meta Graph API reader for the worker.
 *
 * Deliberately duplicated from the API's MetaGraphClient (same precedent as
 * social/crypto.ts): apps don't import from each other, and the worker only
 * ever needs authenticated GETs.
 */

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'MetaApiError'
  }

  /** Meta's rate-limit signals: HTTP 429 or the documented throttling codes. */
  get isRateLimit(): boolean {
    return this.status === 429 || [4, 17, 32, 613].includes(this.code ?? -1)
  }
}

export interface GraphAuth {
  accessToken: string
  version: string
  appSecret?: string | undefined
}

export async function graphGet<T>(
  auth: GraphAuth,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${auth.version}/${path.replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  url.searchParams.set('access_token', auth.accessToken)
  if (auth.appSecret) {
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', auth.appSecret).update(auth.accessToken).digest('hex'),
    )
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number }
  } & T
  if (!res.ok || body.error) {
    throw new MetaApiError(
      body.error?.message ?? `Graph API request failed (${String(res.status)})`,
      res.status,
      body.error?.code,
    )
  }
  return body
}

/** Meta lead field_data → flat map keyed by field name (full_name, email, …). */
export function mapLeadFields(
  fieldData: ReadonlyArray<{ name?: string; values?: unknown[] }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of fieldData ?? []) {
    if (!field.name) continue
    const value = field.values?.[0]
    if (typeof value === 'string' && value.length > 0) out[field.name] = value
  }
  return out
}
