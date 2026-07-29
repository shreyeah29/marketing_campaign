import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Zap, Activity, Calendar, Sparkles, Clock } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useNavigate } from 'react-router-dom'

const revenueData = [
  { month: 'Jan', revenue: 42000, leads: 120 },
  { month: 'Feb', revenue: 55000, leads: 145 },
  { month: 'Mar', revenue: 48000, leads: 132 },
  { month: 'Apr', revenue: 72000, leads: 190 },
  { month: 'May', revenue: 68000, leads: 178 },
  { month: 'Jun', revenue: 89000, leads: 220 },
  { month: 'Jul', revenue: 95000, leads: 248 },
]

const campaignData = [
  { name: 'Facebook', value: 35, color: '#6366f1' },
  { name: 'Google', value: 28, color: '#8b5cf6' },
  { name: 'LinkedIn', value: 18, color: '#06b6d4' },
  { name: 'Email', value: 12, color: '#10b981' },
  { name: 'WhatsApp', value: 7, color: '#f59e0b' },
]

const funnelData = [
  { name: 'Visitors', value: 12400, fill: '#6366f1' },
  { name: 'Leads', value: 3800, fill: '#8b5cf6' },
  { name: 'Qualified', value: 1240, fill: '#06b6d4' },
  { name: 'Proposals', value: 480, fill: '#10b981' },
  { name: 'Closed', value: 128, fill: '#f59e0b' },
]

const kpis = [
  { label: 'Marketing Score', value: '87', unit: '/100', change: 12, icon: Zap, color: 'indigo', desc: 'Overall health' },
  { label: 'Revenue (MTD)', value: '$95K', unit: '', change: 23, icon: DollarSign, color: 'emerald', desc: 'Month to date' },
  { label: 'Total Leads', value: '248', unit: '', change: 18, icon: Users, color: 'violet', desc: 'This month' },
  { label: 'Appointments', value: '34', unit: '', change: -4, icon: Calendar, color: 'cyan', desc: 'This week' },
  { label: 'ROI', value: '340%', unit: '', change: 28, icon: TrendingUp, color: 'emerald', desc: 'All channels' },
  { label: 'Conversion', value: '3.4%', unit: '', change: 0.8, icon: Target, color: 'indigo', desc: 'Lead to client' },
  { label: 'Active Campaigns', value: '12', unit: '', change: 3, icon: Activity, color: 'violet', desc: 'Running now' },
]

const recentActivity = [
  { type: 'lead', text: 'Priya Sharma submitted NRI consultation form', time: '2m ago', status: 'new' },
  { type: 'ai', text: 'AI generated 14-section campaign for VSP Dallas', time: '18m ago', status: 'complete' },
  { type: 'email', text: 'Email sequence "NRI Welcome Series" started for 45 contacts', time: '1h ago', status: 'active' },
  { type: 'campaign', text: 'Facebook campaign "NRI Legal Dallas" went live', time: '2h ago', status: 'live' },
  { type: 'call', text: 'AI Voice call with Rajesh Kumar completed — Appointment booked', time: '3h ago', status: 'complete' },
]

const aiInsights = [
  { text: 'LinkedIn campaigns showing 34% higher lead quality — consider reallocating budget', priority: 'high' },
  { text: 'Email open rates peak Tue 10am & Thu 2pm — reschedule sends for +22% opens', priority: 'medium' },
  { text: 'Mobile traffic is 68% but only 31% of conversions — UX opportunity worth ~$45K/mo', priority: 'high' },
  { text: 'NRI segment has 3.2x higher LTV — deserves dedicated nurture track', priority: 'medium' },
]

const upcomingTasks = [
  { task: 'Review Facebook ad creative for Q3', due: 'Today 3pm', priority: 'high' },
  { task: 'Approve WhatsApp template for NRI campaign', due: 'Tomorrow 10am', priority: 'medium' },
  { task: 'Monthly analytics review call', due: 'Aug 1, 11am', priority: 'low' },
  { task: 'Launch Google Ads NRI retargeting', due: 'Aug 2', priority: 'high' },
]

const colorMap: Record<string, string> = {
  indigo: 'bg-indigo-500/20 text-indigo-300',
  emerald: 'bg-emerald-500/20 text-emerald-300',
  violet: 'bg-violet-500/20 text-violet-300',
  cyan: 'bg-cyan-500/20 text-cyan-300',
}

export function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          const isUp = kpi.change > 0
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4 hover:border-white/15 transition-colors cursor-default">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[kpi.color]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className={`flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(kpi.change)}{typeof kpi.change === 'number' && kpi.unit !== '/100' ? '%' : ''}
                  </div>
                </div>
                <p className="text-xl font-bold text-white">{kpi.value}<span className="text-sm text-white/30">{kpi.unit}</span></p>
                <p className="text-[11px] text-white/40 mt-0.5">{kpi.label}</p>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-white text-sm">Revenue & Leads Growth</CardTitle>
              <p className="text-xs text-white/30 mt-0.5">Last 7 months</p>
            </div>
            <Badge variant="success">+23% MoM</Badge>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" name="Revenue ($)" />
              <Area type="monotone" dataKey="leads" stroke="#06b6d4" strokeWidth={2} fill="url(#leadGrad)" name="Leads" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Channel breakdown */}
        <Card className="p-5">
          <CardTitle className="text-white text-sm mb-1">Channel Performance</CardTitle>
          <p className="text-xs text-white/30 mb-4">Lead distribution by channel</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={campaignData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                {campaignData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {campaignData.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-xs text-white/50 flex-1">{c.name}</span>
                <span className="text-xs font-medium text-white/70">{c.value}%</span>
                <Progress value={c.value} className="w-16 h-1" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lead Funnel */}
        <Card className="p-5">
          <CardTitle className="text-white text-sm mb-1">Lead Funnel</CardTitle>
          <p className="text-xs text-white/30 mb-4">Conversion pipeline</p>
          <div className="space-y-2">
            {funnelData.map((stage, i) => {
              const pct = Math.round((stage.value / funnelData[0].value) * 100)
              return (
                <div key={stage.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/50">{stage.name}</span>
                    <span className="text-xs font-medium text-white/70">{stage.value.toLocaleString()}</span>
                  </div>
                  <div className="h-6 rounded-md overflow-hidden bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: i * 0.1, duration: 0.6 }}
                      className="h-full rounded-md flex items-center pl-2"
                      style={{ background: stage.fill, opacity: 0.85 }}
                    >
                      <span className="text-[10px] text-white/70">{pct}%</span>
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
            <CardTitle className="text-white text-sm">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" className="text-indigo-400 text-xs h-7">View all</Button>
          </div>
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  item.status === 'new' ? 'bg-emerald-500' :
                  item.status === 'live' ? 'bg-indigo-500' :
                  item.status === 'active' ? 'bg-cyan-500' : 'bg-white/20'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 leading-relaxed">{item.text}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{item.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* AI Insights */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <CardTitle className="text-white text-sm">AI Insights</CardTitle>
          </div>
          <div className="space-y-3">
            {aiInsights.map((insight, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.08 }}
                className="p-3 rounded-lg bg-white/3 border border-white/6 hover:border-indigo-500/30 transition-colors cursor-default"
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${insight.priority === 'high' ? 'bg-amber-400' : 'bg-indigo-400'}`} />
                  <p className="text-xs text-white/60 leading-relaxed">{insight.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="w-full mt-3 text-indigo-400 text-xs" onClick={() => navigate('/ai-command')}>
            <Sparkles className="w-3 h-3 mr-1.5" />
            Generate full AI report
          </Button>
        </Card>
      </div>

      {/* Upcoming tasks */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-white text-sm">Upcoming Tasks</CardTitle>
          <Button variant="ghost" size="sm" className="text-indigo-400 text-xs h-7">+ Add task</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcomingTasks.map((t, i) => (
            <div key={i} className="p-3 rounded-lg bg-white/3 border border-white/6 flex items-start gap-3">
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                t.priority === 'high' ? 'border-red-400' : t.priority === 'medium' ? 'border-amber-400' : 'border-white/20'
              }`} />
              <div>
                <p className="text-xs text-white/70 font-medium">{t.task}</p>
                <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{t.due}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
