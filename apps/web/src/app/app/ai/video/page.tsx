'use client'

import { useState } from 'react'

import { PageHeader, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { CreativeLibrary } from '@/components/creative-library'
import { ApiError, api } from '@/lib/api'

interface GeneratedVideo {
  src: string
  prompt: string
}

/**
 * Video Studio — text-to-video through the platform's managed Runway
 * integration, plus the permanent library of every campaign video.
 */
export default function AiVideoPage() {
  const toast = useToast()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])

  async function generate() {
    const text = prompt.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ url: string }>('/ai/video', { prompt: text })
      setVideos((prev) => [{ src: res.url, prompt: text }, ...prev])
      toast.push('success', 'Video generated')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Video Studio"
        subtitle="Generate short clips on demand — and browse every video the system has made for you."
      />

      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <Field
          label="Describe the video"
          hint="Generation takes up to a few minutes — the clip appears below when ready."
        >
          <textarea
            className="input"
            rows={5}
            placeholder="e.g. A slow pan across a warmly lit living room, lamps glowing at dusk"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
        </Field>
        <button
          className="btn primary"
          onClick={() => void generate()}
          disabled={loading || !prompt.trim()}
        >
          {loading ? (
            <>
              <Spinner /> Generating…
            </>
          ) : (
            'Generate video'
          )}
        </button>
        {error ? (
          <div className="banner error" style={{ marginTop: 14 }}>
            {error}
          </div>
        ) : null}
      </div>

      {videos.length > 0 ? (
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {videos.map((v, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <video src={v.src} controls style={{ width: '100%', borderRadius: 8 }} />
              <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                {v.prompt}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* The permanent record: every campaign video, with its approval fate. */}
      <h2 style={{ fontSize: 16, margin: '30px 0 4px' }}>Video library</h2>
      <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
        Every video generated for your campaigns — approved, rejected or published.
      </p>
      <CreativeLibrary type="video" />
    </>
  )
}
