'use client'

import { useState } from 'react'

import { PageHeader, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const

/**
 * AI voice synthesis — a built-in service. No setup, no provider, no keys: it just
 * works for every organisation on the platform's managed AI.
 */
export default function AiVoicePage() {
  const toast = useToast()
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<string>(VOICES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audio, setAudio] = useState<string | null>(null)

  async function synthesize() {
    const value = text.trim()
    if (!value || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ audio: string }>('/ai/voice', { text: value, voice })
      setAudio(res.audio)
      toast.push('success', 'Speech generated')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Synthesis failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="AI Voice" subtitle="Turn text into natural-sounding speech" />

      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field label="Text to speak">
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. Welcome to our platform. Let's get your workspace set up."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Voice">
          <select
            className="input"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={loading}
          >
            {VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="btn primary"
          onClick={() => void synthesize()}
          disabled={loading || !text.trim()}
        >
          {loading ? <Spinner /> : 'Synthesise voice'}
        </button>
        {error ? (
          <div className="banner error" style={{ marginTop: 14 }}>
            {error}
          </div>
        ) : null}

        {audio ? (
          <div style={{ marginTop: 16 }}>
            <audio controls src={audio} style={{ width: '100%' }} />
            <div style={{ marginTop: 10 }}>
              <a className="btn" href={audio} download="ai-voice.mp3">
                Download
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
