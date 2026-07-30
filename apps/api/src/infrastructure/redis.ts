import { Redis } from 'ioredis'

import type { Env } from '../config/env.js'

/**
 * Shared Redis connection factory.
 *
 * Two distinct clients are needed, and mixing them up is a real failure mode:
 *
 *   · **General** — rate limiting, caching, idempotency. Standard retry and
 *     timeout behaviour.
 *   · **BullMQ** — requires `maxRetriesPerRequest: null` and
 *     `enableReadyCheck: false`. BullMQ blocks on `BRPOPLPUSH` for long periods;
 *     with a retry ceiling, ioredis aborts the blocking read and the worker
 *     silently stops consuming while looking perfectly healthy.
 */

export function createRedis(env: Env, purpose: 'general' | 'bullmq'): Redis {
  const common = {
    lazyConnect: false,
    // Cap the reconnect backoff. Left unbounded, a long outage pushes the delay
    // into minutes and the service stays down well after Redis recovers.
    retryStrategy: (attempt: number): number => Math.min(attempt * 200, 5_000),
    reconnectOnError: (error: Error): boolean => {
      // A failover promotes a replica; the old primary answers READONLY until
      // clients reconnect. Reconnecting on this turns a failover into a blip.
      return error.message.includes('READONLY')
    },
  }

  if (purpose === 'bullmq') {
    return new Redis(env.REDIS_URL, {
      ...common,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }

  return new Redis(env.REDIS_URL, {
    ...common,
    maxRetriesPerRequest: 3,
    // Fail fast rather than hanging a request behind a slow Redis. Rate limiting
    // and idempotency are on the hot path; a stalled lookup is worse than a
    // degraded one.
    commandTimeout: 2_000,
  })
}
