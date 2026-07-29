import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Building2, Star, DollarSign, Plus, Search, Filter, ArrowRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const leads = [
  { id: 1, name: 'Priya Sharma', email: 'priya@email.com', company: 'Self-employed', status: 'qualified', score: 87, value: 15000, source: 'Facebook Ad', date: 'Jul 29' },
  { id: 2, name: 'Rajesh Kumar', email: 'rajesh@techcorp.com', company: 'TechCorp Inc', status: 'contacted', score: 62, value: 8000, source: 'Google Ad', date: 'Jul 28' },
  { id: 3, name: 'Anita Patel', email: 'anita@gmail.com', company: 'Own Business', status: 'new', score: 45, value: 12000, source: 'WhatsApp', date: 'Jul 29' },
  { id: 4, name: 'Suresh Mehta', email: 'suresh@gmail.com', company: 'Mehta Consulting', status: 'proposal', score: 91, value: 25000, source: 'Referral', date: 'Jul 27' },
  { id: 5, name: 'Deepa Nair', email: 'deepa@nair.in', company: 'Nair Family Trust', status: 'won', score: 100, value: 18000, source: 'LinkedIn', date: 'Jul 25' },
]

const pipelineStages = [
  { name: 'New', count: 24, value: 180000, color: 'bg-white/20' },
  { name: 'Contacted', count: 18, value: 135000, color: 'bg-indigo-500' },
  { name: 'Qualified', count: 12, value: 96000, color: 'bg-violet-500' },
  { name: 'Proposal', count: 8, value: 76000, color: 'bg-cyan-500' },
  { name: 'Won', count: 5, value: 52000, color: 'bg-emerald-500' },
]

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

  const filtered = leads.filter((l) =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.company.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Total Leads', value: '248', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: Building2, label: 'Companies', value: '84', color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { icon: DollarSign, label: 'Pipeline Value', value: '$539K', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: Star, label: 'Avg Lead Score', value: '74', color: 'text-amber-400', bg: 'bg-amber-500/10' },
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

      {/* Pipeline */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Sales Pipeline</h3>
          <span className="text-xs text-white/30">Total: $539,000</span>
        </div>
        <div className="flex items-end gap-2 h-24">
          {pipelineStages.map((stage, i) => {
            const height = (stage.count / pipelineStages[0].count) * 100
            return (
              <div key={stage.name} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-white/40">{stage.count}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className={`w-full rounded-t-lg ${stage.color} opacity-80`}
                />
                <span className="text-[10px] text-white/30 text-center leading-tight">{stage.name}</span>
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Filter className="w-3 h-3" />Filter</Button>
            <Button size="sm" variant="gradient" className="h-8 text-xs gap-1.5"><Plus className="w-3 h-3" />Add Lead</Button>
          </div>
        </div>

        <TabsContent value="leads">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/6">
                    {['Name', 'Company', 'Status', 'Score', 'Value', 'Source', 'Date', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, i) => (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-white/4 hover:bg-white/3 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="text-xs">{lead.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-medium text-white/80">{lead.name}</p>
                            <p className="text-[10px] text-white/30">{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">{lead.company}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColor[lead.status] as any} className="text-[10px] capitalize">{lead.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={lead.score} className="w-12 h-1" />
                          <span className="text-xs text-white/50">{lead.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-white/70">${lead.value.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-white/40">{lead.source}</td>
                      <td className="px-4 py-3 text-xs text-white/30">{lead.date}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <ArrowRight className="w-3.5 h-3.5 text-white/30" />
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
          <Card className="p-8 text-center">
            <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">Contact database — 1,284 contacts across all campaigns</p>
            <Button size="sm" variant="gradient" className="mt-4 gap-1.5"><Plus className="w-3.5 h-3.5" />Add Contact</Button>
          </Card>
        </TabsContent>

        <TabsContent value="companies">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {['TechCorp Inc', 'Mehta Consulting', 'Patel & Sons', 'NRI Capital LLC', 'Sharma Properties'].map((company, i) => (
              <Card key={i} className="p-4 hover:border-white/15 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/80">{company}</p>
                    <p className="text-xs text-white/30">{Math.floor(Math.random() * 5 + 1)} contacts</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">Pipeline value</span>
                  <span className="text-sm font-bold text-white">${(Math.random() * 50000 + 5000).toFixed(0)}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="deals">
          <Card className="p-8 text-center">
            <TrendingUp className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">Deal pipeline — $539K across 67 active deals</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
