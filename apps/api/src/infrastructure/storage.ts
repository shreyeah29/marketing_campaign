import { Inject, Injectable } from '@nestjs/common'

import type { AppLogger } from '@marketing-os/observability'

import { loadEnv } from '../config/env.js'

import { LOGGER } from './database.module.js'

/**
 * Durable object storage for generated media.
 *
 * The problem this solves: Runway hands back a *temporary* URL. It works when
 * the poster is generated and reviewed, and then it stops working — days later
 * the campaign that used it shows a broken image, and there is no way back
 * because the bytes were never ours. Approving a creative has to mean keeping
 * it.
 *
 * So every generated image and video is copied, once, into a bucket we control,
 * and the durable URL is what lands in the database. Uploads go over Supabase
 * Storage's REST API rather than `@supabase/supabase-js` — one `fetch`, no
 * dependency, exactly the reasoning behind the Resend mailer.
 *
 * When the bucket is not configured the copy is skipped and the provider URL is
 * returned unchanged. That is a deliberate degradation, not a silent one: the
 * feature keeps working on an unconfigured deployment, `persisted: false` tells
 * the caller what happened, and a warning is logged once per attempt.
 */

/**
 * Runs on downloaded bytes before upload. Must not throw — it sits between a
 * successful generation and permanent storage, and a poster that cannot be
 * transformed should still be kept.
 */
export type Transform = (
  bytes: Uint8Array,
  contentType: string,
) => Promise<{ bytes: Uint8Array; contentType: string }>

export interface PersistResult {
  /** The URL to store. Durable when `persisted`, the provider's own otherwise. */
  readonly url: string
  /** Bucket-relative path, or the caller's key when nothing was uploaded. */
  readonly storageKey: string
  /** False when storage is unconfigured or the copy failed. */
  readonly persisted: boolean
}

/** Bytes fetched from a provider are capped; a poster is ~1MB, video ~20MB. */
const MAX_BYTES = 64 * 1024 * 1024

/** Extensions for the content types the media adapters actually return. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

@Injectable()
export class StorageService {
  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  /** True when a bucket is configured and `persist` can actually copy anything. */
  configured(): boolean {
    const env = loadEnv()
    return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY)
  }

  /**
   * Copies `sourceUrl` into the bucket under `keyPrefix` and returns the durable
   * URL.
   *
   * `transform` runs on the downloaded bytes before they are uploaded, so a
   * creative is stamped exactly once, on its way into permanent storage. Doing
   * it here rather than at render time means the stored file and the file the
   * customer sees are the same file — there is no second, unstamped copy to
   * leak out through a download button.
   *
   * Never throws. A creative that failed to copy is still a creative the user
   * generated and is waiting to see — losing durability is bad, losing the
   * poster outright is worse. Failures degrade to the provider URL and are
   * logged with enough context to diagnose.
   */
  async persist(
    sourceUrl: string,
    keyPrefix: string,
    transform?: Transform,
  ): Promise<PersistResult> {
    const env = loadEnv()
    const base = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_KEY

    if (!base || !key) {
      this.logger.warn(
        { keyPrefix },
        'Generated media stored as a provider URL — SUPABASE_URL/SUPABASE_SERVICE_KEY unset, ' +
          'so this link will expire',
      )
      return { url: sourceUrl, storageKey: keyPrefix, persisted: false }
    }

    try {
      const source = await fetch(sourceUrl)
      if (!source.ok) {
        throw new Error(`source responded ${String(source.status)}`)
      }

      const sourceType = source.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
      const raw = new Uint8Array(await source.arrayBuffer())
      if (raw.byteLength === 0) throw new Error('source returned an empty body')
      if (raw.byteLength > MAX_BYTES) {
        throw new Error(
          `source is ${String(raw.byteLength)} bytes, over the ${String(MAX_BYTES)} cap`,
        )
      }

      // The transform owns its own failure handling and returns the input
      // unchanged when it cannot run, so an unstamped poster still gets stored.
      const { bytes, contentType } = transform
        ? await transform(raw, sourceType)
        : { bytes: raw, contentType: sourceType }

      return await this.put(bytes, contentType, keyPrefix)
    } catch (err) {
      this.logger.error(
        { keyPrefix, err: err instanceof Error ? err.message : String(err) },
        'Could not copy generated media into storage — falling back to the expiring provider URL',
      )
      return { url: sourceUrl, storageKey: keyPrefix, persisted: false }
    }
  }

  /**
   * Store bytes we already hold.
   *
   * The upload path, and the tail of `persist`. Unlike `persist` this **throws**
   * on failure rather than degrading: there is no source URL to fall back to, so
   * "it did not store" has to reach the caller as an error instead of a result
   * that looks almost like success.
   */
  async persistBytes(
    bytes: Uint8Array,
    contentType: string,
    keyPrefix: string,
  ): Promise<PersistResult> {
    if (!this.configured()) {
      return { url: '', storageKey: keyPrefix, persisted: false }
    }
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`payload is ${String(bytes.byteLength)} bytes, over the cap`)
    }
    return this.put(bytes, contentType, keyPrefix)
  }

  /** The single upload call. Both entry points funnel through it. */
  private async put(
    bytes: Uint8Array,
    contentType: string,
    keyPrefix: string,
  ): Promise<PersistResult> {
    const env = loadEnv()
    const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '')
    const key = env.SUPABASE_SERVICE_KEY ?? ''
    const bucket = env.SUPABASE_BUCKET

    const objectPath = `${keyPrefix}.${EXTENSIONS[contentType] ?? 'bin'}`
    const upload = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        'content-type': contentType || 'application/octet-stream',
        // Regenerating into the same key should replace, not 409.
        'x-upsert': 'true',
        // Browsers and Meta's scraper both re-fetch these; a year is safe
        // because the path is unique per write and never rewritten.
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: bytes,
    })

    if (!upload.ok) {
      const detail = await upload.text().catch(() => '')
      throw new Error(`upload responded ${String(upload.status)} ${detail.slice(0, 200)}`)
    }

    return {
      url: `${base}/storage/v1/object/public/${bucket}/${objectPath}`,
      storageKey: objectPath,
      persisted: true,
    }
  }

  /**
   * Copies several URLs concurrently, preserving order.
   *
   * Order matters to the caller: variant 0 is the one promoted onto the asset,
   * and the reviewer picks the rest by position.
   */
  async persistMany(
    sourceUrls: readonly string[],
    keyPrefix: string,
    transform?: Transform,
  ): Promise<PersistResult[]> {
    return Promise.all(
      sourceUrls.map((url, i) => this.persist(url, `${keyPrefix}-${String(i)}`, transform)),
    )
  }
}
