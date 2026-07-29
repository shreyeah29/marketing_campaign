import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, Plus, TrendingUp, DollarSign, Users, Search, Filter, MoreHorizontal, Play, Pause, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Dialog, Field } from '@/components/ui/dialog'
import { campaignsApi } from '@/services/api'

const channelColors: Record<string, string> = {
  Facebook: 'text-blue-400',
  'Google Ads': 'text-yellow-400',
  LinkedIn: 'text-sky-400',
  Email: 'text-cyan-400',
  Instagram: 'text-pink-400',
  WhatsApp: 'text-emerald-400',
  YouTube: 'text-red-400',
}

const channels = ['Facebook', 'Google Ads', 'LinkedIn', 'Email', 'Instagram', 'WhatsApp', 'YouTube']

export function Campaigns() {
  const [search, setSearch] = useState('')
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', channel: 'Facebook', budget: '1000' })

  const load = async (q?: string) => {
    try {
      const list = await campaignsApi.list(q || undefined)
      setCampaigns(list || [])
    } catch (err) {
      console.error(err)
      setCampaigns([])
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const toggleStatus = async (c: any) => {
    const next = c.status === 'active' ? 'paused' : 'active'
    try {
      const updated = await campaignsApi.updateStatus(String(c.id), next) as any
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim() || creating) return
    setCreating(true)
    try {
      const created = await campaignsApi.create({
        name: form.name.trim(),
        channel: form.channel,
        budget: Number(form.budget) || 0,
      }) as any
      setCampaigns((prev) => [created, ...prev])
      setOpen(false)
      setForm({ name: '', channel: 'Facebook', budget: '1000' })
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  const total = {
    budget: campaigns.reduce((a, c) => a + Number(c.budget || 0), 0),
    spent: campaigns.reduce((a, c) => a + Number(c.spent || 0), 0),
    leads: campaigns.reduce((a, c) => a + Number(c.leads || 0), 0),
    conversions: campaigns.reduce((a, c) => a + Number(c.conversions || 0), 0),
  }

  return (
    <div className="p-6 space-y-5">
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

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5">
            <Filter className="w-3.5 h-3.5" />Filter
          </Button>
          <Button size="sm" variant="gradient" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5" />New Campaign
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {campaigns.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="px-5 py-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200">
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
                    { label: 'Budget', value: `$${Number(c.budget || 0).toLocaleString()}` },
                    { label: 'Spent', value: `$${Number(c.spent || 0).toLocaleString()}` },
                    { label: 'Leads', value: String(c.leads || 0) },
                    { label: 'ROI', value: Number(c.roi) > 0 ? `${c.roi}%` : '—', highlight: Number(c.roi) > 0 },
                  ].map((m) => (
                    <div key={m.label} className="text-center min-w-[52px]">
                      <p className={`text-sm font-bold tabular-nums ${m.highlight ? 'text-emerald-400' : 'text-white/70'}`}>{m.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5 font-medium">{m.label}</p>
                    </div>
                  ))}
                </div>
                {Number(c.budget) > 0 && (
                  <div className="hidden lg:flex items-center gap-2 w-28 shrink-0">
                    <Progress value={(Number(c.spent) / Number(c.budget)) * 100} className="flex-1 h-1" />
                    <span className="text-[10px] text-white/30 tabular-nums w-8 text-right">{Math.round((Number(c.spent) / Number(c.budget)) * 100)}%</span>
                  </div>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35"><Eye className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35" onClick={() => toggleStatus(c)}>
                    {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/35"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
        {campaigns.length === 0 && (
          <Card className="p-10 text-center text-sm text-white/35">No campaigns yet. Click New Campaign to create one.</Card>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Create campaign" description="Add a new marketing campaign to your workspace.">
        <div className="space-y-3.5">
          <Field label="Campaign name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="NRI Dallas Lead Gen" />
          </Field>
          <Field label="Channel">
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className="flex h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 text-sm text-white"
            >
              {channels.map((c) => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
            </select>
          </Field>
          <Field label="Budget (USD)">
            <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="gradient" className="flex-1" onClick={handleCreate} disabled={creating || !form.name.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
