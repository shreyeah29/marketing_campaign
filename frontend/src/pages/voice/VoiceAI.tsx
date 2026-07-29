import { motion } from 'framer-motion'
import { Phone, PhoneCall, Clock, CheckCircle2, XCircle, Calendar, Mic, Play } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const callHistory = [
  {
    id: 1, name: 'Priya Sharma', phone: '+1 (469) 555-0123', duration: '8:42',
    status: 'completed', disposition: 'Appointment Booked', date: 'Jul 29, 2:30 PM',
    transcript: 'AI: Hello, may I speak with Priya Sharma?\nProspect: Yes, speaking.\nAI: Hi Priya, this is Aria calling from VSP Law Associates. I understand you submitted a form about NRI property services...',
    summary: 'Prospect has property dispute in Mumbai. Interested in legal help. Appointment booked for Aug 2 at 10 AM IST.',
    appointmentStatus: 'booked',
    score: 87,
  },
  {
    id: 2, name: 'Rajesh Kumar', phone: '+1 (214) 555-0456', duration: '5:18',
    status: 'completed', disposition: 'Callback Requested', date: 'Jul 29, 11:00 AM',
    transcript: 'AI: Hello, may I speak with Rajesh Kumar?\nProspect: Yes, who is this?\nAI: Hi Rajesh, this is Aria from VSP Law Associates...',
    summary: 'Prospect is busy, requested callback tomorrow 3pm CST. Has NRI visa/OCI question.',
    appointmentStatus: 'callback',
    score: 62,
  },
  {
    id: 3, name: 'Anita Verma', phone: '+1 (972) 555-0789', duration: '2:04',
    status: 'voicemail', disposition: 'Left Voicemail', date: 'Jul 28, 4:15 PM',
    transcript: '[Voicemail left] "Hi Anita, this is Aria from VSP Law Associates calling about your inquiry regarding NRI legal services..."',
    summary: 'No answer. Left professional voicemail. Scheduled automated SMS follow-up.',
    appointmentStatus: 'pending',
    score: 0,
  },
]

const upcomingCalls = [
  { name: 'Suresh Mehta', time: 'Today, 4:00 PM', type: 'Callback', priority: 'high' },
  { name: 'Deepa Nair', time: 'Jul 30, 11:00 AM', type: 'New Lead', priority: 'medium' },
  { name: 'Mohan Reddy', time: 'Jul 31, 2:00 PM', type: 'Follow-up', priority: 'low' },
]

export function VoiceAI() {
  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: PhoneCall, label: 'Calls Made Today', value: '34', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: CheckCircle2, label: 'Appointments Booked', value: '8', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: Clock, label: 'Avg Call Duration', value: '6:24', color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { icon: Phone, label: 'Connection Rate', value: '68%', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="history">
            <TabsList>
              <TabsTrigger value="history">Call History</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming Calls</TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="space-y-4">
              {callHistory.map((call, i) => (
                <motion.div key={call.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}>
                  <Card className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          call.status === 'completed' ? 'bg-emerald-500/15' : 'bg-amber-500/15'
                        }`}>
                          {call.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-amber-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/80">{call.name}</p>
                          <p className="text-xs text-white/30">{call.phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={call.appointmentStatus === 'booked' ? 'success' : call.appointmentStatus === 'callback' ? 'warning' : 'secondary'}>
                          {call.disposition}
                        </Badge>
                        <p className="text-[10px] text-white/30 mt-1">{call.date}</p>
                      </div>
                    </div>

                    {/* Transcript preview */}
                    <div className="bg-black/20 rounded-lg p-3 mb-3 border border-white/6">
                      <div className="flex items-center gap-2 mb-2">
                        <Mic className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs font-medium text-white/50">Conversation Transcript</span>
                        <span className="ml-auto text-[10px] text-white/30">Duration: {call.duration}</span>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed line-clamp-3 font-mono">{call.transcript}</p>
                    </div>

                    {/* Summary */}
                    <div className="p-3 rounded-lg bg-indigo-500/8 border border-indigo-500/20">
                      <p className="text-[10px] font-semibold text-indigo-400 mb-1">AI SUMMARY</p>
                      <p className="text-xs text-white/60">{call.summary}</p>
                    </div>

                    {call.score > 0 && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs text-white/40">Lead Score</span>
                        <Progress value={call.score} className="flex-1 h-1.5" />
                        <span className="text-xs font-bold text-white/70">{call.score}/100</span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"><Play className="w-3 h-3" />Play Recording</Button>
                      {call.appointmentStatus !== 'booked' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"><Calendar className="w-3 h-3" />Book Appointment</Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </TabsContent>

            <TabsContent value="upcoming" className="space-y-3">
              {upcomingCalls.map((call, i) => (
                <Card key={i} className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white/80">{call.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">{call.type}</Badge>
                      <span className="text-xs text-white/30 flex items-center gap-1"><Clock className="w-3 h-3" />{call.time}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="gradient" className="h-7 text-xs gap-1.5">
                    <PhoneCall className="w-3 h-3" />Call Now
                  </Button>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Voice AI Config */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Voice AI Agent</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-400">Agent Online</span>
                </div>
                <span className="text-xs text-white/40">Aria v2.1</span>
              </div>
              {[
                { label: 'Voice', value: 'Aria — Professional' },
                { label: 'Language', value: 'English (US)' },
                { label: 'Script', value: 'NRI Legal Services' },
                { label: 'Caller ID', value: '+1 (469) 555-0100' },
              ].map((cfg) => (
                <div key={cfg.label} className="flex items-center justify-between">
                  <span className="text-xs text-white/30">{cfg.label}</span>
                  <span className="text-xs text-white/60 font-medium">{cfg.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Today's Performance</h3>
            <div className="space-y-3">
              {[
                { label: 'Calls Attempted', value: 50, current: 34 },
                { label: 'Connected', value: 34, current: 23 },
                { label: 'Qualified Leads', value: 23, current: 12 },
                { label: 'Appointments', value: 12, current: 8 },
              ].map((m, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/40">{m.label}</span>
                    <span className="text-xs font-bold text-white/70">{m.current}/{m.value}</span>
                  </div>
                  <Progress value={(m.current / m.value) * 100} className="h-1" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
