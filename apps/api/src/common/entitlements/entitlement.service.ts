import { Inject, Injectable } from '@nestjs/common'
import type { Redis } from 'ioredis'

import {
  resolveEntitlements,
  withTenant,
  type DatabaseClient,
  type EntitlementSnapshot,
} from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import { DATABASE, LOGGER, REDIS } from '../../infrastructure/database.module.js'

/**
 * Resolves and caches an organisation's entitlements.
 *
 * Every request checks entitlements — subscription status, enabled features,
 * limits — so resolution has to be cheap. It is a small indexed query set, and
 * the result is cached in Redis keyed by the organisation. Without the cache,
 * enforcing the modular design would add a database round trip to every request;
 * with it, the common case is one Redis GET.
 *
 * The cache is invalidated explicitly whenever a platform admin changes an org
 * (plan change, feature toggle, suspend). A short TTL is the backstop for any
 * invalidation that is missed, so a stale entitlement can never persist for long.
 */
@Injectable()
export class EntitlementService {
  // 60s: long enough that a burst of requests from one org shares a resolution,
  // short enough that a missed invalidation self-heals within a minute.
  private static readonly TTL_SECONDS = 60
  private static readonly PREFIX = 'vsp:ent:'

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  private key(organizationId: string): string {
    return `${EntitlementService.PREFIX}${organizationId}`
  }

  /**
   * Returns the org's entitlement snapshot, from cache when warm.
   *
   * A Redis failure is not fatal: the resolver is the source of truth, so a cache
   * miss on error simply resolves fresh. Failing the request because the *cache*
   * is down would turn a Redis blip into an outage, which is a worse trade than a
   * slower request.
   */
  async resolve(organizationId: string): Promise<EntitlementSnapshot> {
    try {
      const cached = await this.redis.get(this.key(organizationId))
      if (cached !== null) {
        return this.deserialize(cached)
      }
    } catch (error) {
      this.logger.warn(
        { err: error, organizationId },
        'entitlement cache read failed; resolving fresh',
      )
    }

    // Open the tenant context explicitly. This resolves during the *guard* phase
    // — before the TenantInterceptor opens the request's context — so the ambient
    // context the Prisma extension needs is not yet present. Opening it here (the
    // organisation is the guard's subject, not attacker-supplied) makes resolution
    // work identically whether called from a guard or from a handler that already
    // has a context; nesting withTenant is safe.
    const snapshot = await withTenant({ organizationId }, () =>
      resolveEntitlements(this.db, organizationId),
    )

    try {
      await this.redis.set(
        this.key(organizationId),
        this.serialize(snapshot),
        'EX',
        EntitlementService.TTL_SECONDS,
      )
    } catch (error) {
      this.logger.warn({ err: error, organizationId }, 'entitlement cache write failed')
    }

    return snapshot
  }

  /**
   * Drops the cached snapshot for an org.
   *
   * Called by the platform plane after any change to an org's plan, features or
   * status, so the next request resolves fresh rather than waiting out the TTL.
   */
  async invalidate(organizationId: string): Promise<void> {
    try {
      await this.redis.del(this.key(organizationId))
    } catch (error) {
      // The TTL still bounds staleness, so a failed invalidation degrades to
      // "stale for up to 60s" rather than "wrong forever".
      this.logger.warn({ err: error, organizationId }, 'entitlement cache invalidation failed')
    }
  }

  // Sets serialise as arrays and Maps as entry lists; JSON cannot represent
  // either directly, so they are rebuilt on read.
  private serialize(snapshot: EntitlementSnapshot): string {
    return JSON.stringify({
      organizationId: snapshot.organizationId,
      status: snapshot.status,
      planKey: snapshot.planKey,
      features: [...snapshot.features],
      limits: [...snapshot.limits.entries()],
      featureConfig: [...snapshot.featureConfig.entries()],
      resolvedAt: snapshot.resolvedAt,
    })
  }

  private deserialize(raw: string): EntitlementSnapshot {
    const parsed = JSON.parse(raw) as {
      organizationId: string
      status: EntitlementSnapshot['status']
      planKey: string | null
      features: string[]
      limits: [string, number][]
      featureConfig: [string, Record<string, unknown>][]
      resolvedAt: string
    }
    return {
      organizationId: parsed.organizationId,
      status: parsed.status,
      planKey: parsed.planKey,
      features: new Set(parsed.features),
      limits: new Map(parsed.limits),
      featureConfig: new Map(parsed.featureConfig),
      resolvedAt: parsed.resolvedAt,
    }
  }
}
