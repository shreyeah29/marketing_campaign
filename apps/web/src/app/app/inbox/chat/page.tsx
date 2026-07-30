'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/kit'
import { Badge } from '@/components/ui'

interface Conversation {
  id: string
  subject?: string | null
  channel?: string | null
  status?: string | null
  lastMessageAt?: string | null
  createdAt?: string
}

export default function InboxPage() {
  const [rows, setRows] = useState<Conversation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Conversation | null>(null)

  function load() {
    setError(null)
    api
      .get<Conversation[] | { data: Conversation[] }>('/conversations')
      .then((r) => {
        const list = Array.isArray(r) ? r : r.data
        setRows(list)
        setActive(list[0] ?? null)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }
  useEffect(load, [])

  return (
    <>
      <PageHeader title="Inbox" subtitle="Unified conversations across channels" />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows === null ? (
        <TableSkeleton cols={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No conversations yet"
          hint="Messages from your connected channels (email, WhatsApp, live chat) land here."
        />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '300px 1fr', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', minHeight: 420 }}>
          <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            {rows.map((c) => (
              <button
                key={c.id}
                className={`nav-item ${active?.id === c.id ? 'active' : ''}`}
                style={{ width: '100%', borderRadius: 0, textAlign: 'left', padding: '12px 14px' }}
                onClick={() => setActive(c)}
              >
                <span>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{c.subject ?? 'Conversation'}</div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {c.channel ?? 'chat'} · {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : ''}
                  </div>
                </span>
              </button>
            ))}
          </div>
          <div style={{ padding: 20 }}>
            {active ? (
              <>
                <div className="spread" style={{ marginBottom: 12 }}>
                  <h3>{active.subject ?? 'Conversation'}</h3>
                  {active.status ? <Badge status="info">{active.status}</Badge> : null}
                </div>
                <p className="muted">
                  Channel: {active.channel ?? 'chat'}. Message history renders here once channel providers are
                  connected in Settings → Providers.
                </p>
              </>
            ) : (
              <p className="muted">Select a conversation.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
