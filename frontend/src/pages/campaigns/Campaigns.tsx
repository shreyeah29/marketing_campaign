import { useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Plus, TrendingUp, DollarSign, Users, Search, Filter, MoreHorizontal, Play, Pause, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'

const campaigns = [
  { id: 1, name: 'NRI Dallas Facebook Campaign', channel: 'Facebook', status: 'active', budget: 4500, spent: 3840, leads: 72, conversions: 8, roi: 320, start: 'Jul 1', end: 'Jul 31' },
  { id: 2, name: 'Google Search — NRI Legal', channel: 'Google Ads', status: 'active', budget: 3200, spent: 2760, leads: 54, conversions: 6, roi: 410, start: 'Jul 5', end: 'Aug 5' },
  { id: 3, name: 'LinkedIn NRI Thought Leadership', channel: 'LinkedIn', status: 'active', budget: 2000, spent: 1560, leads: 24, conversions: 4, roi: 280, start: 'Jul 10', end: 'Aug 10' },
  { id: 4, name: 'Email NRI Welcome Series', channel: 'Email', status: 'active', budget: 480, spent: 380, leads: 30, conversions: 5, roi: 820, start: 'Jul 1', end: 'Ongoing' },
  { id: 5, name: 'Instagram NRI Awareness', channel: 'Instagram', status: 'paused', budget: 1500, spent: 890, leads: 28, conversions: 2, roi: 180, start: 'Jun 20', end: 'Jul 20' },
  { id: 6, name: 'WhatsApp Broadcast — NRI', channel: 'WhatsApp', status: 'active', budget: 800, spent: 620, leads: 40, conversions: 7, roi: 650, start: 'Jul 15', end: 'Aug 15' },
  { id: 7, name: 'YouTube Explainer Video', channel: 'YouTube', status: 'draft', budget: 2000, spent: 0, leads: 0, conversions: 0, roi: 0, start: 'Aug 1', end: 'Aug 31' },
]

const channelColors: Record<string, string> = {
  Facebook: 'text-blue-400',
  'Google Ads': 'text-yellow-400',
  LinkedIn: 'text-sky-400',
  Email: 'text-cyan-400',
  Instagram: 'text-pink-400',
  WhatsApp: 'text-emerald-400',
  YouTube: 'text-red-400',
}

export function Campaigns() {
  const [search, setSearch] = useState('')

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.channel.toLowerCase().includes(search.toLowerCase())
  )

  const total = {
    budget: campaigns.reduce((a, c) => a + c.budget, 0),
    spent: campaigns.reduce((a, c) => a + c.spent, 0),
    leads: campaigns.reduce((a, c) => a + c.leads, 0),
    conversions: campaigns.reduce((a, c) => a + c.conversions, 0),
  }

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Budget', value: `$${total.budget.toLocaleString()}`, icon: DollarSign, color: 'text-indigo-400', bg: 'bg-indigo-500/[0.1]', border: 'border-indigo-500/[0.18]' },
          { label: 'Total Spent', value: `$${total.spent.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/[0.1]', border: 'border-emerald-500/[0.18]' },
          { label: 'Total Leads', value: total.leads.toString(), icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/[0.1]', border: 'border-violet-500/[0.18]' },
          { label: 'Conversions', value: total.conversions.toString(), icon: Megaphone, color: 'text-cyan-400', bg: 'bg-cyan-500/[0.1]', border: 'border-cyan-500/[0.18]' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 hover:bg-white/[0.04] transition-all duration-200">
                <div className={`w-9 h-9 rounded-xl ${s.bg} border ${s.border} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-white/40 mt-0.5 font-medium">{s.label}</p>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5">
            <Filter className="w-3.5 h-3.5" />Filter
          </Button>
          <Button size="sm" variant="gradient" className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" />New Campaign
          </Button>
        </div>
      </div>

      {/* Campaign list */}
      <div className="space-y-2.5">
        {filtered.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="px-5 py-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200 cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4 text-white/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white/85 truncate">{c.name}</p>
                    <Badge variant={c.status === 'active' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'} className="text-[10px] shrink-0">
                      {c.status}
                    </Badge>
                    <span className={`text-[11px] font-semibold shrink-0 ${channelColors[c.channel] || 'text-white/40'}`}>{c.channel}</span>
                  </div>
                  <p className="text-[11px] text-white/30 font-medium">{c.start} → {c.end}</p>
                </div>

                <div className="hidden md:flex items-center gap-8 shrink-0 mr-2">
                  {[
                    { label: 'Budget', value: `$${c.budget.toLocaleString()}` },
                    { label: 'Spent', value: `$${c.spent.toLocaleString()}` },
                    { label: 'Leads', value: c.leads.toString() },
                    { label: 'ROI', value: c.roi > 0 ? `${c.roi}%` : '—', highlight: c.roi > 0 },
                  ].map((m) => (
                    <div key={m.label} className="text-center min-w-[52px]">
                      <p className={`text-sm font-bold tabular-nums ${m.highlight ? 'text-emerald-400' : 'text-white/70'}`}>{m.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5 font-medium">{m.label}</p>
                    </div>
                  ))}
                </div>

                {c.budget > 0 && (
                  <div className="hidden lg:flex items-center gap-2 w-28 shrink-0">
                    <Progress value={(c.spent / c.budget) * 100} className="flex-1 h-1" />
                    <span className="text-[10px] text-white/30 tabular-nums w-8 text-right">{Math.round((c.spent / c.budget) * 100)}%</span>
                  </div>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35 hover:text-white/70"><Eye className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35 hover:text-white/70">
                    {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35 hover:text-white/70"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
