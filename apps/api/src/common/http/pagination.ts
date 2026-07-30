import { buildPage, cursorPaginationSchema, decodeCursor, type Paginated } from '@vsp/contracts'

/**
 * Shared cursor-list helper.
 *
 * Every list endpoint needs the same three things: decode the cursor, add the
 * keyset seek predicate on `(createdAt, id)`, and build the envelope from
 * `limit + 1` rows. Repeating that per controller is where the subtle bugs live —
 * an off-by-one in the seek predicate silently skips a row at each page boundary.
 * Centralising it means the seek logic is written and tested once.
 */

export interface KeysetQuery {
  readonly cursor?: string
  readonly limit: number
}

/** Parses `?cursor=&limit=` into a validated keyset query. */
export function parseKeyset(raw: unknown): KeysetQuery {
  const { cursor, limit } = cursorPaginationSchema.parse(raw)
  return cursor === undefined ? { limit } : { cursor, limit }
}

/**
 * Builds the `where` fragment for a descending `(createdAt, id)` keyset.
 *
 * The id tie-breaker is load-bearing: without it, rows sharing a `createdAt`
 * millisecond are dropped or repeated at a page boundary.
 */
export function keysetWhere(cursor: string | undefined): object {
  if (cursor === undefined) return {}
  const position = decodeCursor(cursor)
  if (position === null) return {}
  const at = new Date(position.value)
  return {
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: position.id } }],
  }
}

/** Standard descending order for keyset pagination. */
export const KEYSET_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

/** Builds the response envelope from rows that carry `id` and `createdAt`. */
export function toPage<T extends { id: string; createdAt: Date }>(
  rows: readonly T[],
  limit: number,
  map: (row: T) => unknown,
): Paginated<unknown> {
  const page = buildPage(rows, limit, (row) => row.createdAt.toISOString())
  return { ...page, data: page.data.map(map) }
}
