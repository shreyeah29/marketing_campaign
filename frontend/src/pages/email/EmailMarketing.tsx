import { motion } from 'framer-motion'
import { Mail, Send, Eye, MousePointer, UserMinus, Plus, Play, Pause, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const campaigns = [
  { name: 'NRI Welcome Series', status: 'active', sent: 1240, openRate: 42.3, clickRate: 12.8, bounceRate: 1.2, unsub: 0.3 },
  { name: 'Property Guide Drip', status: 'active', sent: 890, openRate: 38.7, clickRate: 9.4, bounceRate: 0.8, unsub: 0.2 },
  { name: 'Consultation Nurture', status: 'paused', sent: 440, openRate: 51.2, clickRate: 18.6, bounceRate: 0.5, unsub: 0.1 },
  { name: 'Re-engagement Campaign', status: 'draft', sent: 0, openRate: 0, clickRate: 0, bounceRate: 0, unsub: 0 },
]

const sequences = [
  { name: 'NRI Onboarding', emails: 5, active: 234, completed: 891, rate: 44 },
  { name: 'Lead Nurture — Property', emails: 8, active: 142, completed: 560, rate: 38 },
  { name: 'Post-Consultation Follow Up', emails: 3, active: 56, completed: 320, rate: 67 },
]

export function EmailMarketing() {
  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Send, label: 'Emails Sent (MTD)', value: '12,840', change: '+18%', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: Eye, label: 'Avg Open Rate', value: '41.2%', change: '+3.2%', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: MousePointer, label: 'Avg Click Rate', value: '11.8%', change: '+1.4%', color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { icon: UserMinus, label: 'Unsubscribe Rate', value: '0.24%', change: '-0.1%', color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat, i) => {
          const Icon = stat.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4">
                <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className="text-xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{stat.label}</p>
                <Badge variant="success" className="mt-2 text-[10px]">{stat.change}</Badge>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70">Email Campaigns</h3>
        <Button size="sm" variant="gradient" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          New Campaign
        </Button>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-3">
          {campaigns.map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/80">{c.name}</p>
                      <p className="text-xs text-white/35">{c.sent.toLocaleString()} emails sent</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === 'active' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'}>
                      {c.status}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7">
                      {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                {c.sent > 0 && (
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: 'Open Rate', value: c.openRate, suffix: '%', good: c.openRate > 35 },
                      { label: 'Click Rate', value: c.clickRate, suffix: '%', good: c.clickRate > 8 },
                      { label: 'Bounce', value: c.bounceRate, suffix: '%', good: c.bounceRate < 2 },
                      { label: 'Unsubscribe', value: c.unsub, suffix: '%', good: c.unsub < 0.5 },
                    ].map((m) => (
                      <div key={m.label}>
                        <p className="text-xs text-white/35 mb-1">{m.label}</p>
                        <p className={`text-sm font-bold ${m.good ? 'text-emerald-400' : 'text-amber-400'}`}>{m.value}{m.suffix}</p>
                        <Progress value={Math.min(m.value * 2, 100)} className="mt-1 h-1" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="sequences" className="space-y-3">
          {sequences.map((seq, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white/80">{seq.name}</p>
                  <p className="text-xs text-white/35 mt-0.5">{seq.emails} emails · {seq.active} active · {seq.completed} completed</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{seq.rate}%</p>
                  <p className="text-[10px] text-white/35">completion rate</p>
                </div>
              </div>
              <Progress value={seq.rate} className="mt-3" />
            </Card>
          ))}
          <Button variant="outline" className="w-full gap-2"><Plus className="w-4 h-4" />New Sequence</Button>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['Welcome Email', 'Follow-up Template', 'Newsletter Layout', 'Promotional Email', 'Transactional Template', 'Re-engagement'].map((t, i) => (
              <Card key={i} className="p-4 hover:border-indigo-500/30 transition-colors cursor-pointer">
                <div className="h-24 rounded-lg bg-gradient-to-b from-indigo-500/10 to-transparent border border-white/[0.06] mb-3 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-white/10" />
                </div>
                <p className="text-sm font-medium text-white/80">{t}</p>
                <Button size="sm" variant="outline" className="mt-2 w-full h-7 text-xs">Use Template</Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
