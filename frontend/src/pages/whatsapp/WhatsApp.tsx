import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Phone, CheckCheck, Plus, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const conversations = [
  { id: 1, name: 'Priya Sharma', last: 'Yes, I\'m interested in the consultation', time: '2m ago', unread: 2, status: 'online' },
  { id: 2, name: 'Rajesh Kumar', last: 'Can we schedule for tomorrow 3pm?', time: '15m ago', unread: 0, status: 'away' },
  { id: 3, name: 'Anita Patel', last: 'Thank you for the information!', time: '1h ago', unread: 0, status: 'offline' },
  { id: 4, name: 'Suresh Mehta', last: 'I have a property dispute case...', time: '3h ago', unread: 1, status: 'online' },
  { id: 5, name: 'Deepa Nair', last: 'Appointment confirmed for Aug 2', time: 'Yesterday', unread: 0, status: 'offline' },
]

const mockMessages = [
  { from: 'them', text: 'Hello, I saw your ad about NRI property services. I have a question.', time: '10:32 AM' },
  { from: 'us', text: 'Namaste! 🙏 I\'m Priya from VSP Law Associates. Happy to help! What\'s your question?', time: '10:33 AM' },
  { from: 'them', text: 'I own property in Mumbai but live in Dallas. My cousin is claiming he has rights to it. What should I do?', time: '10:35 AM' },
  { from: 'us', text: 'I understand this must be stressful. This is actually a common issue we help NRIs with. To protect your property, the first step is to have a registered Power of Attorney with a trusted person in India.\n\nWould you like to book a free 30-minute consultation to discuss your specific case?', time: '10:36 AM' },
  { from: 'them', text: 'Yes, I\'m interested in the consultation', time: '10:37 AM' },
]

const quickReplies = [
  'Book free consultation →',
  'Send property checklist 📋',
  'Schedule callback',
  'Share our services 📄',
]

export function WhatsApp() {
  const [activeConv, setActiveConv] = useState(conversations[0])
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState(mockMessages)

  const sendMessage = () => {
    if (!message.trim()) return
    setMessages([...messages, { from: 'us', text: message, time: 'Now' }])
    setMessage('')
  }

  return (
    <div className="p-6 h-[calc(100vh-64px-48px)] flex gap-4">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/70">Conversations</h3>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><Plus className="w-3 h-3" />New</Button>
        </div>
        <Input placeholder="Search conversations..." className="h-8 text-xs" />
        <ScrollArea className="flex-1">
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                  activeConv.id === conv.id ? 'bg-indigo-500/15 border border-indigo-500/30' : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="relative">
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="text-xs">{conv.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                    conv.status === 'online' ? 'bg-emerald-500' : conv.status === 'away' ? 'bg-amber-500' : 'bg-white/20'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white/80 truncate">{conv.name}</p>
                    <span className="text-[10px] text-white/30 shrink-0">{conv.time}</span>
                  </div>
                  <p className="text-[11px] text-white/40 truncate">{conv.last}</p>
                </div>
                {conv.unread > 0 && (
                  <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-white font-bold shrink-0">
                    {conv.unread}
                  </div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Campaign builder quick access */}
        <Card className="p-3">
          <p className="text-xs font-semibold text-white/50 mb-2">Quick Actions</p>
          <div className="space-y-1.5">
            <Button size="sm" variant="outline" className="w-full h-7 text-xs justify-start gap-2">
              <Users className="w-3 h-3" />Broadcast Campaign
            </Button>
            <Button size="sm" variant="outline" className="w-full h-7 text-xs justify-start gap-2">
              <Zap className="w-3 h-3" />Auto-reply Rules
            </Button>
          </div>
        </Card>
      </div>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/8">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs">{activeConv.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/80">{activeConv.name}</p>
            <p className="text-[11px] text-emerald-400">Online</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"><Phone className="w-3 h-3" />Call</Button>
            <Badge variant="default" className="text-[10px]">Lead</Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex ${msg.from === 'us' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.from === 'us'
                      ? 'bg-indigo-600/30 border border-indigo-500/30 text-white/80 rounded-tr-sm'
                      : 'bg-white/5 border border-white/8 text-white/70 rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-white/30">{msg.time}</span>
                    {msg.from === 'us' && <CheckCheck className="w-3 h-3 text-indigo-400" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>

        {/* Quick replies */}
        <div className="px-4 pt-2 flex gap-2 flex-wrap">
          {quickReplies.map((r) => (
            <button
              key={r}
              onClick={() => setMessage(r)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
            >
              {r}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button onClick={sendMessage} size="icon" variant="gradient"><Send className="w-4 h-4" /></Button>
        </div>
      </Card>
    </div>
  )
}
