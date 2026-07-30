'use client'

import { useState } from 'react'

import { PageHeader } from '@/components/kit'
import { Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

/**
 * AI image generation.
 *
 * The form and request path are complete; until an image provider is configured
 * the API answers 409 and the page shows the "provider not configured" banner.
 */
export default function AiImagesPage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      await api.post('/ai/image', { prompt: prompt.trim() })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="AI Images" subtitle="Generate images from a text prompt" />


      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field label="Describe the image">
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. A minimalist product hero shot on a soft gradient background"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <button
          className="btn primary"
          onClick={() => void generate()}
          disabled={loading || !prompt.trim()}
        >
          {loading ? 'Generating…' : 'Generate image'}
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
