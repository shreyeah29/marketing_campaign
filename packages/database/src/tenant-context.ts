import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Ambient tenant context, carried per async execution rather than per module.
 *
 * A module-level mutable variable would be catastrophic here: Node handles many
 * requests concurrently on one thread, so a shared "current organisation" would
 * be overwritten between an `await` and its continuation and serve one tenant's
 * data to another. `AsyncLocalStorage` gives every async chain its own value.
 */

export interface TenantContext {
  /** Tenant every scoped query is bound to. */
  readonly organizationId: string
  /** Principal on whose behalf the work runs. Absent for scheduled jobs. */
  readonly userId?: string
  /**
   * Set when an AI agent is acting. Recorded on writes so provenance survives,
   * and used to assert that an agent never exceeds its initiator's permissions.
   */
  readonly agentRunId?: string
  /** Correlates logs, audit entries and emitted events across one operation. */
  readonly requestId?: string
  /**
   * Set for view-only sessions (a platform admin viewing a client workspace).
   * `withTenantTransaction` then opens the transaction READ ONLY, so a write
   * that slips past every guard becomes a Postgres error, not a silent change.
   */
  readonly readOnly?: boolean
}

const storage = new AsyncLocalStorage<TenantContext>()

/**
 * Runs `fn` with `context` bound for the entire async subtree.
 *
 * Every HTTP request enters through this after authentication; every worker job
 * enters through it using the `organizationId` on its payload.
 *
 * Always async, deliberately. Prisma query builders return lazy promises: nothing
 * touches the database until the promise is awaited. A synchronous variant would
 * let `withTenant(ctx, () => db.company.findMany())` return an un-awaited promise,
 * exit the context, and only then run the query — with no tenant bound. The
 * extension would refuse it, so the failure is safe rather than a leak, but the
 * error would be baffling. Awaiting inside `run` makes the correct thing the only
 * thing.
 */
export async function withTenant<T>(context: TenantContext, fn: () => T | Promise<T>): Promise<T> {
  if (!context.organizationId) {
    throw new Error('withTenant requires a non-empty organizationId')
  }
  return storage.run(context, async () => await fn())
}

/** Current context, or `undefined` outside any tenant scope. */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore()
}

/**
 * Current context, or throws.
 *
 * Prefer this wherever a tenant is genuinely required, so the absence of one is
 * an error rather than a silent default.
 */
export function requireTenantContext(): TenantContext {
  const context = storage.getStore()
  if (!context) {
    throw new Error(
      'No tenant context. Wrap the operation in withTenant(...). Refusing to proceed unscoped.',
    )
  }
  return context
}

/**
 * Runs `fn` with no tenant bound.
 *
 * For genuinely cross-tenant platform work — the outbox dispatcher, Stripe
 * webhooks that must resolve an organisation before knowing it, scheduled
 * sweeps. Tenant-scoped models remain unusable inside; only explicitly
 * unscoped access works, and the database role's RLS policies still apply.
 * Named to be conspicuous in review.
 */
export async function withoutTenant<T>(fn: () => T | Promise<T>): Promise<T> {
  return storage.exit(async () => await fn())
}
