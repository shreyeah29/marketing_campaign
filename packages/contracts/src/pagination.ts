import { z } from 'zod'

/**
 * Cursor pagination, offered as the only pagination style.
 *
 * Offset pagination is deliberately not supported. `?page=3` re-runs the query
 * and skips rows, so any insert or delete between requests shifts the window: the
 * client silently misses records or sees duplicates. In a product where an agent
 * may be writing rows while a human pages through them, that is not a rare edge
 * case — it is the normal state. Offset also degrades badly, since the database
 * must walk and discard every skipped row.
 *
 * A cursor encodes a position in a stable sort, so results stay consistent under
 * concurrent writes and the query uses an index seek regardless of depth.
 */

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export const cursorPaginationSchema = z.object({
  /** Opaque position from a previous response's `nextCursor`. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type CursorPagination = z.infer<typeof cursorPaginationSchema>

export const sortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof sortDirectionSchema>

/**
 * Standard list envelope.
 *
 * `hasMore` is returned rather than a total count. A count on a large tenant table
 * costs a full scan on every page request for information the UI rarely needs;
 * where a total is genuinely required, an endpoint offers it explicitly.
 */
export interface Paginated<T> {
  readonly data: readonly T[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
}

/**
 * Cursor payload.
 *
 * The sort value is carried alongside the id so the seek predicate can be
 * `(sortValue, id) > (lastSortValue, lastId)` — the id breaks ties, without which
 * rows sharing a timestamp are skipped or repeated at a page boundary.
 */
export interface CursorPayload {
  readonly id: string
  readonly value: string
}

/**
 * Encodes a cursor as base64url.
 *
 * Opaque on purpose. A cursor that looks like `createdAt:2026-07-30` invites
 * clients to construct their own, which then breaks whenever the sort changes.
 * This is encoding for opacity, not security — it is signed by nothing, and the
 * decoded position is only ever used inside an already tenant-scoped query, so a
 * forged cursor can at worst return a different page of the caller's own data.
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const result = z.object({ id: z.string().min(1), value: z.string() }).safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    // A malformed cursor is treated as "start from the beginning" rather than an
    // error: it is almost always a stale bookmark, and failing the request would
    // strand the client with no way to recover but to guess.
    return null
  }
}

/**
 * Builds the list envelope from `limit + 1` rows.
 *
 * Fetching one extra row is how `hasMore` is determined without a second query or
 * a count.
 */
export function buildPage<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
  cursorValue: (row: T) => string,
): Paginated<T> {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const last = data.at(-1)

  return {
    data,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ id: last.id, value: cursorValue(last) }) : null,
  }
}
