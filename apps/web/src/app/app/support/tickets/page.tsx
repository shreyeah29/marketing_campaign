'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

const STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const
type Status = (typeof STATUSES)[number]
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
type Priority = (typeof PRIORITIES)[number]

interface TicketListItem {
  id: string
  subject: string
  status: Status
  priority: Priority
  assigneeId: string | null
  requesterEmail: string | null
  createdAt: string
  commentCount: number
}

interface TicketComment {
  id: string
  ticketId: string
  authorId: string | null
  body: string
  internal: boolean
  createdAt: string
}

interface TicketDetail {
  id: string
  subject: string
  body: string
  status: Status
  priority: Priority
  requesterId: string | null
  requesterEmail: string | null
  assigneeId: string | null
  contactId: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  comments: TicketComment[]
}

interface Summary {
  open: number
  pending: number
  resolved: number
  closed: number
  total: number
}

const STATUS_TINT: Record<Status, string> = {
  OPEN: 'info',
  PENDING: 'warn',
  RESOLVED: 'ok',
  CLOSED: 'danger',
}

const PRIORITY_TINT: Record<Priority, string> = {
  LOW: '',
  MEDIUM: 'info',
  HIGH: 'warn',
  URGENT: 'danger',
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'CLOSED', label: 'Closed' },
]

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('ALL')
  const [creating, setCreating] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    const path = filter === 'ALL' ? '/support/tickets' : `/support/tickets?status=${filter}`
    api
      .get<TicketListItem[]>(path)
      .then(setTickets)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load tickets'))
    api
      .get<Summary>('/support/tickets/stats/summary')
      .then(setSummary)
      .catch(() => {})
  }, [filter])
  useEffect(load, [load])

  return (
    <>
      <PageHeader
        title="Support tickets"
        subtitle="Track, prioritise and resolve customer requests"
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New ticket
          </button>
        }
      />

      <div className="cols-4 grid" style={{ gap: 12, marginBottom: 18 }}>
        <StatCard label="Open" value={summary?.open ?? '—'} />
        <StatCard label="Pending" value={summary?.pending ?? '—'} />
        <StatCard label="Resolved" value={summary?.resolved ?? '—'} />
        <StatCard label="Total" value={summary?.total ?? '—'} />
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`tab ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !tickets ? (
        <TableSkeleton cols={5} />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="life-buoy"
          title="No tickets here"
          hint="Open a ticket to start tracking a customer request."
          action={
            <button className="btn primary" onClick={() => setCreating(true)}>
              + New ticket
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th style={{ width: 120 }}>Status</th>
                <th style={{ width: 110 }}>Priority</th>
                <th style={{ width: 90 }}>Comments</th>
                <th style={{ width: 160 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="row-link" onClick={() => setActiveId(t.id)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.subject}</div>
                    {t.requesterEmail ? (
                      <div className="dim" style={{ fontSize: 12 }}>
                        {t.requesterEmail}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Badge status={STATUS_TINT[t.status]}>{t.status}</Badge>
                  </td>
                  <td>
                    <Badge status={PRIORITY_TINT[t.priority]}>{t.priority}</Badge>
                  </td>
                  <td>{t.commentCount}</td>
                  <td className="dim" style={{ fontSize: 12 }}>
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <CreateTicketDrawer
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            load()
            setActiveId(id)
          }}
        />
      ) : null}

      {activeId ? (
        <TicketDrawer ticketId={activeId} onClose={() => setActiveId(null)} onChanged={load} />
      ) : null}
    </>
  )
}

function CreateTicketDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [requesterEmail, setRequesterEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (subject.trim().length === 0 || body.trim().length === 0) return
    setBusy(true)
    try {
      const created = await api.post<TicketDetail>('/support/tickets', {
        subject,
        body,
        priority,
        ...(requesterEmail.trim().length > 0 ? { requesterEmail: requesterEmail.trim() } : {}),
      })
      toast.push('success', 'Ticket created')
      onCreated(created.id)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to create ticket')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      title="New ticket"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || subject.trim().length === 0 || body.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? <Spinner /> : 'Create ticket'}
          </button>
        </>
      }
    >
      <Field label="Subject">
        <input
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary of the request"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="input"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the issue or request in detail…"
        />
      </Field>
      <Field label="Priority">
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Requester email" hint="Optional — who this ticket is on behalf of">
        <input
          className="input"
          value={requesterEmail}
          onChange={(e) => setRequesterEmail(e.target.value)}
          placeholder="customer@example.com"
        />
      </Field>
    </Drawer>
  )
}

function TicketDrawer({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = useCallback(() => {
    setLoadError(null)
    api
      .get<TicketDetail>(`/support/tickets/${ticketId}`)
      .then(setTicket)
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : 'Failed to load ticket'),
      )
  }, [ticketId])
  useEffect(refresh, [refresh])

  async function changeStatus(status: Status) {
    setBusy('status')
    try {
      const updated = await api.patch<TicketDetail>(`/support/tickets/${ticketId}`, { status })
      setTicket(updated)
      toast.push('success', `Status set to ${status}`)
      onChanged()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to update status')
    } finally {
      setBusy(null)
    }
  }

  async function changePriority(priority: Priority) {
    setBusy('priority')
    try {
      const updated = await api.patch<TicketDetail>(`/support/tickets/${ticketId}`, { priority })
      setTicket(updated)
      onChanged()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to update priority')
    } finally {
      setBusy(null)
    }
  }

  async function postComment() {
    if (comment.trim().length === 0) return
    setBusy('comment')
    try {
      await api.post(`/support/tickets/${ticketId}/comments`, { body: comment, internal })
      setComment('')
      setInternal(false)
      refresh()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to add comment')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    try {
      await api.del(`/support/tickets/${ticketId}`)
      toast.push('success', 'Ticket deleted')
      onChanged()
      onClose()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to delete ticket')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer
      open
      title={ticket ? ticket.subject : 'Ticket'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn danger"
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={15} /> Delete
          </button>
        </>
      }
    >
      {loadError ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : !ticket ? (
        <div className="row" style={{ justifyContent: 'center', padding: 24 }}>
          <Spinner />
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Badge status={STATUS_TINT[ticket.status]}>{ticket.status}</Badge>
            <Badge status={PRIORITY_TINT[ticket.priority]}>{ticket.priority}</Badge>
            {ticket.resolvedAt ? (
              <span
                className="dim"
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Icon name="check" size={13} /> Resolved{' '}
                {new Date(ticket.resolvedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          <div
            className="card"
            style={{ padding: 12, marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: 14 }}
          >
            {ticket.body}
          </div>

          <div
            className="cols-2 grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}
          >
            <Field label="Status">
              <select
                className="select"
                value={ticket.status}
                disabled={busy === 'status'}
                onChange={(e) => void changeStatus(e.target.value as Status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className="select"
                value={ticket.priority}
                disabled={busy === 'priority'}
                onChange={(e) => void changePriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="dim" style={{ fontSize: 12, marginBottom: 16 }}>
            {ticket.assigneeId ? `Assigned to ${ticket.assigneeId}` : 'Unassigned'}
            {ticket.requesterEmail ? ` · Requester ${ticket.requesterEmail}` : ''}
          </p>

          <h3 style={{ fontSize: 13, margin: '8px 0' }}>Conversation</h3>
          <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
            {ticket.comments.length === 0 ? (
              <div className="dim" style={{ fontSize: 12 }}>
                No comments yet.
              </div>
            ) : (
              ticket.comments.map((c) => (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    padding: '8px 10px',
                    borderLeft: c.internal ? '3px solid var(--color-warn, #d9822b)' : undefined,
                  }}
                >
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <span className="dim" style={{ fontSize: 11 }}>
                      {c.authorId ?? 'system'} · {new Date(c.createdAt).toLocaleString()}
                    </span>
                    {c.internal ? <Badge status="warn">internal</Badge> : null}
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              ))
            )}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <textarea
              className="input"
              rows={3}
              placeholder="Write a reply…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="spread">
              <label className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                />
                Internal note
              </label>
              <button
                className="btn primary sm"
                disabled={busy === 'comment' || comment.trim().length === 0}
                onClick={() => void postComment()}
              >
                {busy === 'comment' ? <Spinner /> : 'Add comment'}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete ticket?"
        message="This soft-deletes the ticket and removes it from the queue."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          setConfirmDelete(false)
          void remove()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Drawer>
  )
}
