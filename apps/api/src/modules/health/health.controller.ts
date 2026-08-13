import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'

import type { DatabaseClient } from '@marketing-os/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Liveness and readiness.
 *
 * Two endpoints because they answer different questions and an orchestrator acts
 * on them differently:
 *
 *   · **Liveness** — is the process alive? A failure here means restart me.
 *     It must not touch a dependency: if the database is down, restarting the
 *     API does not help, and a liveness probe that fails on a database blip
 *     turns a brief outage into a restart storm.
 *
 *   · **Readiness** — can I serve traffic? A failure means stop routing to me
 *     but do not restart. This one does check dependencies.
 *
 * Conflating them is a common and expensive mistake.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Public()
  @Get()
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) }
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ready'; checks: Record<string, 'ok'> }> {
    try {
      // `SELECT 1` on the application connection. Not a tenant-scoped query —
      // readiness must not depend on a tenant context existing.
      await this.db.$queryRaw`SELECT 1`
    } catch (error) {
      throw new ServiceUnavailableException({
        message: 'Database is unreachable',
        cause: error instanceof Error ? error.message : 'unknown',
      })
    }

    return { status: 'ready', checks: { database: 'ok' } }
  }
}
