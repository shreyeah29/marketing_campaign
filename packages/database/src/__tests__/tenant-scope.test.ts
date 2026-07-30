/**
 * Tenant isolation at the application layer, tested against a real PostgreSQL
 * instance. Not mocked: the guarantee being verified is the interaction between
 * the extension, Prisma's query builder and the database, and a mock would only
 * confirm that the mock agrees with itself.
 *
 * Layer 3 (row-level security) has its own suite in
 * scripts/verify-tenant-isolation.sql. These tests cover layer 2 — and in
 * particular that it fails CLOSED, which is the property the previous .NET
 * implementation lacked when it returned Guid.Empty for a missing tenant.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  assertTenantRegistryComplete,
  createAdminClient,
  createDatabaseClient,
  MissingTenantContextError,
  TENANT_SCOPED_MODELS,
  tenantInput,
  TenantMismatchError,
  UnscopableOperationError,
  withTenant,
  withoutTenant,
  type DatabaseClient,
  type PrismaClient,
} from '../index.js'

const ADMIN_URL = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''

const ORG_A = 'test-tenant-scope-org-a'
const ORG_B = 'test-tenant-scope-org-b'

let admin: PrismaClient
let db: DatabaseClient

/** camelCase model name → snake_case table name, matching the @@map convention. */
function toTableName(model: string): string {
  return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error('DIRECT_DATABASE_URL or DATABASE_URL must be set to run database tests.')
  }

  admin = createAdminClient(ADMIN_URL)
  db = createDatabaseClient({ url: ADMIN_URL })

  // Fixtures are written with the admin client so they can span tenants.
  await admin.company.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } })
  await admin.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })

  await admin.organization.createMany({
    data: [
      { id: ORG_A, name: 'Scope Test A', slug: ORG_A },
      { id: ORG_B, name: 'Scope Test B', slug: ORG_B },
    ],
  })

  await admin.company.createMany({
    data: [
      { id: `${ORG_A}-c1`, organizationId: ORG_A, name: 'A One' },
      { id: `${ORG_A}-c2`, organizationId: ORG_A, name: 'A Two' },
      { id: `${ORG_B}-c1`, organizationId: ORG_B, name: 'B One' },
    ],
  })
})

afterAll(async () => {
  await admin.company.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } })
  await admin.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } })
  await admin.$disconnect()
  await db.$disconnect()
})

describe('fails closed without a tenant context', () => {
  it('refuses a read', async () => {
    await expect(withoutTenant(() => db.company.findMany())).rejects.toThrow(
      MissingTenantContextError,
    )
  })

  it('refuses a write', async () => {
    await expect(
      withoutTenant(() => db.company.create({ data: tenantInput({ name: 'Should not exist' }) })),
    ).rejects.toThrow(MissingTenantContextError)
  })

  it('refuses a count, so an aggregate cannot leak a total across tenants', async () => {
    await expect(withoutTenant(() => db.company.count())).rejects.toThrow(MissingTenantContextError)
  })

  it('refuses deleteMany, so an unscoped delete cannot wipe every tenant', async () => {
    await expect(withoutTenant(() => db.company.deleteMany({}))).rejects.toThrow(
      MissingTenantContextError,
    )
  })
})

describe('scopes reads to the active tenant', () => {
  it('returns only the tenant rows', async () => {
    const [a, b] = await Promise.all([
      withTenant({ organizationId: ORG_A }, () => db.company.findMany()),
      withTenant({ organizationId: ORG_B }, () => db.company.findMany()),
    ])

    expect(a.map((row) => row.name).sort()).toEqual(['A One', 'A Two'])
    expect(b.map((row) => row.name)).toEqual(['B One'])
  })

  it('scopes count', async () => {
    await expect(withTenant({ organizationId: ORG_A }, () => db.company.count())).resolves.toBe(2)
  })

  it('cannot be widened by passing another tenant explicitly', async () => {
    const rows = await withTenant({ organizationId: ORG_B }, () =>
      db.company.findMany({ where: { organizationId: ORG_A } }),
    )
    expect(rows).toEqual([])
  })

  it('cannot read another tenant row by id', async () => {
    const row = await withTenant({ organizationId: ORG_B }, () =>
      db.company.findFirst({ where: { id: `${ORG_A}-c1` } }),
    )
    expect(row).toBeNull()
  })

  it('keeps contexts separate across interleaved async work', async () => {
    // The property AsyncLocalStorage buys us: a module-level "current tenant"
    // would be overwritten between an await and its continuation.
    const results = await Promise.all([
      withTenant({ organizationId: ORG_A }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return db.company.count()
      }),
      withTenant({ organizationId: ORG_B }, async () => db.company.count()),
      withTenant({ organizationId: ORG_A }, async () => db.company.count()),
    ])

    expect(results).toEqual([2, 1, 2])
  })
})

describe('scopes writes to the active tenant', () => {
  it('stamps organizationId without being asked', async () => {
    const created = await withTenant({ organizationId: ORG_A }, () =>
      db.company.create({ data: tenantInput({ name: 'Stamped' }) }),
    )
    expect(created.organizationId).toBe(ORG_A)
    await admin.company.delete({ where: { id: created.id } })
  })

  it('rejects a write that names a different tenant', async () => {
    await expect(
      withTenant({ organizationId: ORG_A }, () =>
        db.company.create({ data: { name: 'Smuggled', organizationId: ORG_B } }),
      ),
    ).rejects.toThrow(TenantMismatchError)
  })

  it('cannot update another tenant row', async () => {
    const result = await withTenant({ organizationId: ORG_B }, () =>
      db.company.updateMany({ where: { id: `${ORG_A}-c1` }, data: { name: 'Hijacked' } }),
    )
    expect(result.count).toBe(0)

    const untouched = await admin.company.findUnique({ where: { id: `${ORG_A}-c1` } })
    expect(untouched?.name).toBe('A One')
  })

  it('cannot delete another tenant row', async () => {
    const result = await withTenant({ organizationId: ORG_B }, () =>
      db.company.deleteMany({ where: { id: `${ORG_A}-c2` } }),
    )
    expect(result.count).toBe(0)
    await expect(admin.company.count({ where: { organizationId: ORG_A } })).resolves.toBe(2)
  })

  it('stamps every row of a createMany', async () => {
    await withTenant({ organizationId: ORG_A }, () =>
      db.company.createMany({
        data: [tenantInput({ name: 'Bulk One' }), tenantInput({ name: 'Bulk Two' })],
      }),
    )

    const created = await admin.company.findMany({
      where: { organizationId: ORG_A, name: { startsWith: 'Bulk' } },
    })
    expect(created).toHaveLength(2)
    expect(created.every((row) => row.organizationId === ORG_A)).toBe(true)

    await admin.company.deleteMany({ where: { id: { in: created.map((row) => row.id) } } })
  })
})

describe('refuses operations it cannot scope', () => {
  it('rejects findUnique rather than letting it run unscoped', async () => {
    // Prisma will not accept a non-unique field in findUnique's where clause, so
    // the tenant predicate cannot be added. Refusing is the only safe choice.
    await expect(
      withTenant({ organizationId: ORG_A }, () =>
        db.company.findUnique({ where: { id: `${ORG_B}-c1` } }),
      ),
    ).rejects.toThrow(UnscopableOperationError)
  })

  it('names the safe alternative in the error', async () => {
    await withTenant({ organizationId: ORG_A }, async () => {
      const error = await db.company
        .findUnique({ where: { id: 'anything' } })
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(UnscopableOperationError)
      expect((error as Error).message).toContain('findFirst')
    })
  })
})

describe('global models are not scoped', () => {
  it('allows User access without a tenant, since a user spans organisations', async () => {
    await expect(withoutTenant(() => db.user.count())).resolves.toBeTypeOf('number')
  })
})

describe('registry matches the schema', () => {
  it('every table with organization_id is registered, and nothing stale is', async () => {
    // Guards the drift that would otherwise be invisible: a new tenant-scoped
    // model left off the registry has its queries passed through unscoped.
    await expect(
      assertTenantRegistryComplete(admin, TENANT_SCOPED_MODELS.map(toTableName)),
    ).resolves.toBeUndefined()
  })
})
