'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
  type Column,
} from '@/components/kit'
import { Field } from '@/components/ui'

interface ApiKey {
  id: string
  name: string
  prefix?: string | null
  createdAt?: string
  lastUsedAt?: string | null
}

/** The create response — the ONLY time the full secret is ever returned. */
interface CreatedKey {
  id: string
  name: string
  secret: string
}

/**
 * API keys need a bespoke screen, not the generic ResourcePage: the API returns
 * the full secret exactly once, at creation, and it can never be retrieved again.
 * The create flow therefore captures that response and surfaces it in a copy-once
 * dialog. Deletion is a revoke (no bulk-delete route exists), guarded by a confirm.
 */
export default function ApiKeysPage() {
  const toast = useToast()
  const [rows, setRows] = useState<ApiKey[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [revoke, setRevoke] = useState<ApiKey | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<{ data: ApiKey[] } | ApiKey[]>('/api-keys')
      .then((r) => setRows(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load API keys'))
  }, [])
  useEffect(load, [load])

  function openCreate() {
    setName('')
    setFormError(null)
    setCreateOpen(true)
  }

  async function create() {
    if (!name.trim()) {
      setFormError('Key name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await api.post<CreatedKey>('/api-keys', { name: name.trim() })
      setCreateOpen(false)
      setName('')
      setCreated(res) // reveal the one-time secret
      load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function doRevoke(key: ApiKey) {
    try {
      await api.del(`/api-keys/${key.id}`)
      toast.push('success', 'Key revoked')
      setRevoke(null)
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Revoke failed')
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret)
      toast.push('success', 'Secret copied to clipboard')
    } catch {
      toast.push('error', 'Copy failed — select the value and copy manually')
    }
  }

  const columns: Column<ApiKey>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'prefix', header: 'Prefix', render: (r) => <span className="mono">{r.prefix ?? '—'}</span> },
    {
      key: 'lastUsedAt',
      header: 'Last used',
      render: (r) => (r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : 'Never'),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
  ]

  return (
    <>
      <PageHeader
        title="API Keys"
        subtitle="Programmatic access tokens for this organization"
        actions={
          <button className="btn primary" onClick={openCreate}>
            ＋ Create key
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <TableSkeleton cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔑"
          title="No API keys yet"
          hint="Create a key to access the API programmatically. The full secret is shown once at creation."
          action={
            <button className="btn primary" onClick={openCreate}>
              ＋ Create key
            </button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          actions={(r) => (
            <button className="btn ghost sm" onClick={() => setRevoke(r)} aria-label={`Revoke ${r.name}`}>
              Revoke
            </button>
          )}
        />
      )}

      {/* Create drawer */}
      <Drawer
        open={createOpen}
        title="Create API key"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={create} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        {formError ? (
          <div className="banner error" style={{ marginBottom: 14 }}>
            {formError}
          </div>
        ) : null}
        <Field label="Key name *" hint="A label to recognise this key later — e.g. the server or integration using it.">
          <input
            className="input"
            value={name}
            placeholder="e.g. Production server"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
        </Field>
      </Drawer>

      {/* One-time secret reveal */}
      {created ? (
        <>
          <div className="overlay" onClick={() => setCreated(null)} />
          <div className="modal" role="dialog" aria-label="Your new API key">
            <div className="head">
              <h3>Copy your API key</h3>
              <button className="icon-btn" onClick={() => setCreated(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="body">
              <div className="banner info" style={{ marginBottom: 14 }}>
                This is the only time the full secret is shown. Store it somewhere safe — you won&apos;t be
                able to see it again.
              </div>
              <Field label={created.name}>
                <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                  <input
                    className="input mono grow"
                    readOnly
                    value={created.secret}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button className="btn" onClick={() => void copySecret(created.secret)}>
                    Copy
                  </button>
                </div>
              </Field>
            </div>
            <div className="foot">
              <button className="btn primary" onClick={() => setCreated(null)}>
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={revoke !== null}
        title="Revoke API key?"
        message="Any client using this key will immediately lose access. This can't be undone."
        confirmLabel="Revoke"
        danger
        onConfirm={() => revoke && void doRevoke(revoke)}
        onCancel={() => setRevoke(null)}
      />
    </>
  )
}
