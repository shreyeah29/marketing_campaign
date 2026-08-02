'use client'

import { useState } from 'react'

import { PageHeader, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { CreativeLibrary } from '@/components/creative-library'
import { ApiError, api } from '@/lib/api'

interface GeneratedImage {
  src: string
  prompt: string
}

const SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const

/**
 * AI image generation — a built-in service. No setup, no provider, no keys: it
 * just works for every organisation on the platform's managed AI.
 */
export default function AiImagesPage() {
  const toast = useToast()
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<string>(SIZES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<GeneratedImage[]>([])

  async function generate() {
    const text = prompt.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ image?: string; url?: string }>('/ai/image', {
        prompt: text,
        size,
      })
      const src = res.image ?? res.url
      if (!src) {
        setError('No image was returned. Please try again.')
        return
      }
      setImages((prev) => [{ src, prompt: text }, ...prev])
      toast.push('success', 'Image generated')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Image Generation"
        subtitle="Generate images on demand — and browse every poster the system has made for you."
      />

      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field label="Describe the image">
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. A minimalist product hero shot on a soft gradient background"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
        </Field>
        <Field label="Size">
          <select
            className="input"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={loading}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="btn primary"
          onClick={() => void generate()}
          disabled={loading || !prompt.trim()}
        >
          {loading ? <Spinner /> : 'Generate image'}
        </button>
        {error ? (
          <div className="banner error" style={{ marginTop: 14 }}>
            {error}
          </div>
        ) : null}
      </div>

      {images.length > 0 ? (
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {images.map((img, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <img
                src={img.src}
                alt={img.prompt}
                style={{ width: '100%', borderRadius: 8, display: 'block' }}
              />
              <div style={{ marginTop: 10 }}>
                <a className="btn" href={img.src} download={`ai-image-${String(i + 1)}.png`}>
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The permanent record: every campaign image, with its approval fate. */}
      <h2 style={{ fontSize: 16, margin: '30px 0 4px' }}>Image library</h2>
      <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
        Every image generated for your campaigns — approved, rejected or published. What you approve
        shapes what gets made next.
      </p>
      <CreativeLibrary type="image" />
    </>
  )
}
