'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { PageBlocks, type Block } from '@/components/page-blocks'

interface PublicPage {
  name: string
  title: string | null
  blocks: Block[]
  theme: unknown
  seoTitle: string | null
  seoDescription: string | null
  ogImageUrl: string | null
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; page: PublicPage }
  | { status: 'missing' }

export default function PublicLandingPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    api
      .get<PublicPage>(`/public/pages/${slug}`)
      .then((page) => {
        if (cancelled) return
        setState({ status: 'ready', page })
        const docTitle = page.seoTitle ?? page.title ?? page.name
        if (docTitle) document.title = docTitle
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) setState({ status: 'missing' })
        else setState({ status: 'missing' })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === 'loading') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#666',
        }}
      >
        Loading…
      </main>
    )
  }

  if (state.status === 'missing') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          color: '#111',
          background: '#fff',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <h1 style={{ fontSize: 24, margin: 0 }}>This page is not available</h1>
        <p style={{ color: '#666', marginTop: 8 }}>The page you are looking for may have been unpublished or removed.</p>
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#fff',
        color: '#111',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <PageBlocks blocks={Array.isArray(state.page.blocks) ? state.page.blocks : []} />
    </main>
  )
}
