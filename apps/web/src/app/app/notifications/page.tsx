'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Badge } from '@/components/ui'

interface Notification {
  id: string
  title?: string | null
  body?: string | null
  message?: string | null
  level?: string | null
  readAt?: string | null
  isRead?: boolean
  createdAt?: string
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  function load() {
    setError(null)
    api
      .get<Notification[] | { data: Notification[] }>('/notifications')
      .then((r) => setRows(Array.isArray(r) ? r : r.data))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }
  useEffect(load, [])

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`)
      load()
    } catch {
      toast.push('error', 'Could not update notification')
    }
  }

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all')
      toast.push('success', 'All notifications marked as read')
      load()
    } catch {
      toast.push('error', 'Could not mark all as read')
    }
  }

  const isRead = (n: Notification) => n.isRead === true || n.readAt != null
  const unread = rows?.some((n) => !isRead(n)) ?? false

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Alerts and activity from across your workspace"
        actions={
          unread ? (
            <button className="btn" onClick={markAllRead}>
              Mark all read
            </button>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows === null ? (
        <TableSkeleton cols={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title="You're all caught up"
          hint="Notifications will appear here."
        />
      ) : (
        <FadeIn delay={0.12} className="stack" style={{ gap: 8 }}>
          {rows.map((n) => (
            <div key={n.id} className="card spread" style={{ opacity: isRead(n) ? 0.6 : 1 }}>
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <strong>{n.title ?? 'Notification'}</strong>
                  {n.level ? <Badge status="info">{n.level}</Badge> : null}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {n.body ?? n.message ?? ''}
                </div>
                <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                </div>
              </div>
              {!isRead(n) ? (
                <button className="btn ghost sm" onClick={() => markRead(n.id)}>
                  Mark read
                </button>
              ) : null}
            </div>
          ))}
        </FadeIn>
      )}
    </>
  )
}
