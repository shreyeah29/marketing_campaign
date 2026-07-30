/**
 * The bridge between layer 2 (the Prisma extension) and layer 3 (PostgreSQL
 * row-level security).
 *
 * Layer 2 rewrites queries. Layer 3 only applies when `app.organization_id` is
 * actually set on the connection running them, and only when the connecting role
 * is genuinely subject to policies. Both are easy to get wrong in a way that
 * looks completely fine, so both are asserted here.
 *
 * Requires the application role from scripts/provision-app-role.sql. Set
 * APP_DATABASE_URL to it; the suite skips if absent, so it never fails a machine
 * that has not been provisioned.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  assertRowLevelSecurityEnforced,
  createAdminClient,
  createDatabaseClient,
  RowLevelSecurityNotEnforcedError,
  withTenantTransaction,
  type DatabaseClient,
  type PrismaClient,
} from '../index.js'

const ADMIN_URL = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''
const APP_URL = process.env['APP_DATABASE_URL'] ?? ''

const ORG_A = 'test-rls-bridge-org-a'
const ORG_B = 'test-rls-bridge-org-b'

let admin: PrismaClient

beforeAll(async () => {
  admin = createAdminClient(ADMIN_URL)

  await admin.company.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } })
  await admin.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
  await admin.organization.createMany({
    data: [
      { id: ORG_A, name: 'RLS Bridge A', slug: ORG_A },
      { id: ORG_B, name: 'RLS Bridge B', slug: ORG_B },
    ],
  })
  await admin.company.createMany({
    data: [
      { id: `${ORG_A}-c1`, organizationId: ORG_A, name: 'A One' },
      { id: `${ORG_B}-c1`, organizationId: ORG_B, name: 'B One' },
    ],
  })
})

afterAll(async () => {
  await admin.company.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } })
  await admin.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
  await admin.$disconnect()
})

describe('boot assertion', () => {
  it('rejects the owner connection, which would silently bypass every policy', async () => {
    // The owner is exempt from RLS. An application deployed on this connection
    // string looks healthy and has no database-level isolation at all — so the
    // API must refuse to start rather than serve traffic in that state.
    await expect(assertRowLevelSecurityEnforced(admin)).rejects.toThrow(
      RowLevelSecurityNotEnforcedError,
    )
  })

  it.runIf(APP_URL)('accepts the application role', async () => {
    const app = createAdminClient(APP_URL)
    try {
      await expect(assertRowLevelSecurityEnforced(app)).resolves.toBeUndefined()
    } finally {
      await app.$disconnect()
    }
  })
})

describe.runIf(APP_URL)('row-level security through the application role', () => {
  let db: DatabaseClient

  beforeAll(() => {
    db = createDatabaseClient({ url: APP_URL })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('sees nothing without a tenant setting, even via raw SQL', async () => {
    // $queryRaw cannot be rewritten by the extension. This is exactly the hole
    // layer 3 exists to close, so it is asserted directly.
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "company"`
    expect(Number(rows[0]?.count ?? -1)).toBe(0)
  })

  it('binds the tenant for the transaction and scopes raw SQL to it', async () => {
    const rows = await withTenantTransaction(
      db,
      async (tx) => tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM "company"`,
      { organizationId: ORG_A },
    )

    expect(rows.map((row) => row.name)).toEqual(['A One'])
  })

  it('does not leak the setting past the transaction', async () => {
    // set_config is transaction-local precisely so a pooled connection cannot
    // carry one tenant's setting into the next request.
    await withTenantTransaction(db, async (tx) => tx.$queryRaw`SELECT 1`, {
      organizationId: ORG_A,
    })

    const after = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "company"`
    expect(Number(after[0]?.count ?? -1)).toBe(0)
  })

  it('refuses a cross-tenant write at the database layer', async () => {
    await expect(
      withTenantTransaction(
        db,
        async (tx) =>
          tx.$executeRaw`INSERT INTO "company" (id, organization_id, name, created_at, updated_at)
                         VALUES ('rls-bridge-probe', ${ORG_B}, 'Injected', now(), now())`,
        { organizationId: ORG_A },
      ),
    ).rejects.toThrow(/row-level security/i)
  })
})
