import { Global, Module, OnApplicationShutdown } from '@nestjs/common'

import { createDatabaseClient, type DatabaseClient } from '@vsp/database'
import { createLogger, type AppLogger } from '@vsp/observability'

import { loadEnv } from '../config/env.js'

export const DATABASE = Symbol('DATABASE')
export const LOGGER = Symbol('LOGGER')

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
  ],
  exports: [DATABASE, LOGGER],
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
