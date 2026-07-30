import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { buildPage, decodeCursor, type Paginated } from '@vsp/contracts'
import { withTenantTransaction, type DatabaseClient, type TenantTransactionClient } from '@vsp/database'

import type { Principal } from '../auth/principal.js'

/**
 * Generic tenant-scoped CRUD, so a resource controller is configuration rather
 * than a re-implementation of the same list/create/update/delete for every model.
 *
 * It preserves the platform's invariants exactly as the hand-written reference
 * (contacts) does: every operation runs inside `withTenantTransaction` (so the RLS
 * SQL variable is set and the Prisma extension injects the tenant), soft-deletes
 * when the model has a `deletedAt`, cursor-paginates, and writes an audit row for
 * every mutation. The model is addressed dynamically by name; that single `any`
 * boundary is the price of not writing the same forty lines per resource, and it
 * is confined to this file.
 */

export interface ListOptions {
  search?: string | undefined
  searchFields?: readonly string[]
  where?: Record<string, unknown>
  orderBy?: Record<string, 'asc' | 'desc'>
  cursor?: string | undefined
  limit: number
}

// The Prisma model delegates, addressed by name. Contained to this module.
type AnyDelegate = {
  findMany: (args: unknown) => Promise<Array<{ id: string; createdAt?: Date }>>
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>
  create: (args: unknown) => Promise<Record<string, unknown>>
  update: (args: unknown) => Promise<Record<string, unknown>>
  updateMany: (args: unknown) => Promise<{ count: number }>
  count: (args: unknown) => Promise<number>
}

function delegate(tx: TenantTransactionClient, model: string): AnyDelegate {
  return (tx as unknown as Record<string, AnyDelegate>)[model] as AnyDelegate
}

@Injectable()
export class CrudService {
  constructor(private readonly db: DatabaseClient) {}

  async list<T extends { id: string; createdAt?: Date }>(
    model: string,
    opts: ListOptions,
  ): Promise<Paginated<T>> {
    const position = opts.cursor === undefined ? null : decodeCursor(opts.cursor)
    const search =
      opts.search && opts.searchFields && opts.searchFields.length > 0
        ? {
            OR: opts.searchFields.map((f) => ({ [f]: { contains: opts.search, mode: 'insensitive' } })),
          }
        : {}

    const rows = (await withTenantTransaction(this.db, (tx) =>
      delegate(tx, model).findMany({
        where: {
          deletedAt: null,
          ...(opts.where ?? {}),
          ...search,
          ...(position === null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: new Date(position.value) } },
                  { createdAt: new Date(position.value), id: { lt: position.id } },
                ],
              }),
        },
        orderBy: opts.orderBy ? [opts.orderBy, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
        take: opts.limit + 1,
      }),
    )) as T[]

    return buildPage(rows, opts.limit, (row) => (row.createdAt ?? new Date()).toISOString())
  }

  async get<T>(model: string, id: string): Promise<T> {
    const row = await withTenantTransaction(this.db, (tx) =>
      delegate(tx, model).findFirst({ where: { id, deletedAt: null } }),
    )
    if (!row) throw new NotFoundException(`No ${model} with id ${id}`)
    return row as T
  }

  async create<T>(
    model: string,
    principal: Principal,
    data: Record<string, unknown>,
    action: string,
  ): Promise<T> {
    return withTenantTransaction(this.db, async (tx) => {
      const row = await delegate(tx, model).create({
        data: { ...data, organizationId: principal.organizationId },
      })
      await this.audit(tx, principal, `${action}.created`, model, String(row['id']), { after: data })
      return row as T
    })
  }

  async update<T>(
    model: string,
    principal: Principal,
    id: string,
    data: Record<string, unknown>,
    action: string,
  ): Promise<T> {
    return withTenantTransaction(this.db, async (tx) => {
      const before = await delegate(tx, model).findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No ${model} with id ${id}`)
      // Strip undefined so a partial update never nulls an omitted field.
      const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
      const row = await delegate(tx, model).update({ where: { id }, data: patch })
      await this.audit(tx, principal, `${action}.updated`, model, id, { after: patch })
      return row as T
    })
  }

  async remove(model: string, principal: Principal, id: string, action: string): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const before = await delegate(tx, model).findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No ${model} with id ${id}`)
      // Soft-delete: preserve history and any audit/event references to the row.
      await delegate(tx, model).update({ where: { id }, data: { deletedAt: new Date() } })
      await this.audit(tx, principal, `${action}.deleted`, model, id)
    })
    return { ok: true }
  }

  async bulkRemove(
    model: string,
    principal: Principal,
    ids: string[],
    action: string,
  ): Promise<{ ok: true; count: number }> {
    if (ids.length === 0) throw new BadRequestException('No ids provided')
    if (ids.length > 500) throw new BadRequestException('Too many ids (max 500)')
    const count = await withTenantTransaction(this.db, async (tx) => {
      const res = await delegate(tx, model).updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await this.audit(tx, principal, `${action}.bulk_deleted`, model, ids.join(','), {
        after: { count: res.count },
      })
      return res.count
    })
    return { ok: true, count }
  }

  private async audit(
    tx: TenantTransactionClient,
    principal: Principal,
    action: string,
    resourceType: string,
    resourceId: string,
    change?: { after?: unknown },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: principal.organizationId,
        actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
        userId: principal.type === 'user' ? principal.id : null,
        action,
        resourceType,
        resourceId,
        ...(change?.after === undefined ? {} : { after: change.after as never }),
      },
    })
  }
}
