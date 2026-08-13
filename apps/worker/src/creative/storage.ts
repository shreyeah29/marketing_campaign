import type { WorkerEnv } from '../config.js'

/**
 * Uploading a rendered poster to object storage.
 *
 * Deliberately duplicated from the API's `StorageService`, the same precedent as
 * `meta/graph.ts` and `social/crypto.ts`: apps in this repo do not import from
 * each other. This copy is the write half only — the worker never reads back —
 * so it is a fraction of the original rather than a fork of it.
 */

export interface StoredObject {
  readonly url: string
  readonly storageKey: string
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/**
 * Store bytes and return the durable URL.
 *
 * Throws on failure. Unlike the API's copy-from-provider path there is no source
 * URL to fall back to: a render that cannot be stored has produced nothing, and
 * saying so is the only honest outcome.
 */
export async function putObject(
  env: WorkerEnv,
  bytes: Uint8Array,
  contentType: string,
  keyPrefix: string,
): Promise<StoredObject> {
  const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = env.SUPABASE_SERVICE_KEY ?? ''
  if (!base || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured on the worker')
  }

  const objectPath = `${keyPrefix}.${EXTENSIONS[contentType] ?? 'bin'}`
  const res = await fetch(`${base}/storage/v1/object/${env.SUPABASE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      'content-type': contentType,
      'x-upsert': 'true',
      // Re-rendering writes a new path (the hash changes), so a stored object is
      // never rewritten and can be cached for as long as anything will keep it.
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`upload responded ${String(res.status)} ${detail.slice(0, 200)}`)
  }

  return {
    url: `${base}/storage/v1/object/public/${env.SUPABASE_BUCKET}/${objectPath}`,
    storageKey: objectPath,
  }
}
