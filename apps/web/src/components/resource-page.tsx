'use client'

import { useState, type ReactNode } from 'react'

import { ApiError, api } from '@/lib/api'
import { useList } from '@/lib/resource'
import {
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  TableSkeleton,
  useToast,
  type Column,
} from '@/components/kit'
import { Field } from '@/components/ui'
import { Icon } from '@/components/icon'

/** A form field descriptor — the create/edit drawer is generated from these. */
export interface FormField {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'tags'
  required?: boolean
  placeholder?: string
  hint?: string
  /**
   * Select options — a static list, or a function of the current form values for
   * dependent dropdowns (e.g. stages that depend on the chosen pipeline).
   */
  options?:
    | { value: string; label: string }[]
    | ((form: Record<string, unknown>) => { value: string; label: string }[])
  /** When this field changes, clear these other fields (dependent selects). */
  resetOnChange?: string[]
}

export interface ResourcePageProps<T extends { id: string }> {
  title: string
  subtitle?: string
  /** API base path, e.g. "/contacts". */
  base: string
  columns: Column<T>[]
  /** Fields rendered in the create/edit drawer. Omit to make the resource read-only. */
  fields?: FormField[]
  /** Map a row to the form values for editing. Defaults to the row itself. */
  toForm?: (row: T) => Record<string, unknown>
  /** Map form values to the create/update body. Defaults to identity. */
  toBody?: (form: Record<string, unknown>) => Record<string, unknown>
  searchable?: boolean
  createLabel?: string
  emptyIcon?: string
  emptyTitle?: string
  emptyHint?: string
  /** Extra query params (filters). */
  params?: Record<string, string | number | undefined>
  /** Extra content above the table (filters, tabs). */
  toolbarExtra?: ReactNode
  /** Called after any successful create/update/delete. */
  onChanged?: () => void
  readOnly?: boolean
}

/**
 * A complete CRUD screen from configuration.
 *
 * List + search + cursor "load more" + create/edit drawer + delete confirm +
 * bulk delete + loading/empty/error states + toasts — all handled here, so a
 * feature page is a column list and a field list, not a re-implementation of the
 * same table for the twentieth time.
 */
export function ResourcePage<T extends { id: string }>({
  title,
  subtitle,
  base,
  columns,
  fields,
  toForm,
  toBody,
  searchable = true,
  createLabel = 'New',
  emptyIcon = 'file-text',
  emptyTitle = 'Nothing here yet',
  emptyHint,
  params,
  toolbarExtra,
  onChanged,
  readOnly,
}: ResourcePageProps<T>) {
  const list = useList<T>(base, params ?? {})
  const toast = useToast()

  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit'; row?: T } | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<T | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const editable = !readOnly && fields && fields.length > 0

  function openCreate() {
    setForm({})
    setFormError(null)
    setDrawer({ mode: 'create' })
  }
  function openEdit(row: T) {
    setForm(toForm ? toForm(row) : (row as unknown as Record<string, unknown>))
    setFormError(null)
    setDrawer({ mode: 'edit', row })
  }

  async function save() {
    if (!fields) return
    for (const f of fields) {
      if (f.required && !form[f.name]) {
        setFormError(`${f.label} is required`)
        return
      }
    }
    setSaving(true)
    setFormError(null)
    const body = toBody ? toBody(form) : form
    try {
      if (drawer?.mode === 'edit' && drawer.row) {
        await api.patch(`${base}/${drawer.row.id}`, body)
        toast.push('success', `${title.replace(/s$/, '')} updated`)
      } else {
        await api.post(base, body)
        toast.push('success', `${title.replace(/s$/, '')} created`)
      }
      setDrawer(null)
      list.reload()
      onChanged?.()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(row: T) {
    try {
      await api.del(`${base}/${row.id}`)
      toast.push('success', `${title.replace(/s$/, '')} deleted`)
      setConfirm(null)
      list.reload()
      onChanged?.()
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Delete failed')
    }
  }

  async function bulkDelete() {
    try {
      await api.del(base, { ids: [...selected] })
      toast.push('success', `${selected.size} deleted`)
      setSelected(new Set())
      list.reload()
      onChanged?.()
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Bulk delete failed')
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          editable ? (
            <button className="btn primary" onClick={openCreate}>
              <Icon name="plus" size={15} /> {createLabel}
            </button>
          ) : undefined
        }
      />

      {(searchable || toolbarExtra || selected.size > 0) && (
        <div className="toolbar">
          {searchable ? <SearchInput value={list.search} onChange={list.setSearch} /> : null}
          {toolbarExtra}
          <div className="grow" />
          {selected.size > 0 && editable ? (
            <button className="btn danger sm" onClick={bulkDelete}>
              Delete {selected.size}
            </button>
          ) : null}
        </div>
      )}

      {list.needsAuth ? (
        <ErrorState message="Your session expired. Please sign in again." />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading && list.rows.length === 0 ? (
        <TableSkeleton cols={columns.length} />
      ) : list.rows.length === 0 ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          hint={emptyHint}
          action={
            editable ? (
              <button className="btn primary" onClick={openCreate}>
                <Icon name="plus" size={15} /> {createLabel}
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={list.rows}
            selectable={editable}
            selected={selected}
            onSelectionChange={setSelected}
            onRowClick={editable ? openEdit : undefined}
            actions={
              editable
                ? (row) => (
                    <button
                      className="btn ghost sm"
                      onClick={() => setConfirm(row)}
                      aria-label="Delete"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )
                : undefined
            }
          />
          {list.hasMore ? (
            <div className="pagination">
              <button className="btn sm" onClick={list.loadMore} disabled={list.loading}>
                {list.loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* Create / edit drawer */}
      <Drawer
        open={drawer !== null}
        title={
          drawer?.mode === 'edit'
            ? `Edit ${title.replace(/s$/, '')}`
            : `New ${title.replace(/s$/, '')}`
        }
        onClose={() => setDrawer(null)}
        footer={
          <>
            <button className="btn" onClick={() => setDrawer(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {formError ? (
          <div className="banner error" style={{ marginBottom: 14 }}>
            {formError}
          </div>
        ) : null}
        {(fields ?? []).map((f) => {
          const selectOptions =
            typeof f.options === 'function' ? f.options(form) : (f.options ?? [])
          const applySelect = (value: string): void =>
            setForm({
              ...form,
              [f.name]: value,
              ...(f.resetOnChange ? Object.fromEntries(f.resetOnChange.map((k) => [k, ''])) : {}),
            })
          return (
            <Field key={f.name} label={f.label + (f.required ? ' *' : '')} hint={f.hint}>
              {f.type === 'textarea' ? (
                <textarea
                  className="input"
                  rows={4}
                  value={String(form[f.name] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              ) : f.type === 'select' ? (
                <select
                  className="select"
                  value={String(form[f.name] ?? '')}
                  onChange={(e) => applySelect(e.target.value)}
                >
                  <option value="">{f.placeholder ?? 'Select…'}</option>
                  {selectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <label className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form[f.name])}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })}
                  />
                  <span className="muted">{f.placeholder ?? f.label}</span>
                </label>
              ) : f.type === 'tags' ? (
                <input
                  className="input"
                  value={
                    Array.isArray(form[f.name])
                      ? (form[f.name] as string[]).join(', ')
                      : String(form[f.name] ?? '')
                  }
                  placeholder="comma, separated, tags"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [f.name]: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              ) : (
                <input
                  className="input"
                  type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'}
                  value={String(form[f.name] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [f.name]: f.type === 'number' ? e.target.valueAsNumber : e.target.value,
                    })
                  }
                />
              )}
            </Field>
          )
        })}
      </Drawer>

      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${title.replace(/s$/, '')}?`}
        message="This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirm && doDelete(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
