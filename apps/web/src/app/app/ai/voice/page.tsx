'use client'

import { useState } from 'react'

import { PageHeader, ProviderNotConfigured } from '@/components/kit'
import { Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

/**
 * AI voice synthesis.
 *
 * The form and request path are complete; until a voice provider is configured
 * the API answers 409 and the page shows the "provider not configured" banner.
 */
export default function AiVoicePage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function synthesize() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      await api.post('/ai/voice', { prompt: prompt.trim() })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setNotConfigured(true)
      else setError(e instanceof ApiError ? e.message : 'Synthesis failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="AI Voice" subtitle="Turn text into natural-sounding speech" />

      {notConfigured ? <ProviderNotConfigured capability="voice" /> : null}

      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field label="Text to speak">
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. Welcome to our platform. Let's get your workspace set up."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <button
          className="btn primary"
          onClick={() => void synthesize()}
          disabled={loading || !prompt.trim() || notConfigured}
        >
          {loading ? 'Synthesising…' : 'Synthesise voice'}
        </button>
        {error ? (
          <div className="banner error" style={{ marginTop: 14 }}>
            {error}
          </div>
        ) : null}
      </div>
    </>
  )
}
