'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

interface Workflow {
  id: string
  name: string
  status: string
  triggerType: string
  runCount?: number
  successCount?: number
  failureCount?: number
}

const TRIGGERS = [
  { value: 'manual', label: 'Manual (run on demand)' },
  { value: 'asset.approved', label: 'When an asset is approved' },
  { value: 'campaign.approved', label: 'When a campaign is approved' },
  { value: 'lead.created', label: 'When a lead is created' },
  { value: 'lead.assigned', label: 'When a lead is assigned' },
]

export default function WorkflowsPage() {
  const toast = useToast()
  const [rows, setRows] = useState<Workflow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('manual')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api
      .get<{ data: Workflow[] }>('/workflows')
      .then((r) => setRows(r.data))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [])
  useEffect(load, [load])

  async function create() {
    if (name.trim().length < 2) return
    setSaving(true)
    try {
      await api.post('/workflows', { name: name.trim(), triggerType: trigger })
      toast.push('success', 'Workflow created')
      setCreating(false)
      setName('')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Workflows"
        subtitle="Automate your marketing — trigger → conditions → actions, executed by real workers"
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New workflow
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <TableSkeleton cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="settings"
          title="No workflows yet"
          hint="Build an automation: e.g. when an asset is approved → schedule it → notify the team."
          action={
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={15} /> New workflow
            </button>
          }
        />
      ) : (
        <FadeIn delay={0.12} className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Runs</th>
                <th>Success / Fail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="row-link">
                  <td>
                    <Link
                      href={`/app/automation/workflows/${w.id}`}
                      style={{ fontWeight: 600, color: 'var(--color-primary)' }}
                    >
                      {w.name}
                    </Link>
                  </td>
                  <td className="mono dim">{w.triggerType}</td>
                  <td>
                    <Badge
                      status={
                        w.status === 'ACTIVE' ? 'ok' : w.status === 'PAUSED' ? 'warn' : 'info'
                      }
                    >
                      {w.status}
                    </Badge>
                  </td>
                  <td>{w.runCount ?? 0}</td>
                  <td className="dim">
                    {w.successCount ?? 0} / {w.failureCount ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FadeIn>
      )}

      <Drawer
        open={creating}
        title="New workflow"
        onClose={() => setCreating(false)}
        footer={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={create} disabled={saving}>
              {saving ? <Spinner /> : 'Create & build'}
            </button>
          </>
        }
      >
        <Field label="Name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-schedule approved posts"
          />
        </Field>
        <Field label="Trigger" hint="What starts this workflow.">
          <select className="select" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </Drawer>
    </>
  )
}
