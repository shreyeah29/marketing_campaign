'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { Drawer, EmptyState, ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

const CHANNELS = ['WEB_CHAT', 'EMAIL', 'WHATSAPP', 'SMS', 'VOICE'] as const
type Channel = (typeof CHANNELS)[number]

interface Conversation {
  id: string
  subject?: string | null
  channel?: string | null
  contactId?: string | null
  lastMessageAt?: string | null
  lastMessagePreview?: string | null
  unreadCount?: number | null
  isOpen?: boolean | null
  createdAt?: string
}

interface Message {
  id: string
  conversationId: string
  direction: 'INBOUND' | 'OUTBOUND'
  status: string
  body?: string | null
  mediaUrls?: string[]
  sentAt?: string | null
  readAt?: string | null
  createdAt: string
}

interface MessagePage {
  data: Message[]
  nextCursor: string | null
}

function unwrap<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : r.data
}

function timeLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

export default function InboxPage() {
  // ── Conversation list ────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Conversation[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [gated, setGated] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // ── Thread ───────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)

  // ── Composer ─────────────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // ── New-conversation drawer ────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newChannel, setNewChannel] = useState<Channel>('WEB_CHAT')
  const [creating, setCreating] = useState(false)

  const toast = useToast()
  const streamRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = streamRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  const loadList = useCallback(() => {
    setListError(null)
    setGated(false)
    api
      .get<Conversation[] | { data: Conversation[] }>('/conversations')
      .then((r) => setRows(unwrap(r)))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) {
          setGated(true)
          setRows([])
          return
        }
        setListError(e instanceof ApiError ? e.message : 'Failed to load')
      })
  }, [])

  useEffect(loadList, [loadList])

  // Load the thread whenever the active conversation changes.
  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    setMessages(null)
    setThreadError(null)
    setNextCursor(null)
    api
      .get<MessagePage>(`/conversations/${activeId}/messages`)
      .then((page) => {
        if (cancelled) return
        // Server returns newest-first; reverse so the thread reads oldest→newest.
        setMessages([...page.data].reverse())
        setNextCursor(page.nextCursor)
        scrollToBottom()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setThreadError(e instanceof ApiError ? e.message : 'Failed to load messages')
      })
    // Mark read, then refresh the list so the unread badge clears.
    api
      .post<{ ok: true }>(`/conversations/${activeId}/read`)
      .then(() => {
        if (!cancelled) loadList()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeId, loadList, scrollToBottom])

  async function loadOlder() {
    if (!activeId || !nextCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await api.get<MessagePage>(
        `/conversations/${activeId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      )
      // Older rows arrive newest-first; reverse and prepend so they sit above.
      setMessages((prev) => [...[...page.data].reverse(), ...(prev ?? [])])
      setNextCursor(page.nextCursor)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to load older messages')
    } finally {
      setLoadingOlder(false)
    }
  }

  async function send() {
    const body = input.trim()
    if (!body || sending || !activeId) return
    setSending(true)
    try {
      const msg = await api.post<Message>(`/conversations/${activeId}/messages`, { body })
      setMessages((prev) => [...(prev ?? []), msg])
      setInput('')
      // Reflect the new preview/time in the list without a full reload.
      setRows((prev) =>
        prev
          ? prev.map((c) =>
              c.id === activeId
                ? { ...c, lastMessagePreview: msg.body ?? body, lastMessageAt: msg.createdAt }
                : c,
            )
          : prev,
      )
      scrollToBottom()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  async function createConversation() {
    if (creating) return
    setCreating(true)
    try {
      const created = await api.post<Conversation>('/conversations', {
        subject: newSubject.trim() || undefined,
        channel: newChannel,
      })
      setDrawerOpen(false)
      setNewSubject('')
      setNewChannel('WEB_CHAT')
      setRows((prev) => [created, ...(prev ?? [])])
      setActiveId(created.id)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not create conversation')
    } finally {
      setCreating(false)
    }
  }

  const active = rows?.find((c) => c.id === activeId) ?? null

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Unified conversations across channels"
        actions={
          !gated ? (
            <button className="btn primary sm" onClick={() => setDrawerOpen(true)}>
              <Icon name="plus" size={15} /> New
            </button>
          ) : undefined
        }
      />

      {gated ? (
        <EmptyState
          icon="inbox"
          title="Inbox isn't enabled yet"
          hint="Connect a messaging channel to receive and reply to conversations from email, WhatsApp and live chat in one place."
        />
      ) : listError ? (
        <ErrorState message={listError} onRetry={loadList} />
      ) : rows === null ? (
        <TableSkeleton cols={2} />
      ) : (
        <div
          className="grid split"
          style={{
            gridTemplateColumns: '300px 1fr',
            gap: 0,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            minHeight: 480,
          }}
        >
          {/* ── Left: conversation list ─────────────────────────────────────── */}
          <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', maxHeight: 640 }}>
            {rows.length === 0 ? (
              <div style={{ padding: 20 }}>
                <EmptyState
                  icon="message-square"
                  title="No conversations yet"
                  hint="Start one with New, or wait for a channel to deliver a message."
                />
              </div>
            ) : (
              rows.map((c) => {
                const unread = c.unreadCount ?? 0
                return (
                  <button
                    key={c.id}
                    className={`nav-item ${activeId === c.id ? 'active' : ''}`}
                    style={{ width: '100%', borderRadius: 0, textAlign: 'left', padding: '12px 14px' }}
                    onClick={() => setActiveId(c.id)}
                  >
                    <span style={{ width: '100%' }}>
                      <span className="spread" style={{ gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 550 }}>{c.subject || 'Conversation'}</span>
                        {unread > 0 ? <Badge status="info">{unread}</Badge> : null}
                      </span>
                      <span className="dim" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                        {(c.channel ?? 'chat').toLowerCase()} ·{' '}
                        {c.lastMessageAt ? timeLabel(c.lastMessageAt) : 'no messages'}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* ── Right: thread + composer ────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 480, maxHeight: 640 }}>
            {!active ? (
              <div style={{ margin: 'auto', padding: 20 }}>
                <p className="muted">Select a conversation to view its messages.</p>
              </div>
            ) : (
              <>
                <div className="spread" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{active.subject || 'Conversation'}</h3>
                    <span className="dim" style={{ fontSize: 12 }}>{(active.channel ?? 'chat').toLowerCase()}</span>
                  </div>
                  {active.isOpen ? <Badge status="success">Open</Badge> : <Badge>Closed</Badge>}
                </div>

                <div
                  ref={streamRef}
                  className="stack"
                  style={{ flex: 1, overflowY: 'auto', padding: 18, gap: 10 }}
                >
                  {threadError ? (
                    <ErrorState message={threadError} onRetry={() => setActiveId(active.id)} />
                  ) : messages === null ? (
                    <div style={{ margin: 'auto' }}>
                      <Spinner />
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ margin: 'auto' }}>
                      <p className="muted">No messages yet — start the conversation below.</p>
                    </div>
                  ) : (
                    <>
                      {nextCursor ? (
                        <div className="row" style={{ justifyContent: 'center', marginBottom: 4 }}>
                          <button className="btn ghost sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                            {loadingOlder ? 'Loading…' : 'Load older'}
                          </button>
                        </div>
                      ) : null}
                      {messages.map((m) => {
                        const outbound = m.direction === 'OUTBOUND'
                        return (
                          <div
                            key={m.id}
                            style={{
                              alignSelf: outbound ? 'flex-end' : 'flex-start',
                              maxWidth: '78%',
                              padding: '9px 12px',
                              borderRadius: 12,
                              background: outbound
                                ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
                                : 'var(--bg-subtle)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {m.body}
                            </div>
                            <div className="dim" style={{ fontSize: 10.5, marginTop: 4, textAlign: outbound ? 'right' : 'left' }}>
                              {timeLabel(m.createdAt)}
                              {outbound ? ` · ${m.status.toLowerCase()}` : ''}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>

                <div
                  className="composer row"
                  style={{ padding: 12, borderTop: '1px solid var(--border)', gap: 8, alignItems: 'flex-end' }}
                >
                  <textarea
                    className="input grow"
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    disabled={sending}
                  />
                  <button
                    className="btn primary"
                    onClick={() => void send()}
                    disabled={sending || !input.trim()}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        title="New conversation"
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void createConversation()} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Subject" hint="Optional — a short label for the thread.">
            <input
              className="input"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="e.g. Order question"
            />
          </Field>
          <Field label="Channel">
            <select
              className="input"
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value as Channel)}
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Drawer>
    </>
  )
}
