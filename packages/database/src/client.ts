import { PrismaClient } from '../generated/client/index.js'

import { RowLevelSecurityNotEnforcedError } from './errors.js'
import { TENANT_SETTING } from './model-registry.js'
import { createTenantScopeExtension } from './tenant-scope.js'
import { getTenantContext, requireTenantContext, type TenantContext } from './tenant-context.js'

export interface DatabaseClientOptions {
  /** Application-role connection. RLS applies. */
  readonly url: string
  /** Emit query timings. Development only — statements can contain personal data. */
  readonly logQueries?: boolean
}

/**
 * The tenant-scoped client. Every module receives this; nothing receives the raw
 * `PrismaClient`, which is why `@prisma/client` is lint-banned outside this package.
 */
export type DatabaseClient = ReturnType<typeof createDatabaseClient>

/**
 * Transaction handle produced by {@link withTenantTransaction}.
 *
 * Derived from `DatabaseClient` rather than `Prisma.TransactionClient`: the client
 * is `$extends`-wrapped, so its transaction handle carries the tenant-scope
 * extension too. Using Prisma's stock type here would compile against a client
 * that does not scope — the extension would still run, but the types would
 * describe something other than what executes.
 */
export type TenantTransactionClient = Omit<
  DatabaseClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * Payload for a tenant-scoped create, with the tenant column omitted.
 *
 * The extension injects `organizationId` at runtime, but Prisma's generated input
 * types cannot know that and still demand it. Rather than have every call site
 * either repeat the tenant or cast, the omission is expressed once here.
 * Repositories built in the rest of Phase 4 accept these types.
 */
export type TenantCreateInput<T> = Omit<T, 'organizationId' | 'organization'>

/**
 * Narrows a create payload to what the caller must actually supply.
 *
 * The cast is confined to this one function, with the reason stated, instead of
 * appearing at each call site where it would read as carelessness.
 */
export function tenantInput<T extends object>(data: T): T & { organizationId: string } {
  return data as T & { organizationId: string }
}

export function createDatabaseClient(options: DatabaseClientOptions) {
  const base = new PrismaClient({
    datasources: { db: { url: options.url } },
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

  return base.$extends(createTenantScopeExtension())
}

/** Raw, unscoped client. Migrations, seeds and the RLS boot check only. */
export function createAdminClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } }, log: ['warn', 'error'] })
}

/**
 * Binds the tenant for row-level security and runs `fn` inside one transaction.
 *
 * Why a transaction is required, not merely convenient: the policies read
 * `current_setting('app.organization_id')`, and it is set transaction-locally so
 * that a pooled connection cannot leak one tenant's setting into the next
 * request. `SET LOCAL` only survives for the transaction, so the setting and the
 * queries relying on it must share one. A query issued outside this wrapper has
 * no tenant setting, and RLS then filters every row — a visible empty result
 * rather than a silent cross-tenant read.
 *
 * The value is passed as a bound parameter to `set_config`, never interpolated,
 * so a hostile organisation id cannot become SQL.
 */
export async function withTenantTransaction<T>(
  client: DatabaseClient,
  fn: (tx: TenantTransactionClient) => Promise<T>,
  context?: TenantContext,
): Promise<T> {
  const ctx = context ?? requireTenantContext()
  const { organizationId } = ctx

  return client.$transaction(async (tx) => {
    // Must be the first statement in the transaction: Postgres refuses to
    // change the read-only property after any query has run.
    if (ctx.readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`
    await tx.$executeRaw`SELECT set_config(${TENANT_SETTING}, ${organizationId}, true)`
    return fn(tx)
  })
}

/**
 * Confirms the connection is genuinely constrained by row-level security.
 *
 * Called once at boot, and fatal on failure. A deployment connecting as a
 * superuser or the table owner behaves identically to a correct one while having
 * no database-level tenant isolation whatsoever — the most dangerous failure mode
 * available, because nothing looks wrong. Better to refuse to start.
 */
export async function assertRowLevelSecurityEnforced(
  client: Pick<PrismaClient, '$queryRaw'>,
): Promise<void> {
  const rows = await client.$queryRaw<
    Array<{ enforced: boolean; current_user: string }>
  >`SELECT app.rls_enforced_for_current_user() AS enforced, current_user AS current_user`

  const result = rows[0]
  if (!result) {
    throw new Error(
      'Could not determine whether row-level security applies. Confirm the row_level_security ' +
        'migration has been applied — app.rls_enforced_for_current_user() is missing.',
    )
  }

  if (!result.enforced) {
    throw new RowLevelSecurityNotEnforcedError(result.current_user)
  }
}

/**
 * Confirms every model the extension believes is tenant-scoped actually has an
 * `organization_id` column, and that no table with one was left off the list.
 *
 * This closes the drift that would otherwise be invisible: adding a tenant-scoped
 * model without registering it means the extension passes its queries through
 * unscoped. Run in tests and at boot in non-production.
 */
export async function assertTenantRegistryComplete(
  client: Pick<PrismaClient, '$queryRaw'>,
  registeredTableNames: readonly string[],
): Promise<void> {
  const rows = await client.$queryRaw<Array<{ table_name: string }>>`
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
  `

  const actual = new Set(rows.map((row) => row.table_name))
  const registered = new Set(registeredTableNames)

  const unregistered = [...actual].filter((table) => !registered.has(table)).sort()
  const stale = [...registered].filter((table) => !actual.has(table)).sort()

  const problems: string[] = []
  if (unregistered.length > 0) {
    problems.push(
      `Tables have organization_id but are not registered as tenant-scoped, so their queries run ` +
        `UNSCOPED: ${unregistered.join(', ')}`,
    )
  }
  if (stale.length > 0) {
    problems.push(
      `Registered as tenant-scoped but have no organization_id column: ${stale.join(', ')}`,
    )
  }

  if (problems.length > 0) {
    throw new Error(
      `Tenant registry is out of sync with the schema.\n  - ${problems.join('\n  - ')}`,
    )
  }
}

export { getTenantContext, requireTenantContext }
