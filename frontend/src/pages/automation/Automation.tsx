import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Play, Pause, CheckCircle2, Mail, MessageCircle, Phone, Clock, User, ArrowDown, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const workflows = [
  { id: 1, name: 'NRI Lead Nurture', status: 'active', runs: 284, success: 261, trigger: 'Lead Created' },
  { id: 2, name: 'Consultation Follow-up', status: 'active', runs: 112, success: 108, trigger: 'Appointment Booked' },
  { id: 3, name: 'Property Guide Drip', status: 'paused', runs: 45, success: 43, trigger: 'Content Downloaded' },
]

const workflowSteps = [
  { icon: User, label: 'Lead Created', sublabel: 'Trigger: New form submission', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  { icon: Mail, label: 'Send Welcome Email', sublabel: 'Template: NRI Welcome v3', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  { icon: Clock, label: 'Wait 2 days', sublabel: 'Delay step', color: 'text-white/40', bg: 'bg-white/5 border-white/10' },
  { icon: MessageCircle, label: 'Send WhatsApp', sublabel: 'Template: Property Checklist', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { icon: Clock, label: 'Wait 1 day', sublabel: 'Delay step', color: 'text-white/40', bg: 'bg-white/5 border-white/10' },
  { icon: Phone, label: 'Schedule AI Call', sublabel: 'Agent: Aria • Script: NRI Qualify', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  { icon: Zap, label: 'Update CRM', sublabel: 'Set status: Contacted', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { icon: CheckCircle2, label: 'End of Flow', sublabel: 'Trigger next automation if qualified', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
]

const executionLog = [
  { lead: 'Priya Sharma', step: 'Send WhatsApp', status: 'completed', time: '2m ago' },
  { lead: 'Rajesh Kumar', step: 'Wait 2 days', status: 'waiting', time: '5h ago' },
  { lead: 'Anita Patel', step: 'Send Welcome Email', status: 'completed', time: '1h ago' },
  { lead: 'Suresh Mehta', step: 'Schedule AI Call', status: 'completed', time: '3h ago' },
  { lead: 'Deepa Nair', step: 'Update CRM', status: 'completed', time: '6h ago' },
]

export function Automation() {
  const [activeWorkflow, setActiveWorkflow] = useState(workflows[0])

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/70">Workflows</h3>
            <Button size="sm" variant="gradient" className="gap-1.5 h-7 text-xs">
              <Plus className="w-3 h-3" />New
            </Button>
          </div>
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => setActiveWorkflow(wf)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                activeWorkflow.id === wf.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/8 bg-white/3 hover:border-white/15'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white/80">{wf.name}</p>
                <Badge variant={wf.status === 'active' ? 'success' : 'warning'}>{wf.status}</Badge>
              </div>
              <p className="text-xs text-white/30 mb-2">Trigger: {wf.trigger}</p>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span>{wf.runs} runs</span>
                <span className="text-emerald-400">{Math.round((wf.success / wf.runs) * 100)}% success</span>
              </div>
            </button>
          ))}
        </div>

        {/* Visual builder */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold text-white">{activeWorkflow.name}</h3>
                <p className="text-xs text-white/30 mt-0.5">Visual Workflow Builder</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                  {activeWorkflow.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {activeWorkflow.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs">Edit</Button>
              </div>
            </div>

            {/* Steps */}
            <div className="flex flex-col items-center">
              {workflowSteps.map((step, i) => {
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
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${step.bg}`}>
                        <Icon className={`w-4 h-4 ${step.color}`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/80">{step.label}</p>
                        <p className="text-[10px] text-white/40">{step.sublabel}</p>
                      </div>
                    </div>
                    {i < workflowSteps.length - 1 && (
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
              {executionLog.map((log, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                  <span className="text-xs font-medium text-white/70 flex-1">{log.lead}</span>
                  <span className="text-xs text-white/40">{log.step}</span>
                  <Badge variant={log.status === 'completed' ? 'success' : 'warning'} className="text-[10px]">{log.status}</Badge>
                  <span className="text-[10px] text-white/30">{log.time}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
