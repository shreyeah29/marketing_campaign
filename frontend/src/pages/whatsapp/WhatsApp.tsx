import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Phone, CheckCheck, Plus, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { whatsappApi } from '@/services/api'

const quickReplies = [
  'Book free consultation →',
  'Send property checklist 📋',
  'Schedule callback',
  'Share our services 📄',
]

export function WhatsApp() {
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConv, setActiveConv] = useState<any | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [sending, setSending] = useState(false)

  const load = async () => {
    try {
      const list = await whatsappApi.conversations()
      setConversations(list || [])
      if (list?.length) {
        const first = list[0] as any
        setActiveConv(first)
        const raw = Array.isArray(first.messages) ? first.messages : []
        const msgs = raw.map((m: any) => ({
          from: m.from,
          text: m.text,
          time: m.at || m.time || '',
        }))
        setMessages(msgs)
      }
    } catch (err) {
      console.error(err)
      setConversations([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selectConv = (conv: any) => {
    setActiveConv(conv)
    setMessages(
      (conv.messages || []).map((m: any) => ({
        from: m.from,
        text: m.text,
        time: m.at || m.time || '',
      }))
    )
  }

  const sendMessage = async () => {
    if (!message.trim() || !activeConv || sending) return
    setSending(true)
    const text = message
    setMessage('')
    setMessages((prev) => [...prev, { from: 'us', text, time: 'Now' }])
    try {
      const updated = await whatsappApi.send({
        conversationId: String(activeConv.id),
        phone: activeConv.phone,
        text,
      }) as any
      if (updated) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConv.id ? { ...c, ...updated } : c))
        )
        setActiveConv((prev: any) => (prev ? { ...prev, ...updated } : prev))
        if (updated.messages) {
          setMessages(
            updated.messages.map((m: any) => ({
              from: m.from,
              text: m.text,
              time: m.at || m.time || '',
            }))
          )
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (!activeConv) {
    return (
      <div className="p-6 h-[calc(100vh-64px-48px)] flex items-center justify-center text-white/40 text-sm">
        No conversations yet
      </div>
    )
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
                onClick={() => selectConv(conv)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                  activeConv.id === conv.id ? 'bg-indigo-500/15 border border-indigo-500/30' : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="relative">
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="text-xs">{(conv.name || '?').charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                    conv.status === 'online' ? 'bg-emerald-500' : conv.status === 'away' ? 'bg-amber-500' : 'bg-white/20'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white/80 truncate">{conv.name}</p>
                    <span className="text-[10px] text-white/35 shrink-0">{conv.lastAt || conv.time}</span>
                  </div>
                  <p className="text-[11px] text-white/40 truncate">{conv.lastMessage || conv.last}</p>
                </div>
                {Number(conv.unread) > 0 && (
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
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.08]">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs">{(activeConv.name || '?').charAt(0)}</AvatarFallback>
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
                      : 'bg-white/5 border border-white/[0.08] text-white/70 rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-white/35">{msg.time}</span>
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
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/[0.10] text-white/50 hover:text-white/80 hover:border-white/20 transition-colors"
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
          <Button onClick={sendMessage} size="icon" variant="gradient" disabled={sending}><Send className="w-4 h-4" /></Button>
        </div>
      </Card>
    </div>
  )
}
