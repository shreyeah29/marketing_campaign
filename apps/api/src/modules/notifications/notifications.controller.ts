import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import type { Paginated } from '@vsp/contracts'
import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Notifications — the in-app alert feed for the organisation.
 *
 * The Notification model has no `deletedAt`; read state is recorded with `readAt`,
 * so marking one read stamps that column rather than removing the row. Any member
 * with org read may see and dismiss notifications — there is no feature gate.
 */
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'List notifications, newest first' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.notification.findMany({
        where: { ...keysetWhere(cursor) },
        orderBy: KEYSET_ORDER,
        take: limit + 1,
      }),
    )
    return toPage(rows, limit, (n) => ({
      id: n.id,
      level: n.level,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      readAt: n.readAt?.toISOString() ?? null,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    }))
  }

  @Get('unread-count')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Number of unread notifications (for the bell badge)' })
  async unreadCount(): Promise<{ count: number }> {
    const count = await withTenantTransaction(this.db, (tx) =>
      tx.notification.count({ where: { readAt: null } }),
    )
    return { count }
  }

  @Post('read-all')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Mark every notification as read' })
  async readAll(): Promise<{ ok: true; count: number }> {
    const res = await withTenantTransaction(this.db, (tx) =>
      tx.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } }),
    )
    return { ok: true, count: res.count }
  }

  @Patch(':id/read')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.notification.findFirst({ where: { id } })
      if (!existing) throw new NotFoundException(`No notification with id ${id}`)
      if (existing.readAt == null) {
        await tx.notification.updateMany({ where: { id }, data: { readAt: new Date() } })
      }
      return { ok: true }
    })
  }
}
