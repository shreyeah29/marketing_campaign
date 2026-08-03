'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip, StatusPill, toStatus } from '@/components/status'

interface BoardLead {
  id: string
  status: string
  source: string | null
  medium: string | null
  score: number
  value: string | null
  tags: string[]
  createdAt: string
  lastContactedAt: string | null
  contact: { name: string; email: string | null; phone: string | null } | null
  campaign: { id: string; name: string } | null
}

/** Brief stages; API NURTURING → Proposal, CONVERTED → Won. */
const STAGES: { id: string; label: string }[] = [
  { id: 'NEW', label: 'New' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'QUALIFIED', label: 'Qualified' },
  { id: 'NURTURING', label: 'Proposal' },
  { id: 'CONVERTED', label: 'Won' },
  { id: 'UNQUALIFIED', label: 'Lost' },
]

const SOURCE_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  FORM: 'Website form',
  EMAIL: 'Email',
  MANUAL: 'Manual',
}

const sourceLabel = (s: string | null): string =>
  s ? (SOURCE_LABELS[s] ?? s.charAt(0) + s.slice(1).toLowerCase()) : 'Unknown'

function scoreTone(score: number): 'jade' | 'slate' {
  if (score > 70) return 'jade'
  return 'slate'
}

/**
 * Leads inbox + pipeline (brief Part 3 §13).
 * Amber reserved for human decisions — mid score band is slate, not amber.
 */
export function LeadsWorkspace({ initialView = 'inbox' }: { initialView?: 'inbox' | 'pipeline' }) {
  const toast = useToast()
  const [view, setView] = useState<'inbox' | 'pipeline'>(initialView)
  const [leads, setLeads] = useState<BoardLead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<BoardLead[]>('/leads/board')
      .then((next) => {
        setLeads((prev) => {
          if (prev) {
            const known = new Set(prev.map((l) => l.id))
            const fresh = next.filter((l) => !known.has(l.id)).map((l) => l.id)
            if (fresh.length) {
              setFlashIds(new Set(fresh))
              window.setTimeout(() => setFlashIds(new Set()), 1600)
            }
          }
          return next
        })
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load leads'))
  }, [])

  useEffect(load, [load])
  useEffect(() => {
    const id = window.setInterval(load, 20_000)
    return () => window.clearInterval(id)
  }, [load])

  const selected = useMemo(
    () => leads?.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  )

  async function moveStage(lead: BoardLead, status: string) {
    setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, status } : l)) ?? null)
    try {
      await api.patch(`/leads/${lead.id}`, { status })
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not move lead')
      load()
    }
  }

  const byStage = useMemo(() => {
    const m = new Map<string, BoardLead[]>()
    for (const s of STAGES) m.set(s.id, [])
    for (const l of leads ?? []) {
      if (!m.has(l.status)) m.set(l.status, [])
      m.get(l.status)!.push(l)
    }
    return m
  }, [leads])

  function stageValue(stageId: string): number {
    return (byStage.get(stageId) ?? []).reduce((s, l) => s + (Number(l.value) || 0), 0)
  }

  return (
    <FadeIn>
      <PageHeader
        title="Leads"
        subtitle="Inbox and pipeline from real board data."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <div className="rq__toggle" role="group" aria-label="View">
              <button
                type="button"
                className={view === 'inbox' ? 'is-active' : ''}
                onClick={() => setView('inbox')}
              >
                Inbox
              </button>
              <button
                type="button"
                className={view === 'pipeline' ? 'is-active' : ''}
                onClick={() => setView('pipeline')}
              >
                Pipeline
              </button>
            </div>
            <button type="button" className="btn primary sm" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={14} /> Add lead
            </button>
          </div>
        }
      />

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {leads === null ? <TableSkeleton rows={8} cols={7} /> : null}

      {leads && leads.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No leads yet"
          hint="Leads arrive from forms, ads, and manual entry."
          action={
            <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
              Add lead
            </button>
          }
        />
      ) : null}

      {leads && leads.length > 0 && view === 'inbox' ? (
        <div className="table-wrap">
          <table className="leads-table table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Campaign</th>
                <th>Channel</th>
                <th>Score</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr
                  key={l.id}
                  className={flashIds.has(l.id) ? 'is-flash' : ''}
                  onClick={() => setSelectedId(l.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{l.contact?.name ?? '—'}</td>
                  <td className="type-caption">{l.contact?.email ?? l.contact?.phone ?? '—'}</td>
                  <td>{l.campaign?.name ?? '—'}</td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <PlatformIcon platform={l.source ?? 'GENERIC'} size={14} />
                      {sourceLabel(l.source)}
                    </span>
                  </td>
                  <td>
                    <ScoreCell score={l.score} />
                  </td>
                  <td>
                    <StatusPill status={toStatus(l.status)} />
                  </td>
                  <td className="type-caption strat-mono">
                    {new Date(l.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {leads && leads.length > 0 && view === 'pipeline' ? (
        <div className="leads-kanban">
          {STAGES.map((stage) => {
            const col = byStage.get(stage.id) ?? []
            const won = stage.id === 'CONVERTED'
            const lost = stage.id === 'UNQUALIFIED'
            return (
              <div
                key={stage.id}
                className={`leads-kanban__col${won ? ' is-won' : ''}${lost ? ' is-lost' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const lead = leads.find((x) => x.id === dragId)
                  setDragId(null)
                  if (lead && lead.status !== stage.id) void moveStage(lead, stage.id)
                }}
              >
                <div className="leads-col__head">
                  <span>{stage.label}</span>
                  <Chip>
                    {col.length} · ₹{stageValue(stage.id).toLocaleString()}
                  </Chip>
                </div>
                <div className="leads-col__body">
                  {col.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`leads-kanban__card${flashIds.has(l.id) ? ' is-flash' : ''}`}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <div className="type-body-strong">{l.contact?.name ?? 'Untitled'}</div>
                      <div className="type-caption">{sourceLabel(l.source)}</div>
                      <ScoreCell score={l.score} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <Drawer
        open={Boolean(selected)}
        title={selected?.contact?.name ?? 'Lead'}
        onClose={() => setSelectedId(null)}
        footer={
          selected ? (
            <select
              className="input"
              value={selected.status}
              onChange={(e) => void moveStage(selected, e.target.value)}
              aria-label="Stage"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : null
        }
      >
        {selected ? (
          <div className="stack" style={{ gap: 14 }}>
            <ScoreCell score={selected.score} />
            <p className="type-body">
              {selected.contact?.email ?? '—'}
              {selected.contact?.phone ? ` · ${selected.contact.phone}` : ''}
            </p>
            <p className="type-caption">
              {sourceLabel(selected.source)}
              {selected.campaign ? ` · ${selected.campaign.name}` : ''}
            </p>
            <p className="type-caption">
              Created {new Date(selected.createdAt).toLocaleString()}
              {selected.lastContactedAt
                ? ` · Last contact ${new Date(selected.lastContactedAt).toLocaleString()}`
                : ''}
            </p>
            {selected.tags.length ? (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {selected.tags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            ) : null}
            <EmptyState
              icon="message-square"
              title="Activity & notes"
              hint="Threaded activity is not on the leads board contract. Stage changes are saved via PATCH."
            />
          </div>
        ) : null}
      </Drawer>

      {addOpen ? (
        <AddLeadDialog
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false)
            load()
          }}
        />
      ) : null}
    </FadeIn>
  )
}

function ScoreCell({ score }: { score: number }) {
  const tone = scoreTone(score)
  return (
    <div className="lead-score" data-tone={tone}>
      <span className="strat-mono">{score}</span>
      <div className="lead-score__bar">
        <span
          className={`lead-score__fill ${tone === 'jade' ? 'is-high' : 'is-mid'}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, display: 'block' }}
        />
      </div>
    </div>
  )
}

function AddLeadDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.post('/leads/manual', {
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      })
      toast.push('success', 'Lead added')
      onDone()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not add lead')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Add lead">
        <div className="head">
          <h3>Add lead</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
          >
            {busy ? <Spinner /> : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
