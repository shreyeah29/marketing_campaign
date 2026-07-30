#!/usr/bin/env node
/**
 * Migration drift gate.
 *
 * Fails when `schema.prisma` has been changed without a corresponding migration —
 * the class of mistake that made the previous .NET implementation's `EnsureCreated`
 * approach unable to evolve a schema safely.
 *
 * Why this is not just `prisma migrate diff --exit-code`
 *   Some database objects cannot be expressed in the Prisma datamodel at all:
 *   pgvector HNSW indexes, trigram GIN indexes, row-level security policies,
 *   functions and triggers. `migrate diff` therefore reports them as differences
 *   forever, and a bare `--exit-code` gate would be red on every run — which in
 *   practice means it gets disabled and stops protecting anything.
 *
 *   So the diff is inspected instead: statements affecting objects Prisma owns
 *   (tables, columns, types, constraints, and the indexes it declares) are
 *   failures. Statements affecting the explicitly allowlisted custom objects
 *   below are expected. Anything unrecognised is treated as a failure, so this
 *   gate cannot silently widen.
 *
 * Usage: node scripts/check-migration-drift.mjs
 * Requires SHADOW_DATABASE_URL.
 */

import { execFileSync } from 'node:child_process'

/**
 * Objects created by custom SQL in migrations that the Prisma datamodel cannot
 * represent. Adding an entry here is a deliberate act: it must correspond to a
 * real `CREATE` in a migration file.
 */
const EXPECTED_CUSTOM_OBJECTS = [
  'knowledge_chunk_embedding_hnsw_idx', // pgvector HNSW — vector ops are not in the datamodel
  'contact_name_trgm_idx', // trigram GIN over an expression
  'company_name_trgm_idx', // trigram GIN
  'content_document_title_trgm_idx', // trigram GIN
]

const shadowUrl = process.env['SHADOW_DATABASE_URL']
if (!shadowUrl) {
  console.error('SHADOW_DATABASE_URL is required to compute migration drift.')
  process.exit(1)
}

let diff
try {
  diff = execFileSync(
    'prisma',
    [
      'migrate',
      'diff',
      '--from-migrations',
      './prisma/migrations',
      '--to-schema-datamodel',
      './prisma/schema.prisma',
      '--shadow-database-url',
      shadowUrl,
      '--script',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
} catch (error) {
  console.error('Failed to compute migration diff:')
  console.error(error.stderr ?? error.message)
  process.exit(1)
}

const statements = diff
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('--'))

const unexpected = statements.filter(
  (statement) => !EXPECTED_CUSTOM_OBJECTS.some((name) => statement.includes(name)),
)

if (unexpected.length > 0) {
  console.error('Migration drift detected — schema.prisma does not match the migrations.\n')
  console.error('Unexplained statements:')
  for (const statement of unexpected) console.error(`  ${statement}`)
  console.error('\nFix by creating a migration:  pnpm db:migrate')
  console.error('If this is a custom object created by SQL in a migration, add its name to')
  console.error('EXPECTED_CUSTOM_OBJECTS in scripts/check-migration-drift.mjs.')
  process.exit(1)
}

const accounted = statements.length
console.warn(
  accounted === 0
    ? 'No migration drift.'
    : `No migration drift. ${accounted} statement(s) accounted for by allowlisted custom objects.`,
)
