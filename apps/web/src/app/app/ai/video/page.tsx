'use client'

import { useState } from 'react'

import { PageHeader } from '@/components/kit'
import { Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

/**
 * AI video generation.
 *
 * The form and request path are complete; until a video provider is configured
 * the API answers 409 and the page shows the "provider not configured" banner.
 */
export default function AiVideoPage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      await api.post('/ai/video', { prompt: prompt.trim() })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="AI Video" subtitle="Generate short video clips from a text prompt" />


      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field label="Describe the video">
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. A slow dolly shot across a sunlit modern office, 5 seconds"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <button
          className="btn primary"
          onClick={() => void generate()}
          disabled={loading || !prompt.trim()}
        >
          {loading ? 'Generating…' : 'Generate video'}
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
