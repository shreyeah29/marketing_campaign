'use client'

import { useRef, useState } from 'react'

import { PageHeader } from '@/components/kit'
import { Spinner } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * AI chat — a built-in assistant. No setup, no provider, no keys: it just works
 * for every organisation on the platform's managed AI.
 */
export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = streamRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setError(null)
    setSending(true)
    scrollToBottom()

    try {
      const res = await api.post<{ role: 'assistant'; content: string }>('/ai/chat', {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
      scrollToBottom()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <>
      <PageHeader title="AI Chat" subtitle="Your built-in AI assistant" />

      <div className="chat">
        <div className="stream" ref={streamRef}>
          {messages.length === 0 ? (
            <div className="msg assistant">
              Ask me anything — I can help with your marketing, copy and ideas.
            </div>
          ) : null}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending ? (
            <div className="msg assistant">
              <Spinner />
            </div>
          ) : null}
        </div>

        <div className="composer">
          <textarea
            className="input"
            placeholder="Send a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
          />
          <button
            className="btn primary"
            onClick={() => void send()}
            disabled={sending || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner error" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : null}
    </>
  )
}
