import { createHash, randomBytes } from 'node:crypto'

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Paginated } from '@marketing-os/contracts'
import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { KEYSET_ORDER, keysetWhere, parseKeyset, toPage } from '../../common/http/pagination.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const createKeySchema = z.object({ name: z.string().min(1).max(200) }).strict()

/**
 * API keys — programmatic access tokens for an organisation.
 *
 * The stored secret is a one-way hash: this controller keeps things intentionally
 * simple (name + a generated public prefix), and never returns a usable key from a
 * list. The ApiKey model has no `deletedAt`; revocation is recorded with
 * `revokedAt`, and the list only shows keys that are still live.
 */
@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeysController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'List active API keys, newest first' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = parseKeyset(query)
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.apiKey.findMany({
        where: { revokedAt: null, ...keysetWhere(cursor) },
        orderBy: KEYSET_ORDER,
        take: limit + 1,
      }),
    )
    return toPage(rows, limit, (k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }))
  }

  @Post()
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: 'Create an API key' })
  async create(@Body() body: unknown, @CurrentPrincipal() principal: Principal): Promise<unknown> {
    const input = zodBody(createKeySchema, body)

    // Public prefix is safe to store and show; the secret is hashed and never
    // persisted in the clear. This keeps the shape correct without implementing a
    // full key-issuance flow.
    const prefix = `vsk_${randomBytes(6).toString('hex')}`
    const secret = randomBytes(24).toString('base64url')
    const keyHash = createHash('sha256').update(`${prefix}.${secret}`).digest('hex')

    return withTenantTransaction(this.db, async (tx) => {
      const key = await tx.apiKey.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name,
          prefix,
          keyHash,
          scopes: [],
          createdById: principal.id,
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'api_key.created',
          resourceType: 'api_key',
          resourceId: key.id,
          after: { name: key.name, prefix: key.prefix },
        },
      })

      return {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        createdAt: key.createdAt.toISOString(),
        // Shown once, immediately after creation. Not retrievable later.
        secret: `${prefix}.${secret}`,
      }
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: 'Revoke an API key' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.apiKey.findFirst({ where: { id, revokedAt: null } })
      if (!existing) throw new NotFoundException(`No API key with id ${id}`)

      await tx.apiKey.updateMany({ where: { id }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'api_key.revoked',
          resourceType: 'api_key',
          resourceId: id,
        },
      })
      return { ok: true }
    })
  }
}
