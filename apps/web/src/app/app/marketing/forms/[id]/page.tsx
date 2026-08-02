'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, StatCard, Tabs, TableSkeleton, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { StatusPill, toStatus } from '@/components/status'

type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

interface FormField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

interface LeadForm {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  submitCount: number
  fields: FormField[]
  headline?: string | null
  description?: string | null
  submitLabel?: string | null
  successMessage?: string | null
  redirectUrl?: string | null
  accentColor?: string | null
}

interface Submission {
  id: string
  data: Record<string, unknown>
  createdAt: string
  leadId: string | null
}

interface Stats {
  submitCount: number
  last7Days: number
  conversionNote: string
}

const FIELD_TYPES: FieldType[] = ['text', 'email', 'tel', 'textarea', 'select']

function slugKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${Math.random().toString(36).slice(2, 6)}`
  )
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const toast = useToast()
  const [tab, setTab] = useState('builder')
  const [form, setForm] = useState<LeadForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<LeadForm>(`/lead-forms/${id}`)
      .then((f) => setForm({ ...f, fields: Array.isArray(f.fields) ? f.fields : [] }))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [id])
  useEffect(load, [load])

  function publicUrl(slug: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/f/${slug}`
  }

  async function togglePublish() {
    if (!form) return
    const action = form.status === 'PUBLISHED' ? 'unpublish' : 'publish'
    try {
      await api.post(`/lead-forms/${id}/${action}`, {})
      toast.push('success', action === 'publish' ? 'Form published' : 'Form unpublished')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Action failed')
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!form) return <TableSkeleton cols={3} />

  return (
    <>
      <PageHeader
        title={form.name}
        subtitle={form.status === 'PUBLISHED' ? publicUrl(form.slug) : 'Draft — not yet public'}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <StatusPill status={toStatus(form.status)} />
            <button className="btn primary" onClick={() => void togglePublish()}>
              {form.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'builder', label: 'Builder' },
          { id: 'submissions', label: 'Submissions' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'builder' ? (
        <BuilderTab form={form} setForm={setForm} onSaved={load} />
      ) : (
        <SubmissionsTab formId={id} />
      )}
    </>
  )
}

function BuilderTab({
  form,
  setForm,
  onSaved,
}: {
  form: LeadForm
  setForm: (f: LeadForm) => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  function set<K extends keyof LeadForm>(key: K, value: LeadForm[K]) {
    setForm({ ...form, [key]: value })
  }

  function updateField(index: number, patch: Partial<FormField>) {
    const fields = form.fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
    set('fields', fields)
  }

  function addField() {
    const label = `Field ${form.fields.length + 1}`
    set('fields', [...form.fields, { key: slugKey(label), label, type: 'text', required: false }])
  }

  function removeField(index: number) {
    set(
      'fields',
      form.fields.filter((_, i) => i !== index),
    )
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= form.fields.length) return
    const fields = [...form.fields]
    const a = fields[index]
    const b = fields[target]
    if (!a || !b) return
    fields[index] = b
    fields[target] = a
    set('fields', fields)
  }

  async function save() {
    // Normalise field keys before saving: every field needs a non-empty key
    // (derived from its label when blank) and keys must be unique, or two fields
    // would bind to the same value on the public form and silently overwrite each
    // other in the stored submission.
    if (form.fields.some((f) => !f.label.trim())) {
      toast.push('error', 'Every field needs a label')
      return
    }
    const seen = new Map<string, number>()
    const fields = form.fields.map((f) => {
      let key = slugKey(f.key?.trim() || f.label)
      if (!key) key = 'field'
      const n = seen.get(key) ?? 0
      seen.set(key, n + 1)
      if (n > 0) key = `${key}_${String(n + 1)}`
      return { ...f, key }
    })

    setSaving(true)
    try {
      await api.patch(`/lead-forms/${form.id}`, {
        name: form.name,
        headline: form.headline ?? null,
        description: form.description ?? null,
        submitLabel: form.submitLabel ?? null,
        successMessage: form.successMessage ?? null,
        redirectUrl: form.redirectUrl ?? null,
        accentColor: form.accentColor ?? null,
        fields,
      })
      setForm({ ...form, fields })
      toast.push('success', 'Saved')
      onSaved()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <FadeIn delay={0.12} className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="cols-2 grid">
          <Field label="Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Accent color" hint="Used for the submit button">
            <input
              className="input"
              value={form.accentColor ?? ''}
              placeholder="#4f46e5"
              onChange={(e) => set('accentColor', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Headline">
          <input
            className="input"
            value={form.headline ?? ''}
            onChange={(e) => set('headline', e.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <div className="cols-2 grid">
          <Field label="Submit button label">
            <input
              className="input"
              value={form.submitLabel ?? ''}
              placeholder="Submit"
              onChange={(e) => set('submitLabel', e.target.value)}
            />
          </Field>
          <Field label="Redirect URL" hint="Optional — sent here after submit">
            <input
              className="input"
              value={form.redirectUrl ?? ''}
              placeholder="https://…"
              onChange={(e) => set('redirectUrl', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Success message">
          <input
            className="input"
            value={form.successMessage ?? ''}
            placeholder="Thanks — we'll be in touch!"
            onChange={(e) => set('successMessage', e.target.value)}
          />
        </Field>
      </FadeIn>

      <FadeIn delay={0.18} className="card" style={{ padding: 16 }}>
        <div className="spread" style={{ marginBottom: 10 }}>
          <span style={{ fontWeight: 600 }}>Fields</span>
          <button className="btn sm" onClick={addField}>
            + Add field
          </button>
        </div>

        {form.fields.length === 0 ? (
          <div className="dim" style={{ fontSize: 13 }}>
            No fields yet. Add one to collect data.
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {form.fields.map((f, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="Label">
                    <input
                      className="input"
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="Key">
                    <input
                      className="input"
                      value={f.key}
                      onChange={(e) => updateField(i, { key: e.target.value })}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      className="select"
                      value={f.type}
                      onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="row" style={{ gap: 6, fontSize: 13, paddingBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={f.required ?? false}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <div className="row" style={{ gap: 4, paddingBottom: 4 }}>
                    <button
                      className="btn ghost sm"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    >
                      <Icon name="arrow-up" size={15} />
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => move(i, 1)}
                      disabled={i === form.fields.length - 1}
                      aria-label="Move down"
                    >
                      <Icon name="arrow-down" size={15} />
                    </button>
                    <button
                      className="btn danger sm"
                      onClick={() => removeField(i)}
                      aria-label="Remove"
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                </div>
                {f.type === 'select' ? (
                  <Field label="Options (comma-separated)">
                    <input
                      className="input"
                      value={(f.options ?? []).join(', ')}
                      onChange={(e) =>
                        updateField(i, {
                          options: e.target.value
                            .split(',')
                            .map((o) => o.trim())
                            .filter((o) => o.length > 0),
                        })
                      }
                    />
                  </Field>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </FadeIn>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner /> : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function SubmissionsTab({ formId }: { formId: string }) {
  const [rows, setRows] = useState<Submission[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<Submission[]>(`/lead-forms/${formId}/submissions`)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
    api
      .get<Stats>(`/lead-forms/${formId}/stats`)
      .then(setStats)
      .catch(() => setStats(null))
  }, [formId])
  useEffect(load, [load])

  if (error) return <ErrorState message={error} onRetry={load} />

  const columns = rows ? Array.from(new Set(rows.flatMap((r) => Object.keys(r.data)))) : []

  return (
    <div style={{ marginTop: 16 }}>
      {stats ? (
        <Stagger className="cols-2 grid" interval={0.05} style={{ marginBottom: 16 }}>
          <StaggerItem>
            <StatCard label="Total submissions" value={stats.submitCount} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Last 7 days" value={stats.last7Days} />
          </StaggerItem>
        </Stagger>
      ) : null}

      {!rows ? (
        <TableSkeleton cols={3} />
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div className="dim">No submissions yet.</div>
        </div>
      ) : (
        <FadeIn delay={0.12} className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    style={{
                      textAlign: 'left',
                      padding: 10,
                      borderBottom: '1px solid var(--border, #333)',
                    }}
                  >
                    {c}
                  </th>
                ))}
                <th
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    borderBottom: '1px solid var(--border, #333)',
                  }}
                >
                  Received
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    borderBottom: '1px solid var(--border, #333)',
                  }}
                >
                  Lead
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{ padding: 10, borderBottom: '1px solid var(--border, #222)' }}
                    >
                      {formatValue(r.data[c])}
                    </td>
                  ))}
                  <td
                    className="dim"
                    style={{ padding: 10, borderBottom: '1px solid var(--border, #222)' }}
                  >
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: 10, borderBottom: '1px solid var(--border, #222)' }}>
                    {r.leadId ? (
                      <Link className="btn ghost sm" href="/app/crm/leads">
                        View in Leads
                      </Link>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FadeIn>
      )}
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}
