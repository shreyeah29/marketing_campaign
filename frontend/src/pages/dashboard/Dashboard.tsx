import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import {
  TrendingUp, TrendingDown, Users, DollarSign, Target,
  Zap, Activity, Calendar, Sparkles, Clock, ArrowUpRight
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

const revenueData = [
  { month: 'Jan', revenue: 42000, leads: 120 },
  { month: 'Feb', revenue: 55000, leads: 145 },
  { month: 'Mar', revenue: 48000, leads: 132 },
  { month: 'Apr', revenue: 72000, leads: 190 },
  { month: 'May', revenue: 68000, leads: 178 },
  { month: 'Jun', revenue: 89000, leads: 220 },
  { month: 'Jul', revenue: 95000, leads: 248 },
]

const channelData = [
  { name: 'Facebook', value: 35, color: '#6366f1' },
  { name: 'Google', value: 28, color: '#8b5cf6' },
  { name: 'LinkedIn', value: 18, color: '#06b6d4' },
  { name: 'Email', value: 12, color: '#10b981' },
  { name: 'WhatsApp', value: 7, color: '#f59e0b' },
]

const funnelData = [
  { name: 'Visitors', value: 12400, fill: '#6366f1', width: 100 },
  { name: 'Leads', value: 3800, fill: '#8b5cf6', width: 75 },
  { name: 'Qualified', value: 1240, fill: '#06b6d4', width: 52 },
  { name: 'Proposals', value: 480, fill: '#10b981', width: 34 },
  { name: 'Closed', value: 128, fill: '#f59e0b', width: 20 },
]

const kpis = [
  { label: 'Marketing Score', value: '87', unit: '/100', change: 12, icon: Zap, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/[0.12]', borderClass: 'border-indigo-500/20', glowColor: 'rgba(99,102,241,0.12)' },
  { label: 'Revenue (MTD)', value: '$95K', unit: '', change: 23, icon: DollarSign, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/[0.10]', borderClass: 'border-emerald-500/20', glowColor: 'rgba(16,185,129,0.1)' },
  { label: 'Total Leads', value: '248', unit: '', change: 18, icon: Users, colorClass: 'text-violet-400', bgClass: 'bg-violet-500/[0.10]', borderClass: 'border-violet-500/20', glowColor: 'rgba(139,92,246,0.1)' },
  { label: 'Appointments', value: '34', unit: '', change: -4, icon: Calendar, colorClass: 'text-cyan-400', bgClass: 'bg-cyan-500/[0.10]', borderClass: 'border-cyan-500/20', glowColor: 'rgba(6,182,212,0.1)' },
  { label: 'ROI', value: '340%', unit: '', change: 28, icon: TrendingUp, colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/[0.10]', borderClass: 'border-emerald-500/20', glowColor: 'rgba(16,185,129,0.1)' },
  { label: 'Conversion', value: '3.4%', unit: '', change: 0.8, icon: Target, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/[0.12]', borderClass: 'border-indigo-500/20', glowColor: 'rgba(99,102,241,0.12)' },
  { label: 'Active Campaigns', value: '12', unit: '', change: 3, icon: Activity, colorClass: 'text-violet-400', bgClass: 'bg-violet-500/[0.10]', borderClass: 'border-violet-500/20', glowColor: 'rgba(139,92,246,0.1)' },
]

const recentActivity = [
  { text: 'Priya Sharma submitted NRI consultation form', time: '2m ago', status: 'new', color: 'bg-emerald-500' },
  { text: 'AI generated 14-section campaign for VSP Dallas', time: '18m ago', status: 'complete', color: 'bg-indigo-500' },
  { text: 'Email sequence "NRI Welcome" started for 45 contacts', time: '1h ago', status: 'active', color: 'bg-cyan-500' },
  { text: 'Facebook campaign "NRI Legal Dallas" went live', time: '2h ago', status: 'live', color: 'bg-violet-500' },
  { text: 'AI Voice call with Rajesh Kumar — Appointment booked', time: '3h ago', status: 'complete', color: 'bg-white/20' },
]

const aiInsights = [
  { text: 'LinkedIn campaigns show 34% higher lead quality — reallocate 15% from Facebook budget', priority: 'high' },
  { text: 'Email open rates peak Tue 10am & Thu 2pm — reschedule sends for +22% open rate', priority: 'medium' },
  { text: 'Mobile traffic 68% but only 31% conversions — UX gap worth ~$45K/mo in revenue', priority: 'high' },
  { text: 'NRI segment has 3.2x higher LTV — create dedicated high-touch nurture track', priority: 'medium' },
]

const upcomingTasks = [
  { task: 'Review Facebook ad creative for Q3', due: 'Today, 3:00 PM', priority: 'high' },
  { task: 'Approve WhatsApp template for NRI campaign', due: 'Tomorrow, 10:00 AM', priority: 'medium' },
  { task: 'Monthly analytics review call', due: 'Aug 1, 11:00 AM', priority: 'low' },
  { task: 'Launch Google Ads NRI retargeting', due: 'Aug 2', priority: 'high' },
]

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900/95 border border-white/[0.1] rounded-xl p-3 shadow-xl backdrop-blur-xl text-xs">
        <p className="text-white/50 font-medium mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-white/70">{p.name}:</span>
            <span className="text-white font-semibold tabular-nums">
              {p.dataKey === 'revenue' ? `$${(p.value / 1000).toFixed(0)}K` : p.value}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">

      {/* ── KPI Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          const isUp = kpi.change > 0
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.045, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={cn(
                'relative rounded-2xl p-4 overflow-hidden',
                'border bg-white/[0.02]',
                'shadow-[0_1px_3px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.2)]',
                'hover:bg-white/[0.04] hover:border-white/[0.12]',
                'transition-all duration-300 cursor-default group',
                kpi.borderClass,
              )}
                style={{ boxShadow: `0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.2), 0 0 40px ${kpi.glowColor}` }}
              >
                {/* Top accent line */}
                <div className={cn('absolute top-0 left-4 right-4 h-px', kpi.bgClass.replace('/[0.12]', '/40').replace('/[0.10]', '/30'))} />

                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center',
                    kpi.bgClass,
                    'border',
                    kpi.borderClass,
                  )}>
                    <Icon className={cn('w-4 h-4', kpi.colorClass)} />
                  </div>
                  <div className={cn(
                    'flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
                    isUp ? 'text-emerald-400' : 'text-red-400',
                  )}>
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(kpi.change)}%
                  </div>
                </div>

                <p className="text-[22px] font-bold text-white leading-none tabular-nums tracking-tight">
                  {kpi.value}
                  <span className="text-sm text-white/30 font-medium">{kpi.unit}</span>
                </p>
                <p className="text-[11px] text-white/40 mt-1.5 font-medium leading-tight">{kpi.label}</p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-semibold text-white">Revenue & Lead Growth</p>
              <p className="text-[11px] text-white/35 mt-0.5">7-month performance overview</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" className="text-[10px]">+23% MoM</Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-white/40 hover:text-white/70">
                Export
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            {[{ color: '#6366f1', label: 'Revenue' }, { color: '#06b6d4', label: 'Leads' }].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                <span className="text-[11px] text-white/45 font-medium">{l.label}</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={revenueData} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.28)', fontWeight: 500 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)', fontWeight: 400 }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
              <Area
                type="monotone" dataKey="revenue"
                stroke="#6366f1" strokeWidth={2}
                fill="url(#revGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#0a0a0f' }}
                name="Revenue"
              />
              <Area
                type="monotone" dataKey="leads"
                stroke="#06b6d4" strokeWidth={2}
                fill="url(#leadGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#06b6d4', strokeWidth: 2, stroke: '#0a0a0f' }}
                name="Leads"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Channel breakdown */}
        <Card className="p-5">
          <p className="text-sm font-semibold text-white mb-0.5">Channel Mix</p>
          <p className="text-[11px] text-white/35 mb-4">Lead distribution</p>

          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={channelData}
                cx="50%" cy="50%"
                innerRadius={42} outerRadius={62}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {channelData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={0.9} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,15,25,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-2.5 mt-2">
            {channelData.map((c) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-xs text-white/50 flex-1 font-medium">{c.name}</span>
                <span className="text-xs font-semibold text-white/70 tabular-nums w-8 text-right">{c.value}%</span>
                <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.value * 2.5}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Bottom Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <Card className="p-5">
          <p className="text-sm font-semibold text-white mb-0.5">Lead Funnel</p>
          <p className="text-[11px] text-white/35 mb-4">Conversion pipeline</p>
          <div className="space-y-2.5">
            {funnelData.map((stage, i) => {
              const pct = Math.round((stage.value / funnelData[0].value) * 100)
              return (
                <div key={stage.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-white/50 font-medium">{stage.name}</span>
                    <span className="text-xs font-semibold text-white/70 tabular-nums">
                      {stage.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-7 rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.05]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: i * 0.08 + 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-lg flex items-center pl-2.5"
                      style={{
                        background: `linear-gradient(90deg, ${stage.fill}cc, ${stage.fill}88)`,
                      }}
                    >
                      <span className="text-[10px] font-semibold text-white/80">{pct}%</span>
                    </motion.div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white">Recent Activity</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-400 hover:text-indigo-300">
              View all
            </Button>
          </div>
          <div className="space-y-3.5">
            {recentActivity.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 + 0.2, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="mt-1.5 shrink-0">
                  <div className={cn('w-1.5 h-1.5 rounded-full', item.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/65 leading-relaxed font-medium">{item.text}</p>
                  <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {item.time}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* AI Insights */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className={cn(
              'w-7 h-7 rounded-xl flex items-center justify-center',
              'bg-indigo-500/[0.15] border border-indigo-500/25',
            )}>
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">AI Insights</p>
              <p className="text-[10px] text-indigo-400/70">4 recommendations</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {aiInsights.map((insight, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.07 + 0.2 }}
                className={cn(
                  'p-3 rounded-xl cursor-default group',
                  'border transition-all duration-200',
                  'bg-white/[0.02] border-white/[0.06]',
                  'hover:bg-white/[0.04] hover:border-white/[0.1]',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    'w-1 h-1 rounded-full mt-1.5 shrink-0',
                    insight.priority === 'high' ? 'bg-amber-400' : 'bg-indigo-400/70'
                  )} />
                  <p className="text-[11px] text-white/55 leading-relaxed">{insight.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 h-8 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/[0.08]"
            onClick={() => navigate('/ai-command')}
          >
            <Sparkles className="w-3 h-3" />
            Generate full AI report
            <ArrowUpRight className="w-3 h-3 ml-auto" />
          </Button>
        </Card>
      </div>

      {/* ── Upcoming Tasks ────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Upcoming Tasks</p>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            + Add task
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcomingTasks.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 + 0.1 }}
              className={cn(
                'flex items-start gap-3 p-3.5 rounded-xl',
                'border transition-all duration-200 cursor-pointer group',
                'bg-white/[0.02] border-white/[0.06]',
                'hover:bg-white/[0.04] hover:border-white/[0.1]',
              )}
            >
              <div className={cn(
                'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0',
                'flex items-center justify-center',
                t.priority === 'high' ? 'border-red-400/70' :
                t.priority === 'medium' ? 'border-amber-400/70' :
                'border-white/[0.18]',
              )} />
              <div>
                <p className="text-xs font-semibold text-white/70 leading-relaxed group-hover:text-white/85 transition-colors">
                  {t.task}
                </p>
                <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {t.due}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  )
}
