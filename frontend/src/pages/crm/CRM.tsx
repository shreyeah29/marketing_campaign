import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Building2, Star, DollarSign, Plus, Search, Filter, ArrowRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { leadsApi } from '@/services/api'

const statusColor: Record<string, string> = {
  new: 'secondary',
  contacted: 'default',
  qualified: 'warning',
  proposal: 'default',
  won: 'success',
  lost: 'destructive',
}

export function CRM() {
  const [searchTerm, setSearchTerm] = useState('')
  const [leads, setLeads] = useState<any[]>([])
  const [pipelineStages, setPipelineStages] = useState<any[]>([])
  const [stats, setStats] = useState<Record<string, any>>({})
  const [creating, setCreating] = useState(false)

  const load = async (search?: string) => {
    try {
      const [listRes, pipe] = await Promise.all([
        leadsApi.list({ search: search || undefined }),
        leadsApi.pipeline(),
      ])
      setLeads(listRes?.data || [])
      setPipelineStages(pipe?.stages || [])
      setStats(pipe?.stats || {})
    } catch (err) {
      console.error(err)
      setLeads([])
      setPipelineStages([])
      setStats({})
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(searchTerm), 250)
    return () => clearTimeout(t)
  }, [searchTerm])

  const handleAddLead = async () => {
    if (creating) return
    setCreating(true)
    try {
      await leadsApi.create({
        name: 'New Lead',
        email: `lead${Date.now()}@example.com`,
        source: 'Manual',
      })
      await load(searchTerm)
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const maxCount = Math.max(...pipelineStages.map((s) => Number(s.count) || 0), 1)

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'Total Leads', value: String(stats.totalLeads ?? leads.length), color: 'text-indigo-400', bg: 'bg-indigo-500/[0.1]', border: 'border-indigo-500/[0.18]' },
          { icon: Building2, label: 'Companies', value: String(stats.companies ?? '—'), color: 'text-violet-400', bg: 'bg-violet-500/[0.1]', border: 'border-violet-500/[0.18]' },
          { icon: DollarSign, label: 'Pipeline Value', value: String(stats.pipelineValue ?? '—'), color: 'text-emerald-400', bg: 'bg-emerald-500/[0.1]', border: 'border-emerald-500/[0.18]' },
          { icon: Star, label: 'Avg Lead Score', value: String(stats.avgScore ?? '—'), color: 'text-amber-400', bg: 'bg-amber-500/[0.1]', border: 'border-amber-500/[0.18]' },
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

      {/* Pipeline */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Sales Pipeline</h3>
          <span className="text-xs text-white/35">Total: {stats.pipelineValue ?? '—'}</span>
        </div>
        <div className="flex items-end gap-2 h-24">
          {pipelineStages.map((stage, i) => {
            const height = (Number(stage.count) / maxCount) * 100
            return (
              <div key={stage.name} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-white/40">{stage.count}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className={`w-full rounded-t-lg ${stage.color || 'bg-indigo-500'} opacity-80`}
                />
                <span className="text-[10px] text-white/35 text-center leading-tight">{stage.name}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <Tabs defaultValue="leads">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Filter className="w-3 h-3" />Filter</Button>
            <Button size="sm" variant="gradient" className="h-8 text-xs gap-1.5" onClick={handleAddLead} disabled={creating}>
              <Plus className="w-3 h-3" />Add Lead
            </Button>
          </div>
        </div>

        <TabsContent value="leads">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Name', 'Company', 'Status', 'Score', 'Value', 'Source', 'Date', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-white/35 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="text-xs">{(lead.name || '?').charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-medium text-white/80">{lead.name}</p>
                            <p className="text-[10px] text-white/35">{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">{lead.company}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColor[lead.status] as any} className="text-[10px] capitalize">{lead.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={Number(lead.score || 0)} className="w-12 h-1" />
                          <span className="text-xs text-white/50">{lead.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-white/70">${Number(lead.value || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-white/40">{lead.source}</td>
                      <td className="px-4 py-3 text-xs text-white/35">{lead.date}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <ArrowRight className="w-3.5 h-3.5 text-white/35" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/[0.1] border border-indigo-500/[0.18] flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-white/60 mb-1">1,284 contacts synced</p>
            <p className="text-xs text-white/30 mb-5">All contacts across campaigns, imports and CRM forms</p>
            <Button size="sm" variant="gradient" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add Contact</Button>
          </Card>
        </TabsContent>

        <TabsContent value="companies">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: 'TechCorp Inc', contacts: 4, value: '$48,200' },
              { name: 'Mehta Consulting', contacts: 2, value: '$31,500' },
              { name: 'Patel & Sons', contacts: 3, value: '$22,800' },
              { name: 'NRI Capital LLC', contacts: 5, value: '$67,400' },
              { name: 'Sharma Properties', contacts: 1, value: '$14,900' },
            ].map((company, i) => (
              <Card key={i} className="p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/[0.1] border border-indigo-500/[0.18] flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/80">{company.name}</p>
                    <p className="text-[11px] text-white/35">{company.contacts} contacts</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/30 font-medium">Pipeline value</span>
                  <span className="text-sm font-bold text-white tabular-nums">{company.value}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="deals">
          <Card className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/[0.1] border border-emerald-500/[0.18] flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white/60 mb-1">67 active deals · {stats.pipelineValue ?? '$539K'} pipeline</p>
            <p className="text-xs text-white/30 mb-5">Track all opportunities across your sales pipeline</p>
            <Button size="sm" variant="gradient" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add Deal</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
