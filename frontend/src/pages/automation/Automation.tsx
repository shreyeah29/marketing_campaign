import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Play, Pause, CheckCircle2, Mail, MessageCircle, Phone, Clock, User, ArrowDown, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { automationApi } from '@/services/api'

const workflowSteps = [
  { icon: User, label: 'Lead Created', sublabel: 'Trigger: New form submission', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  { icon: Mail, label: 'Send Welcome Email', sublabel: 'Template: NRI Welcome v3', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  { icon: Clock, label: 'Wait 2 days', sublabel: 'Delay step', color: 'text-white/40', bg: 'bg-white/5 border-white/[0.10]' },
  { icon: MessageCircle, label: 'Send WhatsApp', sublabel: 'Template: Property Checklist', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { icon: Clock, label: 'Wait 1 day', sublabel: 'Delay step', color: 'text-white/40', bg: 'bg-white/5 border-white/[0.10]' },
  { icon: Phone, label: 'Schedule AI Call', sublabel: 'Agent: Aria • Script: NRI Qualify', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  { icon: Zap, label: 'Update CRM', sublabel: 'Set status: Contacted', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { icon: CheckCircle2, label: 'End of Flow', sublabel: 'Trigger next automation if qualified', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
]

export function Automation() {
  const [workflows, setWorkflows] = useState<any[]>([])
  const [activeWorkflow, setActiveWorkflow] = useState<any | null>(null)
  const [executionLog, setExecutionLog] = useState<any[]>([])

  const load = async () => {
    try {
      const [wfs, execs] = await Promise.all([
        automationApi.workflows(),
        automationApi.executions(),
      ])
      setWorkflows(wfs || [])
      setExecutionLog(execs || [])
      if (wfs?.length) {
        setActiveWorkflow((prev: any) => {
          if (prev) {
            const updated = wfs.find((w: any) => w.id === prev.id)
            return updated || wfs[0]
          }
          return wfs[0]
        })
      }
    } catch (err) {
      console.error(err)
      setWorkflows([])
      setExecutionLog([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggleStatus = async () => {
    if (!activeWorkflow) return
    const next = activeWorkflow.status === 'active' ? 'paused' : 'active'
    try {
      await automationApi.updateStatus(String(activeWorkflow.id), next)
      setActiveWorkflow({ ...activeWorkflow, status: next })
      setWorkflows((prev) => prev.map((w) => (w.id === activeWorkflow.id ? { ...w, status: next } : w)))
    } catch (err) {
      console.error(err)
    }
  }

  if (!activeWorkflow) {
    return <div className="p-6 text-sm text-white/40">No workflows yet</div>
  }

  const stepsFromApi = Array.isArray(activeWorkflow.steps) && activeWorkflow.steps.length
    ? activeWorkflow.steps.map((label: string, i: number) => ({
        icon: workflowSteps[i]?.icon || Zap,
        label,
        sublabel: i === 0 ? `Trigger: ${label}` : 'Workflow step',
        color: workflowSteps[i]?.color || 'text-white/40',
        bg: workflowSteps[i]?.bg || 'bg-white/5 border-white/[0.10]',
      }))
    : workflowSteps

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/70">Workflows</h3>
            <Button size="sm" variant="gradient" className="gap-1.5 h-7 text-xs">
              <Plus className="w-3 h-3" />New
            </Button>
          </div>
          {workflows.map((wf) => {
            const successRate = wf.successRate ?? (wf.runs ? Math.round((Number(wf.success || 0) / Number(wf.runs)) * 100) : 0)
            const trigger = wf.trigger || (Array.isArray(wf.steps) ? wf.steps[0] : '—')
            return (
              <button
                key={wf.id}
                onClick={() => setActiveWorkflow(wf)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  activeWorkflow.id === wf.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/[0.08] bg-white/3 hover:border-white/[0.15]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white/80">{wf.name}</p>
                  <Badge variant={wf.status === 'active' ? 'success' : 'warning'}>{wf.status}</Badge>
                </div>
                <p className="text-xs text-white/35 mb-2">Trigger: {trigger}</p>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span>{wf.runs} runs</span>
                  <span className="text-emerald-400">{successRate}% success</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Visual builder */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold text-white">{activeWorkflow.name}</h3>
                <p className="text-xs text-white/35 mt-0.5">Visual Workflow Builder</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleToggleStatus}>
                  {activeWorkflow.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {activeWorkflow.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs">Edit</Button>
              </div>
            </div>

            {/* Steps */}
            <div className="flex flex-col items-center">
              {stepsFromApi.map((step: any, i: number) => {
                const Icon = step.icon
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex flex-col items-center w-full max-w-sm"
                  >
                    <div className={`w-full flex items-center gap-3 p-3 rounded-xl border ${step.bg} cursor-pointer hover:opacity-80 transition-opacity`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${step.bg}`}>
                        <Icon className={`w-4 h-4 ${step.color}`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/80">{step.label}</p>
                        <p className="text-[10px] text-white/40">{step.sublabel}</p>
                      </div>
                    </div>
                    {i < stepsFromApi.length - 1 && (
                      <div className="flex flex-col items-center py-1">
                        <div className="w-px h-4 bg-white/15" />
                        <ArrowDown className="w-3 h-3 text-white/20" />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </Card>

          {/* Execution log */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Execution Log</h3>
            <div className="space-y-2">
              {executionLog.map((log, i) => {
                const status = log.status === 'success' || log.status === 'completed' ? 'completed' : log.status === 'running' || log.status === 'waiting' ? 'waiting' : log.status
                return (
                  <div key={log.id || i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                    <span className="text-xs font-medium text-white/70 flex-1">{log.detail || log.lead || log.workflow}</span>
                    <span className="text-xs text-white/40">{log.workflow || log.step}</span>
                    <Badge variant={status === 'completed' ? 'success' : 'warning'} className="text-[10px]">{status}</Badge>
                    <span className="text-[10px] text-white/35">{log.at || log.time}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
