import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line
} from 'recharts'
import { TrendingUp, Download, Sparkles, DollarSign, Users, Target, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { analyticsApi } from '@/services/api'

const tooltipStyle = {
  background: 'rgba(10,10,20,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontSize: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
}

export function Analytics() {
  const [kpis, setKpis] = useState<Record<string, number>>({})
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [channelData, setChannelData] = useState<any[]>([])
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([])
  const [topCampaigns, setTopCampaigns] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [dash, channels, recs] = await Promise.all([
          analyticsApi.dashboard(),
          analyticsApi.channels(),
          analyticsApi.recommendations(),
        ])
        setKpis((dash?.kpis as Record<string, number>) || {})
        setRevenueData(dash?.revenueByMonth || [])
        setChannelData(
          (channels || []).map((c: any) => ({
            channel: c.channel || c.name,
            leads: c.leads ?? 0,
            roi: c.roi ?? 0,
            spend: c.spend,
            revenue: c.revenue,
          }))
        )
        setTopCampaigns(
          (channels || []).slice(0, 4).map((c: any) => ({
            name: `${c.channel || c.name} Campaign`,
            channel: c.channel || c.name,
            leads: c.leads ?? 0,
            roi: `${c.roi ?? 0}%`,
            spend: c.spend != null ? `$${Number(c.spend).toLocaleString()}` : '—',
            revenue: c.revenue != null ? `$${Number(c.revenue).toLocaleString()}` : '—',
          }))
        )
        setAiRecommendations(recs || [])
      } catch (err) {
        console.error(err)
        setRevenueData([])
        setChannelData([])
        setAiRecommendations([])
        setTopCampaigns([])
      }
    }
    load()
  }, [])

  const kpiCards = [
    { icon: TrendingUp, label: 'Marketing Score', value: kpis.marketingScore != null ? `${kpis.marketingScore}/100` : '—', change: '+12 pts', color: 'text-indigo-400', bg: 'bg-indigo-500/[0.1]', border: 'border-indigo-500/[0.18]' },
    { icon: DollarSign, label: 'Campaign ROI', value: kpis.roi != null ? `${kpis.roi}%` : '—', change: '+28%', color: 'text-emerald-400', bg: 'bg-emerald-500/[0.1]', border: 'border-emerald-500/[0.18]' },
    { icon: Users, label: 'Total Leads', value: kpis.leads != null ? String(kpis.leads) : '—', change: '+18%', color: 'text-violet-400', bg: 'bg-violet-500/[0.1]', border: 'border-violet-500/[0.18]' },
    { icon: Target, label: 'Conversion Rate', value: kpis.conversionRate != null ? `${kpis.conversionRate}%` : '—', change: '+0.8%', color: 'text-cyan-400', bg: 'bg-cyan-500/[0.1]', border: 'border-cyan-500/[0.18]' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.08em]">July 2026 · All Channels</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
            <Download className="w-3.5 h-3.5" />Export PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
            <Download className="w-3.5 h-3.5" />Export Excel
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 hover:bg-white/[0.04] transition-all duration-200">
                <div className={`w-9 h-9 rounded-xl ${kpi.bg} border ${kpi.border} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className="text-xl font-bold text-white tabular-nums">{kpi.value}</p>
                <p className="text-xs text-white/40 mt-0.5 font-medium">{kpi.label}</p>
                <Badge variant="success" className="mt-2.5 text-[10px]">{kpi.change}</Badge>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-semibold text-white mb-0.5">Revenue vs Target</p>
          <p className="text-[11px] text-white/35 mb-4">Monthly performance comparison</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueData} margin={{ left: -20, right: 4 }}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.28)', fontWeight: 500 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.06)' }} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad2)" dot={false} activeDot={{ r: 4, fill: '#6366f1', stroke: '#0a0a0f', strokeWidth: 2 }} name="Revenue ($)" />
              <Line type="monotone" dataKey="target" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Target ($)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold text-white mb-0.5">Channel ROI Comparison</p>
          <p className="text-[11px] text-white/35 mb-4">Return on investment by channel</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelData} margin={{ left: -20, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.28)', fontWeight: 500 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="roi" fill="#6366f1" radius={[6, 6, 2, 2]} name="ROI %" maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top Campaigns */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Top Performing Campaigns</p>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400 hover:text-indigo-300">View all</Button>
        </div>
        <div className="space-y-1.5">
          {topCampaigns.map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/[0.1] border border-indigo-500/[0.18] flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80 truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">{c.channel}</Badge>
                    <span className="text-[11px] text-white/30">{c.leads} leads · {c.spend} spent</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="success" className="text-[10px]">{c.roi} ROI</Badge>
                  <p className="text-[11px] text-white/45 mt-1 font-semibold tabular-nums">{c.revenue}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* AI Recommendations */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/[0.12] border border-indigo-500/[0.2] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">AI Recommendations</p>
            <p className="text-[10px] text-indigo-400/60">{aiRecommendations.length} actionable insights this month</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {aiRecommendations.map((rec, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <div className="p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] hover:border-indigo-500/[0.3] hover:bg-white/[0.04] transition-all duration-200 cursor-pointer group">
                <p className="text-[11px] text-white/55 leading-relaxed mb-3 group-hover:text-white/70 transition-colors">{rec.text}</p>
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
