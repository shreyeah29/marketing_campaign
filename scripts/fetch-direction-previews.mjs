#!/usr/bin/env node
/**
 * Pull the generated direction samples into the repo, once.
 *
 * The samples are committed files — see
 * `apps/api/assets/creative-directions/README.md` for why they are not generated
 * per environment. But they have to be born somewhere, and the only thing that
 * knows what "Cinematic" looks like is an image model.
 *
 * So the flow is authoring, not operations, and it runs once per new direction:
 *
 *   1. Platform console → "Generate the direction previews". Draws anything with
 *      no picture yet and stores it.
 *   2. This script. Downloads that set into `apps/api/assets/creative-directions`.
 *   3. Commit. That direction is fixed everywhere, forever, at no further cost.
 *
 * Nothing here runs in production. It is a development tool that happens to need
 * a platform token, which is why the token is read from the environment rather
 * than prompted for or stored.
 *
 * Usage:
 *   MOS_API=https://api.example.com \
 *   MOS_PLATFORM_TOKEN=... \
 *   node scripts/fetch-direction-previews.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../apps/api/assets/creative-directions')

const api = process.env['MOS_API']?.replace(/\/$/, '')
const token = process.env['MOS_PLATFORM_TOKEN']

if (!api || !token) {
  console.error('Set MOS_API and MOS_PLATFORM_TOKEN.\n')
  console.error('  MOS_API              the API base URL, e.g. https://api.example.com')
  console.error('  MOS_PLATFORM_TOKEN   a platform admin token from the operator console')
  process.exit(1)
}

/**
 * Ask the platform for the stored set.
 *
 * `force: false`, so running this after everything is already committed draws
 * nothing and costs nothing — it just reports what exists.
 */
const res = await fetch(`${api}/platform/direction-previews`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ force: false }),
})

if (!res.ok) {
  console.error(`The API answered ${res.status}. Check MOS_API and the token.`)
  process.exit(1)
}

const run = await res.json()
for (const failure of run.failed ?? []) {
  console.error(`  ! ${failure.id}: ${failure.reason}`)
}

/**
 * The URLs live in storage, which is public-read, so the download needs no
 * credentials. Sequential because this is a handful of files run by hand — the
 * concurrency would save a second and cost the clarity of a single failure line.
 */
const list = await fetch(`${api}/platform/direction-preview-urls`, {
  headers: { authorization: `Bearer ${token}` },
})
if (!list.ok) {
  console.error(`Could not list the stored samples (${list.status}).`)
  process.exit(1)
}
const { data } = await list.json()

await mkdir(OUT, { recursive: true })
let saved = 0
for (const row of data ?? []) {
  const image = await fetch(row.url)
  if (!image.ok) {
    console.error(`  ! ${row.directionId}: download responded ${image.status}`)
    continue
  }
  const bytes = Buffer.from(await image.arrayBuffer())
  await writeFile(join(OUT, `${row.directionId}.png`), bytes)
  console.log(`  ✓ ${row.directionId}.png  ${String(Math.round(bytes.byteLength / 1024))} KB`)
  saved += 1
}

console.log(`\n${String(saved)} saved to apps/api/assets/creative-directions.`)
console.log('Commit them — they are fixed from here and cost nothing again.')
