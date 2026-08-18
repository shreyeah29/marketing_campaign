/**
 * Copy media that still points at Runway into our own storage.
 *
 * Everything generated before the adapter began persisting holds a
 * `runwayml.com` URL. Those links expire within days, so most of what this finds
 * is already dead — and that is the expected outcome, not a failure. The script
 * exists to recover whatever is still alive and, more usefully, to produce a
 * definitive list of what is not, so the rows can be regenerated or removed
 * deliberately rather than discovered as broken images by a client.
 *
 * Run it with:
 *
 *   corepack pnpm --filter @marketing-os/api exec tsx scripts/backfill-runway-media.ts
 *   corepack pnpm --filter @marketing-os/api exec tsx scripts/backfill-runway-media.ts --apply
 *
 * Without `--apply` it only reports. Nothing is written, nothing is fetched from
 * Runway, and the counts tell you the size of the problem before you act on it.
 *
 * Three rules it follows:
 *
 *   · **One row at a time, and one failure never stops the run.** A dead link is
 *     the common case; aborting on the first would mean the report is only ever
 *     as long as the first expired asset.
 *   · **Deterministic keys.** Re-running writes over the same objects instead of
 *     accumulating copies, so an interrupted run can simply be run again.
 *   · **The row is updated only after the copy succeeds.** A row that still
 *     points at Runway is at least honest about where its bytes are.
 */

import { createDatabaseClient } from '@marketing-os/database'

import { loadEnv } from '../src/config/env.js'
import { StorageService } from '../src/infrastructure/storage.js'

const RUNWAY_HOST = /runwayml\.com/i

interface Row {
  id: string
  organizationId: string
  url: string | null
  type: string
}

interface Outcome {
  readonly id: string
  readonly organizationId: string
  readonly state: 'copied' | 'expired' | 'failed' | 'skipped'
  readonly detail?: string
}

/** Console logging is the interface here; this is an operator script. */
/* eslint-disable no-console */

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const env = loadEnv()
  const db = createDatabaseClient({ url: env.DIRECT_DATABASE_URL })

  // A plain logger: StorageService expects one and this is not running in Nest.
  const storage = new StorageService({
    info: () => undefined,
    warn: () => undefined,
    error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
    debug: () => undefined,
  } as never)

  console.log(apply ? 'Backfilling Runway media…' : 'Dry run — nothing will be written.\n')

  // The owner connection, deliberately: this spans every tenant, and the
  // application role cannot see across organisations by design.
  const rows = (await db.$queryRawUnsafe(`
    SELECT id, organization_id AS "organizationId", url, type::text AS type
    FROM media_asset
    WHERE deleted_at IS NULL AND url ILIKE '%runwayml.com%'
    ORDER BY created_at ASC
  `)) as Row[]

  if (rows.length === 0) {
    console.log('No media assets hold a Runway URL. Nothing to do.')
    await db.$disconnect()
    return
  }

  console.log(`${String(rows.length)} asset(s) still point at Runway.\n`)

  const outcomes: Outcome[] = []

  for (const row of rows) {
    if (!row.url || !RUNWAY_HOST.test(row.url)) {
      outcomes.push({ id: row.id, organizationId: row.organizationId, state: 'skipped' })
      continue
    }

    // Deterministic: the row id is already unique and stable, so a second run
    // overwrites the object it wrote the first time.
    const key = `${row.organizationId}/recovered/${row.id}`

    if (!apply) {
      // Reachability is checked even in a dry run, because the number that
      // matters is how many are still recoverable — not how many exist.
      const alive = await isReachable(row.url)
      outcomes.push({
        id: row.id,
        organizationId: row.organizationId,
        state: alive ? 'copied' : 'expired',
        detail: alive ? 'would copy' : 'link is dead',
      })
      continue
    }

    try {
      const stored = await storage.persist(row.url, key)
      if (!stored.persisted || !stored.url) {
        outcomes.push({
          id: row.id,
          organizationId: row.organizationId,
          state: 'expired',
          detail: 'source could not be fetched — the link has expired',
        })
        continue
      }

      await db.$executeRawUnsafe(
        `UPDATE media_asset SET url = $1, storage_key = $2, updated_at = now() WHERE id = $3`,
        stored.url,
        stored.storageKey,
        row.id,
      )
      outcomes.push({ id: row.id, organizationId: row.organizationId, state: 'copied' })
    } catch (err) {
      outcomes.push({
        id: row.id,
        organizationId: row.organizationId,
        state: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  report(outcomes, apply)
  await db.$disconnect()
}

/** A HEAD request, so a dry run does not download hundreds of megabytes. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
    return res.ok
  } catch {
    return false
  }
}

function report(outcomes: readonly Outcome[], apply: boolean): void {
  const by = (state: Outcome['state']): Outcome[] => outcomes.filter((o) => o.state === state)

  const copied = by('copied')
  const expired = by('expired')
  const failed = by('failed')

  console.log('\n─────────────────────────────────────────────')
  console.log(apply ? 'Backfill complete.' : 'Dry run complete.')
  console.log(`  recovered : ${String(copied.length)}`)
  console.log(`  expired   : ${String(expired.length)}`)
  console.log(`  failed    : ${String(failed.length)}`)

  // The unrecoverable ones are the point of running this. Listed in full rather
  // than counted, because each is a row somebody has to decide about.
  if (expired.length > 0) {
    console.log('\nUnrecoverable — the Runway link is gone. Regenerate or delete these:')
    for (const o of expired) console.log(`  ${o.id}  (org ${o.organizationId})`)
  }

  if (failed.length > 0) {
    console.log('\nFailed for another reason — worth retrying:')
    for (const o of failed) console.log(`  ${o.id}  (org ${o.organizationId})  ${o.detail ?? ''}`)
  }

  // Deliberately exits 0 even with expired rows: they are the expected finding,
  // and a non-zero exit would make this look like a broken job in a scheduler.
  console.log('─────────────────────────────────────────────\n')
}

main().catch((err: unknown) => {
  console.error('Backfill aborted:', err)
  process.exitCode = 1
})
