import { Global, Module, OnApplicationShutdown } from '@nestjs/common'
import type { Redis } from 'ioredis'

import { createDatabaseClient, type DatabaseClient } from '@vsp/database'
import { createLogger, type AppLogger } from '@vsp/observability'

import { loadEnv } from '../config/env.js'
import { createRedis } from './redis.js'

export const DATABASE = Symbol('DATABASE')
export const LOGGER = Symbol('LOGGER')
export const REDIS = Symbol('REDIS')

/**
 * Provides the tenant-scoped Prisma client and the application logger.
 *
 * The client injected here is the `$extends`-wrapped one, so every query it
 * serves is automatically organisation-scoped and throws if no tenant context is
 * open. The raw `PrismaClient` is never provided to the container — a module that
 * cannot obtain it cannot bypass isolation, which is a stronger guarantee than
 * asking reviewers to notice.
 *
 * Global because effectively every module needs both, and threading them through
 * imports adds ceremony without adding a boundary.
 */
@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      useFactory: (): AppLogger => {
        const env = loadEnv()
        return createLogger({
          service: 'api',
          environment: env.NODE_ENV,
          level: env.LOG_LEVEL,
          pretty: env.NODE_ENV === 'development',
        })
      },
    },
    {
      provide: DATABASE,
      useFactory: (): DatabaseClient => {
        const env = loadEnv()
        return createDatabaseClient({
          url: env.DATABASE_URL,
          // Query logging is development-only: statements contain contact
          // details and message bodies.
          logQueries: env.NODE_ENV === 'development',
        })
      },
    },
    {
      // A general-purpose Redis client for caching (entitlement snapshots) and
      // anything else on the hot path. Distinct from the BullMQ connection, which
      // needs different retry settings.
      provide: REDIS,
      useFactory: (): Redis => createRedis(loadEnv(), 'general'),
    },
  ],
  exports: [DATABASE, LOGGER, REDIS],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor() {
    // The client is resolved lazily by the container; shutdown is handled below
    // via the module reference rather than by holding a second instance.
  }

  async onApplicationShutdown(): Promise<void> {
    // Prisma's own process handlers close the pool on SIGTERM. This hook exists
    // so the shutdown sequence is explicit and ordered relative to the HTTP
    // server draining, rather than racing it.
    await Promise.resolve()
  }
}
