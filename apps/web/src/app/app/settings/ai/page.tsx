'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'

interface AgentDef {
  id: string
  role: string
  purpose: string
  enabled: boolean
}

export default function AiSettingsPage() {
  const toast = useToast()
  const [agents, setAgents] = useState<AgentDef[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAgents(await api.get<AgentDef[]>('/config/agents'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(agent: AgentDef) {
    const next = !agent.enabled
    setBusy(agent.id)
    // Optimistic flip; reverted on error.
    setAgents((prev) => prev?.map((a) => (a.id === agent.id ? { ...a, enabled: next } : a)) ?? prev)
    try {
      await api.put('/config/agents', { agentKey: agent.id, enabled: next })
      toast.push('success', `${agent.role} ${next ? 'enabled' : 'disabled'}`)
    } catch (err) {
      setAgents(
        (prev) =>
          prev?.map((a) => (a.id === agent.id ? { ...a, enabled: agent.enabled } : a)) ?? prev,
      )
      toast.push('error', err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle="Choose which specialist AI assistants appear in your workspace. AI is built in — no keys or setup required."
      />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !agents || agents.length === 0 ? (
        <EmptyState icon="bot" title="No agents available" />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {agents.map((a) => (
            <div key={a.id} className="card spread" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{a.role}</div>
                <div className="dim" style={{ fontSize: 13 }}>
                  {a.purpose}
                </div>
              </div>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={a.enabled}
                  disabled={busy === a.id}
                  onChange={() => void toggle(a)}
                />
                <span className="muted">{a.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
