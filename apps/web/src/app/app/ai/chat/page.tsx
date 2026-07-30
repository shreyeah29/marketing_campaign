'use client'

import { useRef, useState } from 'react'

import { PageHeader, ProviderNotConfigured } from '@/components/kit'
import { Spinner } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * AI chat.
 *
 * Talks to the org's configured LLM through `/ai/chat`. With no provider set the
 * API answers 409 — the page shows a "provider not configured" banner and disables
 * the composer rather than failing. That graceful, key-less default is the point.
 */
export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
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
      if (e instanceof ApiError && e.status === 409) {
        setNotConfigured(true)
      } else {
        setError(e instanceof ApiError ? e.message : 'The message could not be sent.')
      }
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
      <PageHeader title="AI Chat" subtitle="Chat with your organisation's configured model" />

      <div className="chat">
        <div className="stream" ref={streamRef}>
          {messages.length === 0 && !notConfigured ? (
            <div className="msg assistant">
              Ask me anything — I use the language model configured for your organisation.
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

        {notConfigured ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
            <ProviderNotConfigured capability="LLM" />
          </div>
        ) : (
          <div className="composer">
            <textarea
              className="input"
              placeholder="Send a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
            />
            <button className="btn primary" onClick={() => void send()} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="banner error" style={{ marginTop: 14 }}>
          {error}
        </div>
      ) : null}
    </>
  )
}
