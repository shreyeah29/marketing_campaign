'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { Drawer, EmptyState, ErrorState, PageHeader, useToast } from '@/components/kit'
import { Badge, Field, LoadingScreen, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

interface WfNode {
  id: string
  type: 'action' | 'delay' | 'condition'
  label?: string
  action?: string
  config?: Record<string, unknown>
  delayMs?: number
  condition?: { left: string; op: string; right?: unknown }
  next?: string | null
  onTrue?: string | null
  onFalse?: string | null
}
interface Graph {
  start: string
  nodes: WfNode[]
}
interface Wf {
  id: string
  name: string
  status: string
  triggerType: string
}
interface Run {
  id: string
  status: string
  error?: string | null
  durationMs?: number | null
  createdAt: string
}
interface Step {
  id: string
  position: number
  nodeId: string
  status: string
  output?: unknown
  error?: string | null
}

const ACTIONS = [
  { value: 'send_notification', label: 'Send notification', fields: ['title', 'body'] },
  { value: 'create_task', label: 'Create CRM task', fields: ['title', 'description'] },
  { value: 'create_review_task', label: 'Create review task', fields: ['title'] },
  { value: 'send_webhook', label: 'Send webhook', fields: ['url'] },
  { value: 'send_email', label: 'Send email', fields: ['subject', 'body'] },
  { value: 'assign_lead', label: 'Assign lead', fields: ['leadId', 'userId'] },
  { value: 'log', label: 'Log message', fields: ['message'] },
]
const OPS = ['truthy', 'eq', 'ne', 'gt', 'lt', 'contains']

export default function WorkflowBuilderPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const toast = useToast()
  const [wf, setWf] = useState<Wf | null>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [openRun, setOpenRun] = useState<{ run: Run; steps: Step[] } | null>(null)

  const loadGraph = useCallback(() => {
    api
      .get<{ workflow: Wf; graph: Graph }>(`/workflows/${id}/graph`)
      .then((r) => {
        setWf(r.workflow)
        setGraph(r.graph.nodes?.length ? r.graph : { start: '', nodes: [] })
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [id])
  const loadRuns = useCallback(() => {
    api
      .get<{ data: Run[] }>(`/workflows/${id}/runs`)
      .then((r) => setRuns(r.data))
      .catch(() => setRuns([]))
  }, [id])
  useEffect(() => {
    loadGraph()
    loadRuns()
  }, [loadGraph, loadRuns])

  function patchNode(nid: string, patch: Partial<WfNode>) {
    setGraph((g) =>
      g ? { ...g, nodes: g.nodes.map((n) => (n.id === nid ? { ...n, ...patch } : n)) } : g,
    )
  }
  function addNode(type: WfNode['type']) {
    setGraph((g) => {
      if (!g) return g
      const nid = `n${g.nodes.length + 1}_${Math.random().toString(36).slice(2, 6)}`
      const node: WfNode = {
        id: nid,
        type,
        next: null,
        ...(type === 'action' ? { action: 'send_notification', config: {} } : {}),
        ...(type === 'delay' ? { delayMs: 60000 } : {}),
        ...(type === 'condition'
          ? { condition: { left: 'trigger.', op: 'truthy' }, onTrue: null, onFalse: null }
          : {}),
      }
      return { start: g.start || nid, nodes: [...g.nodes, node] }
    })
  }
  function removeNode(nid: string) {
    setGraph((g) => (g ? { ...g, nodes: g.nodes.filter((n) => n.id !== nid) } : g))
  }

  async function save() {
    if (!graph) return
    setSaving(true)
    try {
      await api.put(`/workflows/${id}/graph`, graph)
      toast.push('success', 'Workflow saved')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }
  async function run() {
    try {
      await api.post(`/workflows/${id}/run`, { payload: { manual: true } })
      toast.push('success', 'Run started')
      setTimeout(loadRuns, 1500)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Run failed')
    }
  }
  async function toggleStatus() {
    const to = wf?.status === 'ACTIVE' ? 'pause' : 'resume'
    try {
      await api.post(`/workflows/${id}/${to}`)
      loadGraph()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed')
    }
  }
  async function openRunDetail(rid: string) {
    const detail = await api.get<Run & { steps: Step[] }>(`/workflow-runs/${rid}`)
    setOpenRun({ run: detail, steps: detail.steps })
  }
  async function retry(rid: string) {
    await api.post(`/workflow-runs/${rid}/retry`)
    toast.push('success', 'Retrying')
    setOpenRun(null)
    setTimeout(loadRuns, 1500)
  }

  if (error) return <ErrorState message={error} onRetry={loadGraph} />
  if (!graph || !wf) return <LoadingScreen />

  const nodeOptions = [
    { value: '', label: '— end —' },
    ...graph.nodes.map((n) => ({ value: n.id, label: `${n.id} (${n.type})` })),
  ]

  return (
    <>
      <PageHeader
        title={wf.name}
        subtitle={`Trigger: ${wf.triggerType} · ${wf.status}`}
        actions={
          <>
            <Link href="/app/automation/workflows" className="btn ghost">
              <Icon name="arrow-left" size={14} /> Back
            </Link>
            <button className="btn" onClick={toggleStatus}>
              {wf.status === 'ACTIVE' ? (
                <>
                  <Icon name="pause" size={14} /> Pause
                </>
              ) : (
                <>
                  <Icon name="play" size={14} /> Activate
                </>
              )}
            </button>
            <button className="btn" onClick={run}>
              <Icon name="play" size={14} /> Run now
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : 'Save'}
            </button>
          </>
        }
      />

      <div
        className="split grid"
        style={{ gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}
      >
        {/* Node editor */}
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="dim" style={{ fontSize: 12 }}>
              Add step:
            </span>
            <button className="btn sm" onClick={() => addNode('action')}>
              + Action
            </button>
            <button className="btn sm" onClick={() => addNode('condition')}>
              + Condition
            </button>
            <button className="btn sm" onClick={() => addNode('delay')}>
              + Delay
            </button>
          </div>
          {graph.nodes.length === 0 ? (
            <EmptyState
              icon="workflow"
              title="Empty workflow"
              hint="Add steps to build your automation, then Save."
            />
          ) : (
            graph.nodes.map((n) => (
              <div key={n.id} className="card">
                <div className="spread" style={{ marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge
                      status={n.type === 'action' ? 'info' : n.type === 'condition' ? 'warn' : 'ok'}
                    >
                      {n.type}
                    </Badge>
                    <span className="mono dim" style={{ fontSize: 11 }}>
                      {n.id}
                    </span>
                    {graph.start === n.id ? (
                      <Badge status="ok">start</Badge>
                    ) : (
                      <button
                        className="btn ghost sm"
                        onClick={() => setGraph({ ...graph, start: n.id })}
                      >
                        set start
                      </button>
                    )}
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => removeNode(n.id)}
                    aria-label="Remove step"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>

                {n.type === 'action' ? (
                  <>
                    <Field label="Action">
                      <select
                        className="select"
                        value={n.action ?? ''}
                        onChange={(e) => patchNode(n.id, { action: e.target.value, config: {} })}
                      >
                        {ACTIONS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {(ACTIONS.find((a) => a.value === n.action)?.fields ?? []).map((f) => (
                      <Field key={f} label={f}>
                        <input
                          className="input"
                          value={String((n.config ?? {})[f] ?? '')}
                          onChange={(e) =>
                            patchNode(n.id, {
                              config: { ...(n.config ?? {}), [f]: e.target.value },
                            })
                          }
                        />
                      </Field>
                    ))}
                    <NextSelect
                      label="Then"
                      value={n.next ?? ''}
                      options={nodeOptions}
                      onChange={(v) => patchNode(n.id, { next: v || null })}
                    />
                  </>
                ) : n.type === 'delay' ? (
                  <>
                    <Field label="Delay (seconds)">
                      <input
                        className="input"
                        type="number"
                        value={Math.round((n.delayMs ?? 0) / 1000)}
                        onChange={(e) =>
                          patchNode(n.id, { delayMs: Number(e.target.value) * 1000 })
                        }
                      />
                    </Field>
                    <NextSelect
                      label="Then"
                      value={n.next ?? ''}
                      options={nodeOptions}
                      onChange={(v) => patchNode(n.id, { next: v || null })}
                    />
                  </>
                ) : (
                  <>
                    <Field label="If (context path)">
                      <input
                        className="input mono"
                        value={n.condition?.left ?? ''}
                        onChange={(e) =>
                          patchNode(n.id, {
                            condition: {
                              ...(n.condition ?? { op: 'truthy' }),
                              left: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Operator">
                      <select
                        className="select"
                        value={n.condition?.op ?? 'truthy'}
                        onChange={(e) =>
                          patchNode(n.id, {
                            condition: {
                              left: n.condition?.left ?? '',
                              ...n.condition,
                              op: e.target.value,
                            },
                          })
                        }
                      >
                        {OPS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {n.condition?.op !== 'truthy' ? (
                      <Field label="Value">
                        <input
                          className="input"
                          value={String(n.condition?.right ?? '')}
                          onChange={(e) =>
                            patchNode(n.id, {
                              condition: {
                                left: n.condition?.left ?? '',
                                op: n.condition?.op ?? 'eq',
                                right: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    <NextSelect
                      label="If true →"
                      value={n.onTrue ?? ''}
                      options={nodeOptions}
                      onChange={(v) => patchNode(n.id, { onTrue: v || null })}
                    />
                    <NextSelect
                      label="If false →"
                      value={n.onFalse ?? ''}
                      options={nodeOptions}
                      onChange={(v) => patchNode(n.id, { onFalse: v || null })}
                    />
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Execution history */}
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Executions</h3>
            <button className="btn ghost sm" onClick={loadRuns} aria-label="Refresh">
              <Icon name="refresh" size={15} />
            </button>
          </div>
          {runs.length === 0 ? (
            <div className="dim" style={{ fontSize: 12 }}>
              No runs yet. Save the graph, then Run now.
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {runs.map((r) => (
                <button
                  key={r.id}
                  className="card row-link"
                  style={{ padding: '8px 10px', textAlign: 'left' }}
                  onClick={() => void openRunDetail(r.id)}
                >
                  <div className="spread">
                    <Badge
                      status={
                        r.status === 'SUCCEEDED'
                          ? 'ok'
                          : r.status === 'FAILED'
                            ? 'danger'
                            : r.status === 'WAITING'
                              ? 'warn'
                              : 'info'
                      }
                    >
                      {r.status}
                    </Badge>
                    <span className="dim" style={{ fontSize: 11 }}>
                      {r.durationMs ? `${r.durationMs}ms` : ''}
                    </span>
                  </div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {openRun ? (
        <Drawer
          open
          title={`Run · ${openRun.run.status}`}
          onClose={() => setOpenRun(null)}
          footer={
            openRun.run.status === 'FAILED' ? (
              <button className="btn primary" onClick={() => void retry(openRun.run.id)}>
                <Icon name="refresh" size={14} /> Retry from failed step
              </button>
            ) : undefined
          }
        >
          {openRun.run.error ? (
            <div className="banner error" style={{ marginBottom: 12 }}>
              {openRun.run.error}
            </div>
          ) : null}
          <div className="stack" style={{ gap: 6 }}>
            {openRun.steps.map((s) => (
              <div key={s.id} className="card" style={{ padding: '8px 10px' }}>
                <div className="spread">
                  <span className="mono" style={{ fontSize: 12 }}>
                    #{s.position} {s.nodeId}
                  </span>
                  <Badge
                    status={
                      s.status === 'SUCCEEDED' ? 'ok' : s.status === 'FAILED' ? 'danger' : 'info'
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
                {s.output ? (
                  <pre
                    className="mono dim"
                    style={{ fontSize: 11, marginTop: 4, whiteSpace: 'pre-wrap' }}
                  >
                    {JSON.stringify(s.output)}
                  </pre>
                ) : null}
                {s.error ? (
                  <div style={{ color: 'var(--danger)', fontSize: 12 }}>{s.error}</div>
                ) : null}
              </div>
            ))}
            {openRun.steps.length === 0 ? (
              <div className="dim" style={{ fontSize: 12 }}>
                No steps recorded yet.
              </div>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </>
  )
}

function NextSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
