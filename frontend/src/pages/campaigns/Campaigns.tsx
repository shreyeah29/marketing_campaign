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
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Budget', value: `$${total.budget.toLocaleString()}`, icon: DollarSign, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Total Spent', value: `$${total.spent.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Total Leads', value: total.leads.toString(), icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Conversions', value: total.conversions.toString(), icon: Megaphone, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." className="pl-8 h-8 text-xs" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Filter className="w-3 h-3" />Filter</Button>
          <Button size="sm" variant="gradient" className="h-8 text-xs gap-1.5"><Plus className="w-3 h-3" />New Campaign</Button>
        </div>
      </div>

      {/* Campaign cards */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-5 hover:border-white/15 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5 text-white/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-white/80 truncate">{c.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={c.status === 'active' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'} className="text-[10px]">
                        {c.status}
                      </Badge>
                      <span className={`text-xs font-medium ${channelColors[c.channel] || 'text-white/50'}`}>{c.channel}</span>
                    </div>
                  </div>
                  <p className="text-xs text-white/30 mb-3">{c.start} → {c.end}</p>

                  <div className="grid grid-cols-4 gap-4 mb-3">
                    {[
                      { label: 'Budget', value: `$${c.budget.toLocaleString()}` },
                      { label: 'Spent', value: `$${c.spent.toLocaleString()}` },
                      { label: 'Leads', value: c.leads.toString() },
                      { label: 'ROI', value: c.roi > 0 ? `${c.roi}%` : '—' },
                    ].map((m) => (
                      <div key={m.label}>
                        <p className="text-xs text-white/30">{m.label}</p>
                        <p className={`text-sm font-bold ${m.label === 'ROI' && c.roi > 0 ? 'text-emerald-400' : 'text-white/70'}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  {c.budget > 0 && (
                    <div className="flex items-center gap-2">
                      <Progress value={(c.spent / c.budget) * 100} className="flex-1 h-1" />
                      <span className="text-[10px] text-white/30">{Math.round((c.spent / c.budget) * 100)}% spent</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"><Eye className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7">
                    {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
