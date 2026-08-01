import { FEATURES, findPlan, isUnlimited, LIMITS, PLANS, resolveDependencies } from '@vsp/contracts'

import type { PrismaClient } from '../generated/client/index.js'
import { withTenantTransaction, type DatabaseClient } from './client.js'

/**
 * Entitlements — the bridge between the code registries and the database.
 *
 * Two responsibilities:
 *   1. **Sync** the immutable code registries (features, plans) into their tables
 *      at deploy time, so assignments have referential integrity and a platform
 *      admin can browse them. The code is the source of truth; the tables mirror
 *      it and add the bespoke rows an owner creates at runtime.
 *   2. **Resolve** an organisation's effective entitlements — which features it
 *      has, at what limits, with what per-feature config — for the request
 *      pipeline to enforce.
 *
 * Resolution is the hot path: every request checks it. So it is designed to be a
 * single indexed query set, and the API caches the result in Redis keyed by the
 * organisation, invalidated whenever a platform admin changes that org.
 */

// ─── Registry sync (deploy-time, runs as the owner) ──────────────────────────

/**
 * Upserts the code feature registry into the `feature` table.
 *
 * Idempotent. Runs as the owner (registry rows are platform-global, not tenant
 * data). A feature is never deleted here — removing a feature from the code
 * registry leaves the row so existing assignments do not dangle; retiring a
 * feature is a deliberate, separate operation.
 */
export async function syncFeatureRegistry(admin: PrismaClient): Promise<{ synced: number }> {
  for (const feature of FEATURES) {
    await admin.feature.upsert({
      where: { key: feature.id },
      update: {
        name: feature.name,
        description: feature.description,
        category: feature.category,
        version: feature.version,
        billingCategory: feature.billingCategory,
        defaultEnabled: feature.defaultEnabled,
        isCustom: feature.custom ?? false,
      },
      create: {
        key: feature.id,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        version: feature.version,
        billingCategory: feature.billingCategory,
        defaultEnabled: feature.defaultEnabled,
        isCustom: feature.custom ?? false,
      },
    })
  }
  return { synced: FEATURES.length }
}

/**
 * Upserts the built-in plans and their feature bundles.
 *
 * The plan→feature bundle is replaced wholesale on each sync so a plan's contents
 * always match the code definition. Custom plans (isBuiltIn = false) are left
 * untouched — those are owner-authored and not the code's to manage.
 */
export async function syncPlanRegistry(admin: PrismaClient): Promise<{ synced: number }> {
  for (const plan of PLANS) {
    const record = await admin.plan.upsert({
      where: { key: plan.id },
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPriceUsd: plan.monthlyPriceUsd.toString(),
        yearlyPriceUsd: plan.yearlyPriceUsd.toString(),
        customPricing: plan.customPricing,
        defaultLimits: plan.limits,
        isBuiltIn: true,
      },
      create: {
        key: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceUsd: plan.monthlyPriceUsd.toString(),
        yearlyPriceUsd: plan.yearlyPriceUsd.toString(),
        customPricing: plan.customPricing,
        defaultLimits: plan.limits,
        isBuiltIn: true,
      },
    })

    // Replace the bundle: delete then re-insert, so a feature removed from the
    // plan in code is removed in the table too.
    await admin.planFeature.deleteMany({ where: { planId: record.id } })
    if (plan.featureIds.length > 0) {
      await admin.planFeature.createMany({
        data: plan.featureIds.map((featureKey) => ({ planId: record.id, featureKey })),
        skipDuplicates: true,
      })
    }
  }
  return { synced: PLANS.length }
}

/** Runs both syncs. Called as a deploy step, after migrations. */
export async function syncRegistries(admin: PrismaClient): Promise<void> {
  await syncFeatureRegistry(admin)
  await syncPlanRegistry(admin)
}

// ─── Resolution (per-request, runs tenant-scoped) ────────────────────────────

export interface EntitlementSnapshot {
  readonly organizationId: string
  readonly status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  readonly planKey: string | null
  /** Every enabled feature id, plan + grants, with dependency closure. */
  readonly features: ReadonlySet<string>
  /** Effective limit per metric. -1 is unlimited. */
  readonly limits: ReadonlyMap<string, number>
  /** Per-feature config, keyed by feature id. */
  readonly featureConfig: ReadonlyMap<string, Record<string, unknown>>
  /** When this snapshot was computed, for cache TTL. */
  readonly resolvedAt: string
}

/**
 * Computes an organisation's effective entitlements.
 *
 * Effective features = the plan's features ∪ explicit assignments where
 * `enabled` and not expired. A `FeatureAssignment` with `enabled = false`
 * overrides a plan inclusion, so a platform admin can revoke a single feature
 * without changing the plan. The dependency closure is applied last, so an
 * enabled feature never lacks a dependency it needs.
 *
 * Runs inside a tenant transaction so the row-level-security GUC is set on the
 * connection that serves the reads. Without the transaction the application role
 * has no `app.organization_id` bound and RLS returns nothing — fail-closed, which
 * is correct but not what a resolver wants. The transaction is the seam that makes
 * the app role able to read its own tenant's rows at all.
 */
export async function resolveEntitlements(
  db: DatabaseClient,
  organizationId: string,
): Promise<EntitlementSnapshot> {
  const { org, assignments, limitRows } = await withTenantTransaction(
    db,
    async (tx) => {
      const [orgRow, assignmentRows, limitData] = await Promise.all([
        tx.organization.findFirst({
          where: { id: organizationId },
          select: {
            status: true,
            subscription: {
              select: { planId: true, tier: true, plan: { select: { key: true } } },
            },
          },
        }),
        tx.featureAssignment.findMany({
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: { featureKey: true, enabled: true, config: true },
        }),
        tx.organizationLimit.findMany({ select: { metric: true, limitValue: true } }),
      ])
      return { org: orgRow, assignments: assignmentRows, limitRows: limitData }
    },
    { organizationId },
  )

  const status = org?.status ?? 'SUSPENDED'
  const planKey = org?.subscription?.plan?.key ?? null

  // Start from the plan's feature bundle.
  const enabled = new Set<string>()
  const config = new Map<string, Record<string, unknown>>()

  if (planKey !== null) {
    const plan = findPlan(planKey)
    if (plan) for (const featureId of plan.featureIds) enabled.add(featureId)
  }

  // Apply explicit assignments. An enabled grant adds; a disabled assignment
  // removes even if the plan included it.
  for (const assignment of assignments) {
    if (assignment.enabled) {
      enabled.add(assignment.featureKey)
      if (assignment.config && typeof assignment.config === 'object') {
        config.set(assignment.featureKey, assignment.config as Record<string, unknown>)
      }
    } else {
      enabled.delete(assignment.featureKey)
    }
  }

  // Ensure every enabled feature has its dependencies. This is defence in depth:
  // the assignment service already resolves closures on write, but a plan edit or
  // a manual DB change could leave a gap, and a feature missing a dependency is a
  // runtime error waiting to happen.
  const { resolved } = resolveDependencies([...enabled])
  const features = new Set(resolved)

  // Limits: start from plan defaults, override with per-org rows.
  const limits = new Map<string, number>()
  if (planKey !== null) {
    const plan = findPlan(planKey)
    if (plan) for (const [metric, value] of Object.entries(plan.limits)) limits.set(metric, value)
  }
  for (const row of limitRows) limits.set(row.metric, row.limitValue)

  return {
    organizationId,
    status,
    planKey,
    features,
    limits,
    featureConfig: config,
    resolvedAt: new Date().toISOString(),
  }
}

/** Whether a snapshot grants a feature. */
export function hasFeature(snapshot: EntitlementSnapshot, featureId: string): boolean {
  return snapshot.features.has(featureId)
}

/**
 * Whether adding `amount` to the current usage of `metric` stays within the org's
 * limit. Unlimited (-1) always passes. An unknown metric passes — a limit that was
 * never defined is not a limit.
 */
export function withinLimit(
  snapshot: EntitlementSnapshot,
  metric: string,
  currentUsage: number,
  amount = 1,
): boolean {
  const limit = snapshot.limits.get(metric)
  if (limit === undefined) return true
  if (isUnlimited(limit)) return true
  return currentUsage + amount <= limit
}

/** The set of limit metrics that apply to this org, for a usage dashboard. */
export function applicableLimits(snapshot: EntitlementSnapshot): readonly string[] {
  return LIMITS.filter(
    (limit) => limit.feature === null || snapshot.features.has(limit.feature),
  ).map((limit) => limit.id)
}
