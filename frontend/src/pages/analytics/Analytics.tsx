import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line
} from 'recharts'
import { TrendingUp, Download, Sparkles, DollarSign, Users, Target, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const revenueData = [
  { month: 'Jan', revenue: 42000, target: 40000 },
  { month: 'Feb', revenue: 55000, target: 45000 },
  { month: 'Mar', revenue: 48000, target: 50000 },
  { month: 'Apr', revenue: 72000, target: 55000 },
  { month: 'May', revenue: 68000, target: 60000 },
  { month: 'Jun', revenue: 89000, target: 70000 },
  { month: 'Jul', revenue: 95000, target: 80000 },
]

const channelData = [
  { channel: 'Facebook', leads: 72, roi: 320 },
  { channel: 'Google', leads: 54, roi: 410 },
  { channel: 'LinkedIn', leads: 24, roi: 280 },
  { channel: 'Email', leads: 30, roi: 820 },
  { channel: 'WhatsApp', leads: 36, roi: 650 },
  { channel: 'Voice AI', leads: 32, roi: 520 },
]

const aiRecommendations = [
  { text: 'Increase LinkedIn budget by 20% — highest quality leads with 3.2x LTV', impact: 'High', effort: 'Low' },
  { text: 'Add retargeting campaign for 1,200 page visitors who didn\'t convert this month', impact: 'High', effort: 'Low' },
  { text: 'A/B test new email subject lines — current open rate 41% can reach 52%+ with optimization', impact: 'Medium', effort: 'Low' },
  { text: 'Launch YouTube channel — video content driving 4.7x more engagement in your niche', impact: 'High', effort: 'High' },
  { text: 'Set up automated WhatsApp follow-up for missed calls — 23% conversion opportunity', impact: 'Medium', effort: 'Medium' },
]

export function Analytics() {
  return (
    <div className="p-6 space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Marketing Analytics</h2>
          <p className="text-xs text-white/30 mt-0.5">July 2026 · All Channels</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"><Download className="w-3.5 h-3.5" />Export PDF</Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"><Download className="w-3.5 h-3.5" />Export Excel</Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'Marketing Score', value: '87/100', change: '+12 pts', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: DollarSign, label: 'Campaign ROI', value: '340%', change: '+28%', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: Users, label: 'Total Leads', value: '248', change: '+18%', color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { icon: Target, label: 'Conversion Rate', value: '3.4%', change: '+0.8%', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4">
                <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className="text-xl font-bold text-white">{kpi.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{kpi.label}</p>
                <Badge variant="success" className="mt-2 text-[10px]">{kpi.change}</Badge>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardTitle className="text-white text-sm mb-1">Revenue vs Target</CardTitle>
          <p className="text-xs text-white/30 mb-4">Monthly performance</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad2)" name="Revenue ($)" />
              <Line type="monotone" dataKey="target" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Target ($)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <CardTitle className="text-white text-sm mb-1">Channel ROI Comparison</CardTitle>
          <p className="text-xs text-white/30 mb-4">Return on investment by channel</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="channel" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="roi" fill="#6366f1" radius={[4, 4, 0, 0]} name="ROI %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top Campaigns */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-white text-sm">Top Performing Campaigns</CardTitle>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400">View all</Button>
        </div>
        <div className="space-y-3">
          {[
            { name: 'NRI Dallas Facebook Campaign', channel: 'Facebook', leads: 72, roi: '320%', spend: '$4,500', revenue: '$18,900' },
            { name: 'Google Search — NRI Legal', channel: 'Google Ads', leads: 54, roi: '410%', spend: '$3,200', revenue: '$16,320' },
            { name: 'LinkedIn NRI Thought Leadership', channel: 'LinkedIn', leads: 24, roi: '280%', spend: '$2,000', revenue: '$7,600' },
            { name: 'Email NRI Welcome Series', channel: 'Email', leads: 30, roi: '820%', spend: '$480', revenue: '$4,320' },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/3 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/80">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">{c.channel}</Badge>
                    <span className="text-xs text-white/30">{c.leads} leads · {c.spend} spend</span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="success" className="text-xs">{c.roi} ROI</Badge>
                  <p className="text-xs text-white/50 mt-0.5">{c.revenue} revenue</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* AI Recommendations */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <CardTitle className="text-white text-sm">AI Recommendations</CardTitle>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aiRecommendations.map((rec, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <div className="p-4 rounded-xl bg-white/3 border border-white/6 hover:border-indigo-500/30 transition-colors">
                <p className="text-xs text-white/60 leading-relaxed mb-3">{rec.text}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={rec.impact === 'High' ? 'default' : 'secondary'} className="text-[10px]">
                    {rec.impact} Impact
                  </Badge>
                  <Badge variant={rec.effort === 'Low' ? 'success' : rec.effort === 'Medium' ? 'warning' : 'secondary'} className="text-[10px]">
                    {rec.effort} Effort
                  </Badge>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  )
}
