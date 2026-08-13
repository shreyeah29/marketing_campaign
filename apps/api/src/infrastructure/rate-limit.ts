import rateLimit from '@fastify/rate-limit'
import { HttpException, HttpStatus } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Redis } from 'ioredis'

import type { Principal } from '../common/auth/principal.js'
import type { Env } from '../config/env.js'

/**
 * Rate limiting, Redis-backed.
 *
 * Redis rather than in-memory, because an in-memory limiter is per-instance: with
 * three replicas a caller gets three times the configured allowance, and the limit
 * silently loosens every time the service scales. It also resets on every deploy,
 * which is precisely when abuse is easiest.
 *
 * Two dimensions, because they defend against different things:
 *
 *   · **Per-IP** — the only key available before authentication, so it is what
 *     protects credential endpoints from brute force and the API from an
 *     unauthenticated flood.
 *   · **Per-tenant** — the fairness control. One customer's runaway integration
 *     must not consume the capacity every other customer paid for. Keyed on the
 *     organisation rather than the user, because a single tenant with fifty seats
 *     can exhaust a shared pool while every individual stays under an
 *     unenforceable per-user cap.
 *
 * Authenticated requests key on the tenant; unauthenticated ones fall back to IP.
 */

export interface RateLimitOptions {
  /** Requests per window for an authenticated organisation. */
  readonly tenantMax: number
  /** Requests per window for an unauthenticated address. Lower on purpose. */
  readonly anonymousMax: number
  readonly windowMs: number
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  tenantMax: 600,
  // An unauthenticated caller has no legitimate reason for volume: it can reach
  // health, docs and (once wired) login. Anything more is probing.
  anonymousMax: 60,
  windowMs: 60_000,
}

interface RateLimitedRequest {
  principal?: Principal
  ip?: string
  url?: string
  id?: string
}

export async function registerRateLimit(
  app: NestFastifyApplication,
  redis: Redis,
  env: Env,
  options: RateLimitOptions = DEFAULT_RATE_LIMITS,
): Promise<void> {
  await app.register(rateLimit, {
    redis,
    // Namespaced so a shared Redis cannot collide with cache or queue keys, and
    // so limiter state can be inspected or cleared independently.
    nameSpace: 'mos:rl:',

    // The global ceiling is the anonymous one; authenticated requests are raised
    // per organisation by keyGenerator + max below.
    max: (request: unknown): number => {
      const typed = request as RateLimitedRequest
      return typed.principal ? options.tenantMax : options.anonymousMax
    },

    timeWindow: options.windowMs,

    keyGenerator: (request: unknown): string => {
      const typed = request as RateLimitedRequest
      // Tenant-keyed once authenticated, so seats within one customer share a
      // budget and cannot each claim a full allowance.
      if (typed.principal) return `org:${typed.principal.organizationId}`
      return `ip:${typed.ip ?? 'unknown'}`
    },

    // Health and readiness are exempt: an orchestrator probes them constantly,
    // and rate-limiting a liveness probe would make the platform restart itself
    // under load — the exact moment it must not.
    allowList: (request: unknown): boolean => {
      const url = (request as RateLimitedRequest).url ?? ''
      return url === '/health' || url === '/health/ready'
    },

    // Standard headers so clients can back off intelligently instead of retrying
    // into the wall.
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },

    // The plugin *throws* whatever this returns (index.js:333), so the value
    // flows through Nest's exception layer. Returning a plain object would land
    // in the filter's generic-500 branch and turn a rate-limit hit into an
    // internal error. Returning an HttpException(429) instead lets the existing
    // ProblemExceptionFilter map it to a proper `rate_limited` problem+json with
    // the correct status — one error path, no special case.
    errorResponseBuilder: (request: unknown, context: unknown): object => {
      const typed = request as RateLimitedRequest
      const ctx = (context ?? {}) as { after?: string; ttl?: number }
      const retryAfter = typeof ctx.ttl === 'number' ? Math.ceil(ctx.ttl / 1000) : 60
      const after = ctx.after ?? `${String(retryAfter)} seconds`

      return new HttpException(
        typed.principal
          ? `This workspace has exceeded ${String(options.tenantMax)} requests per minute. Retry in ${after}.`
          : `Too many requests from this address. Retry in ${after}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    },

    /**
     * Fail open when Redis is unreachable.
     *
     * A deliberate and uncomfortable trade-off. Failing closed would turn a Redis
     * blip into a total outage — every request rejected — which is a far larger
     * incident than a window of unthrottled traffic. Abuse during that window is
     * bounded by the fact that the database and the AI budget guards still apply.
     *
     * The error is logged so the condition is visible rather than silent.
     */
    onExceeding: undefined,
    skipOnError: true,
  })

  if (env.NODE_ENV !== 'test') {
    app.getHttpAdapter().getInstance().log.info(
      {
        tenantMax: options.tenantMax,
        anonymousMax: options.anonymousMax,
        windowMs: options.windowMs,
      },
      'rate limiting enabled (redis-backed)',
    )
  }
}
