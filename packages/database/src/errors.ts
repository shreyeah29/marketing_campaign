/**
 * Errors raised by the tenancy layer.
 *
 * These are deliberately distinct types rather than generic `Error`s: the API
 * layer maps them to specific HTTP responses, and a missing tenant context must
 * never be indistinguishable from an ordinary database failure.
 */

/**
 * Thrown when a tenant-scoped query is attempted with no tenant in context.
 *
 * This exists so isolation fails CLOSED. The previous .NET implementation
 * returned `Guid.Empty` in this situation, which silently produced queries
 * scoped to a non-existent organisation — reads returned nothing while writes
 * created orphaned rows attributed to no tenant.
 */
export class MissingTenantContextError extends Error {
  override readonly name = 'MissingTenantContextError'

  constructor(
    readonly model: string,
    readonly operation: string,
  ) {
    super(
      `${model}.${operation} requires a tenant context. Wrap the call in withTenant(organizationId, ...) ` +
        'or, in a worker, open the context from the job payload. This is refused rather than ' +
        'defaulted, because defaulting a tenant is how cross-tenant leaks happen.',
    )
  }
}

/**
 * Thrown when application code tries to override `organizationId` on a
 * tenant-scoped write. Tenant assignment is the infrastructure's job, and an
 * explicit mismatch is far more likely to be a bug — or an attack — than intent.
 */
export class TenantMismatchError extends Error {
  override readonly name = 'TenantMismatchError'

  constructor(
    readonly model: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `${model} write specified organizationId "${received}" while the active tenant is "${expected}". ` +
        'Cross-tenant writes are refused. Do not set organizationId manually; it is injected.',
    )
  }
}

/**
 * Thrown when an operation cannot be tenant-scoped safely.
 *
 * `findUnique` is the notable case. Prisma rejects non-unique fields in its
 * `where` clause, so `organizationId` cannot be added, and a Prisma extension
 * cannot rewrite one operation into another. Rather than let the most common
 * lookup in the codebase run unscoped, it is refused: `findFirst` accepts an
 * identical `where` and is scoped normally.
 */
export class UnscopableOperationError extends Error {
  override readonly name = 'UnscopableOperationError'

  constructor(
    readonly model: string,
    readonly operation: string,
    guidance: string,
  ) {
    super(`${model}.${operation} cannot be tenant-scoped. ${guidance}`)
  }
}

/**
 * Thrown at boot when the application's database connection is not actually
 * constrained by row-level security — because it is a superuser, has BYPASSRLS,
 * or owns the tables.
 *
 * This is fatal on purpose. A deployment in that state appears to work perfectly
 * while having no tenant isolation at the database layer at all, which is the
 * most dangerous possible failure mode: silent.
 */
export class RowLevelSecurityNotEnforcedError extends Error {
  override readonly name = 'RowLevelSecurityNotEnforcedError'

  constructor(readonly currentUser: string) {
    super(
      `The database role "${currentUser}" is not subject to row-level security. It is a superuser, ` +
        'has BYPASSRLS, or owns the tables, so every tenant policy is bypassed. Point DATABASE_URL at ' +
        'the application role created by scripts/provision-app-role.sql and keep the owner credentials ' +
        'for DIRECT_DATABASE_URL (migrations and seeds) only.',
    )
  }
}
