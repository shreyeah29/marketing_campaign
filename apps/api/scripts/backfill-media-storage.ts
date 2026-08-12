/**
 * One-off backfill: rescue creatives that are still stored as expiring provider URLs.
 *
 * Every poster and video generated before durable storage existed was persisted
 * as the raw Runway URL. Those links die within days of generation, and when one
 * dies the campaign that used it shows a broken image with no way back. This
 * script copies whatever still resolves into the configured bucket and rewrites
 * the database to point at the copy.
 *
 * It is a race against expiry, not a migration that can wait: a URL that has
 * already lapsed cannot be recovered by anything, so those rows are reported and
 * left untouched rather than blanked — a dead link at least records what was
 * generated, and blanking it would destroy the prompt's only evidence.
 *
 * Safe to run repeatedly. Rows already pointing at the bucket are skipped, and
 * every URL is copied at most once even when several rows share it.
 *
 *   DATABASE_URL=<owner conn> SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/backfill-media-storage.ts
 *
 * Add `--dry-run` to report what would move without writing anything.
 */
import type { AppLogger } from '@vsp/observability'
import { createAdminClient } from '@vsp/database'

import { loadEnv } from '../src/config/env.js'
import { StorageService } from '../src/infrastructure/storage.js'

const DRY_RUN = process.argv.includes('--dry-run')

/** Console shim — the script has no Nest container to inject the real logger from. */
const logger = {
  info: () => undefined,
  debug: () => undefined,
  warn: (_ctx: unknown, msg?: string) => {
    if (msg) console.warn(`    ${msg}`)
  },
  error: (ctx: unknown, msg?: string) => {
    const detail = (ctx as { err?: string })?.err
    console.error(`    ${msg ?? 'error'}${detail ? ` — ${detail}` : ''}`)
  },
} as unknown as AppLogger

/** True once a URL points at our own bucket; those rows are already done. */
function isDurable(url: string, base: string): boolean {
  return url.startsWith(`${base.replace(/\/$/, '')}/storage/v1/object/public/`)
}

interface Variants {
  variants?: unknown
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY must be set — without a bucket there is ' +
        'nowhere to copy anything to.',
    )
  }
  const base = env.SUPABASE_URL

  const url = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!url) throw new Error('Set DATABASE_URL or DIRECT_DATABASE_URL')
  const db = createAdminClient(url)
  const storage = new StorageService(logger)

  try {
    // ── 1. Gather every distinct provider URL still referenced anywhere ───────
    const media = await db.mediaAsset.findMany({
      where: { deletedAt: null, url: { not: null } },
      select: { id: true, organizationId: true, url: true },
    })
    const assets = await db.campaignAsset.findMany({
      where: { deletedAt: null },
      select: { id: true, organizationId: true, mediaUrl: true, aiVersions: true },
    })

    // organizationId travels with the URL so the copy lands under the tenant
    // that generated it, matching the key layout new generations use.
    const pending = new Map<string, string>()
    const remember = (u: string | null, orgId: string): void => {
      if (!u || isDurable(u, base)) return
      if (!pending.has(u)) pending.set(u, orgId)
    }

    for (const m of media) remember(m.url, m.organizationId)
    for (const a of assets) {
      remember(a.mediaUrl, a.organizationId)
      const variants = (a.aiVersions as Variants | null)?.variants
      if (Array.isArray(variants)) {
        for (const v of variants) if (typeof v === 'string') remember(v, a.organizationId)
      }
    }

    console.log(
      `${String(media.length)} media rows, ${String(assets.length)} campaign assets scanned.`,
    )
    console.log(`${String(pending.size)} distinct URL(s) still on expiring provider links.\n`)
    if (pending.size === 0) {
      console.log('Nothing to do — everything already points at the bucket.')
      return
    }
    if (DRY_RUN) {
      for (const [u] of pending) console.log(`  would copy  ${u.slice(0, 110)}`)
      console.log('\nDry run — nothing was written.')
      return
    }

    // ── 2. Copy each once, sequentially ──────────────────────────────────────
    // Sequential on purpose: this competes with live traffic for the same API
    // instance, and a backfill that saves the posters but stalls the app has
    // traded one outage for another.
    const rewritten = new Map<string, string>()
    let expired = 0
    let i = 0
    for (const [source, organizationId] of pending) {
      i++
      const result = await storage.persist(source, `${organizationId}/backfill/${String(i)}`)
      if (result.persisted) {
        rewritten.set(source, result.url)
        console.log(`  [${String(i)}/${String(pending.size)}] saved`)
      } else {
        expired++
        console.log(
          `  [${String(i)}/${String(pending.size)}] UNRECOVERABLE — ${source.slice(0, 90)}`,
        )
      }
    }

    if (rewritten.size === 0) {
      console.log('\nNo URL could be copied. Every remaining link has already expired.')
      return
    }

    // ── 3. Rewrite the rows ──────────────────────────────────────────────────
    let mediaUpdated = 0
    for (const m of media) {
      const next = m.url ? rewritten.get(m.url) : undefined
      if (!next) continue
      await db.mediaAsset.update({
        where: { id: m.id },
        data: { url: next, storageKey: next.split('/object/public/')[1] ?? m.id },
      })
      mediaUpdated++
    }

    let assetUpdated = 0
    for (const a of assets) {
      const data: Record<string, unknown> = {}
      const nextPrimary = a.mediaUrl ? rewritten.get(a.mediaUrl) : undefined
      if (nextPrimary) data['mediaUrl'] = nextPrimary

      const versions = (a.aiVersions ?? {}) as Record<string, unknown> & Variants
      // Bound to a local so the Array.isArray narrowing survives into the
      // callbacks below.
      const current: unknown[] | null = Array.isArray(versions.variants) ? versions.variants : null
      if (current) {
        const nextVariants = current.map((v) =>
          typeof v === 'string' ? (rewritten.get(v) ?? v) : v,
        )
        // Only write when something actually changed — an untouched row should
        // not get a new updatedAt and look like it was edited.
        if (nextVariants.some((v, idx) => v !== current[idx])) {
          data['aiVersions'] = { ...versions, variants: nextVariants }
        }
      }

      if (Object.keys(data).length === 0) continue
      await db.campaignAsset.update({ where: { id: a.id }, data })
      assetUpdated++
    }

    console.log(
      `\nDone. ${String(rewritten.size)} file(s) copied into the bucket; ` +
        `${String(mediaUpdated)} media row(s) and ${String(assetUpdated)} campaign asset(s) rewritten.`,
    )
    if (expired > 0) {
      console.log(
        `${String(expired)} link(s) had already expired and could not be saved. Those rows ` +
          'keep their dead URL so the prompt that produced them is still on record.',
      )
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
