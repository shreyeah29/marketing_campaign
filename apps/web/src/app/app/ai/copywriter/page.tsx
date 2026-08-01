'use client'

import { useState } from 'react'

import { PageHeader } from '@/components/kit'
import { Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const TONES = ['Professional', 'Friendly', 'Playful', 'Persuasive', 'Bold', 'Empathetic']
const FORMATS = [
  'Email',
  'Landing page',
  'Social post',
  'Ad copy',
  'Product description',
  'Blog intro',
]

/**
 * AI copywriter.
 *
 * A prompt + tone + format form that calls `/ai/generate`. With no LLM provider
 * configured the API answers 409 and the page shows a "provider not configured"
 * banner instead of an error.
 */
export default function CopywriterPage() {
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState(TONES[0] ?? '')
  const [format, setFormat] = useState(FORMATS[0] ?? '')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.post<{ content: string }>('/ai/generate', {
        prompt: prompt.trim(),
        tone,
        format,
      })
      setResult(res.content)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="AI Copywriter" subtitle="Generate on-brand marketing copy" />

      <div className="cols-2 grid" style={{ gap: 22, marginTop: 14 }}>
        <div className="card">
          <Field label="What do you need written?">
            <textarea
              className="input"
              rows={6}
              placeholder="e.g. A launch announcement for our new analytics dashboard"
              value={prompt}
              disabled={loading}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>
          <Field label="Tone">
            <select
              className="select"
              value={tone}
              disabled={loading}
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              className="select"
              value={format}
              disabled={loading}
              onChange={(e) => setFormat(e.target.value)}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn primary"
            onClick={() => void generate()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Generating…' : 'Generate copy'}
          </button>
          {error ? (
            <div className="banner error" style={{ marginTop: 14 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Result</h3>
          {result ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{result}</div>
          ) : (
            <p className="muted">Your generated copy will appear here.</p>
          )}
        </div>
      </div>
    </>
  )
}
