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
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/* ────────────────────────────────────────────────────────────────────────────
 * Leads — the pipeline board. Every lead arrives from somewhere (an ad, a form,
 * a manual entry), wears its source, and walks the stages from New to Completed.
 * ──────────────────────────────────────────────────────────────────────────── */

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

const STAGES: { id: string; label: string; tint: string }[] = [
  { id: 'NEW', label: 'New', tint: 'info' },
  { id: 'CONTACTED', label: 'Contacted', tint: 'info' },
  { id: 'QUALIFIED', label: 'Qualified', tint: 'ok' },
  { id: 'NURTURING', label: 'Nurturing', tint: 'warn' },
  { id: 'CONVERTED', label: 'Completed', tint: 'ok' },
  { id: 'UNQUALIFIED', label: 'Lost', tint: 'danger' },
]

/** Canonical source labels — anything else renders as its raw value. */
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

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  return `${days}d`
}

export default function LeadsPage() {
  const toast = useToast()
  const [leads, setLeads] = useState<BoardLead[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api
      .get<BoardLead[]>('/leads/board')
      .then(setLeads)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load leads'))
  }, [])
  useEffect(load, [load])

  const sources = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of leads ?? []) {
      const key = l.source ?? 'UNKNOWN'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [leads])

  const visible = useMemo(
    () => (leads ?? []).filter((l) => !sourceFilter || (l.source ?? 'UNKNOWN') === sourceFilter),
    [leads, sourceFilter],
  )

  async function moveStage(lead: BoardLead, status: string) {
    // Optimistic: the card jumps immediately, reverts on failure.
    setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, status } : l)) ?? null)
    try {
      await api.patch(`/leads/${lead.id}`, { status })
    } catch (e) {
      setLeads(
        (prev) => prev?.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l)) ?? null,
      )
      toast.push('error', e instanceof ApiError ? e.message : 'Could not move lead')
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Leads" subtitle="Every lead, from first touch to completed." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  const week = leads?.filter(
    (l) => Date.now() - new Date(l.createdAt).getTime() < 7 * 86_400_000,
  ).length

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Every lead, its source, and its journey from first touch to completed."
        actions={
          <button className="btn primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={15} /> Add lead
          </button>
        }
      />

      {leads === null ? (
        <TableSkeleton rows={5} cols={5} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon="filter"
          title="No leads yet"
          hint="Leads from your ads and forms land here automatically — or add one by hand."
          action={
            <button className="btn primary" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={15} /> Add your first lead
            </button>
          }
        />
      ) : (
        <>
          {/* Insight strip: the numbers + source filters in one line. */}
          <FadeIn className="toolbar" style={{ gap: 8, marginBottom: 18 }}>
            <span className="badge info">{leads.length} total</span>
            <span className="badge ok">{week} this week</span>
            <span className="dim" style={{ margin: '0 6px' }}>
              ·
            </span>
            <button
              className={`chip ${sourceFilter === null ? 'on' : ''}`}
              onClick={() => setSourceFilter(null)}
            >
              All sources
            </button>
            {sources.map(([s, n]) => (
              <button
                key={s}
                className={`chip ${sourceFilter === s ? 'on' : ''}`}
                onClick={() => setSourceFilter(sourceFilter === s ? null : s)}
              >
                {sourceLabel(s)} · {n}
              </button>
            ))}
          </FadeIn>

          {/* The board. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${STAGES.length}, minmax(210px, 1fr))`,
              gap: 12,
              overflowX: 'auto',
              alignItems: 'start',
              paddingBottom: 8,
            }}
          >
            {STAGES.map((stage) => {
              const inStage = visible.filter((l) => l.status === stage.id)
              return (
                <div key={stage.id} style={{ minWidth: 210 }}>
                  <div className="spread" style={{ padding: '0 4px 10px' }}>
                    <span
                      className="row"
                      style={{ gap: 7, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em' }}
                    >
                      {stage.label.toUpperCase()}
                    </span>
                    <span className="badge">{inStage.length}</span>
                  </div>
                  <Stagger className="stack" style={{ gap: 8 }} interval={0.04}>
                    {inStage.map((lead) => (
                      <StaggerItem key={lead.id} className="card" style={{ padding: 12 }}>
                        <div className="spread" style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                            {lead.contact?.name || 'Unknown'}
                          </span>
                          <span className="dim" style={{ fontSize: 11 }}>
                            {ago(lead.createdAt)}
                          </span>
                        </div>
                        {lead.contact?.email ? (
                          <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>
                            {lead.contact.email}
                          </div>
                        ) : null}
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          <Badge status={stage.tint}>{sourceLabel(lead.source)}</Badge>
                          {lead.value ? (
                            <span className="badge">${Number(lead.value).toLocaleString()}</span>
                          ) : null}
                          {lead.campaign ? (
                            <span className="badge" title="Came from this campaign">
                              {lead.campaign.name}
                            </span>
                          ) : null}
                        </div>
                        <select
                          className="select"
                          style={{ padding: '5px 8px', fontSize: 12 }}
                          value={lead.status}
                          onChange={(e) => void moveStage(lead, e.target.value)}
                          aria-label="Move lead to stage"
                        >
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              )
            })}
          </div>
        </>
      )}

      {addOpen ? (
        <AddLeadDrawer
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false)
            load()
            toast.push('success', 'Lead added')
          }}
        />
      ) : null}
    </>
  )
}

// ── Add lead (manual entry) ───────────────────────────────────────────────────

function AddLeadDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('MANUAL')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const v = Number(value)
      await api.post('/leads/manual', {
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        source,
        ...(value && Number.isFinite(v) ? { value: v } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      onCreated()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not add lead')
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      title="Add a lead"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
          >
            {busy ? <Spinner /> : 'Add lead'}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Where did this lead come from?">
        <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="MANUAL">Added manually</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="FACEBOOK">Facebook</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="EMAIL">Email</option>
          <option value="FORM">Website form</option>
        </select>
      </Field>
      <Field label="Estimated value (USD)" hint="Optional — what this lead could be worth.">
        <input
          className="input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
        />
      </Field>
      <Field label="Note">
        <textarea
          className="input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Drawer>
  )
}
