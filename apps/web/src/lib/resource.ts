'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, ApiError } from './api'

/** The list envelope returned by every backend list endpoint. */
export interface Page<T> {
  data: T[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ListParams {
  search?: string
  cursor?: string
  limit?: number
  [key: string]: string | number | undefined
}

function qs(params: ListParams): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/**
 * A typed CRUD client for a REST resource at `${base}` (e.g. `/contacts`).
 *
 * Every feature module gets one of these instead of hand-writing fetch calls, so
 * list/create/update/delete/bulk are uniform and typed across the whole product.
 */
export function resource<T extends { id: string }, C = Partial<T>, U = Partial<T>>(base: string) {
  return {
    list: (params: ListParams = {}) => api.get<Page<T>>(`${base}${qs(params)}`),
    get: (id: string) => api.get<T>(`${base}/${id}`),
    create: (body: C) => api.post<T>(base, body),
    update: (id: string, body: U) => api.patch<T>(`${base}/${id}`, body),
    remove: (id: string) => api.del<{ ok: true }>(`${base}/${id}`),
    bulkRemove: (ids: string[]) => api.del<{ ok: true; count: number }>(`${base}`, { ids }),
  }
}

/**
 * List-page state in one hook: rows, loading/error, search (debounced), and
 * "load more" cursor paging. A page component calls this and renders the result —
 * it never re-implements fetching, debouncing, or pagination.
 */
export function useList<T extends { id: string }>(
  base: string,
  extraParams: Record<string, string | number | undefined> = {},
) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Stable key for the extra params so the effect doesn't loop.
  const extraKey = JSON.stringify(extraParams)

  const load = useCallback(
    async (opts: { append?: boolean; cursorValue?: string | null } = {}) => {
      setLoading(true)
      setError(null)
      try {
        const params: ListParams = { limit: 25, ...extraParams }
        if (search) params.search = search
        if (opts.append && opts.cursorValue) params.cursor = opts.cursorValue
        const page = await api.get<Page<T>>(`${base}${qs(params)}`)
        setRows((prev) => (opts.append ? [...prev, ...page.data] : page.data))
        setHasMore(page.hasMore)
        setCursor(page.nextCursor)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setNeedsAuth(true)
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load')
        }
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, search, extraKey],
  )

  // Debounced reload on search / param change.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void load(), search ? 300 : 0)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, extraKey])

  const loadMore = useCallback(() => {
    if (cursor) void load({ append: true, cursorValue: cursor })
  }, [cursor, load])

  const reload = useCallback(() => void load(), [load])

  return useMemo(
    () => ({
      rows,
      loading,
      error,
      search,
      setSearch,
      hasMore,
      loadMore,
      reload,
      needsAuth,
      setRows,
    }),
    [rows, loading, error, search, hasMore, loadMore, reload, needsAuth],
  )
}
