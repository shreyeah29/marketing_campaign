'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { Icon } from '@/components/icon'
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
  | { status: 'error' }

export default function PublicLandingPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    api
      .get<PublicPage>(`/public/pages/${slug}`)
      .then((page) => {
        setState({ status: 'ready', page })
        const docTitle = page.seoTitle ?? page.title ?? page.name
        if (docTitle) document.title = docTitle
      })
      .catch((e: unknown) => {
        // A 404 is permanent (unpublished/deleted); anything else is transient.
        if (e instanceof ApiError && e.status === 404) setState({ status: 'missing' })
        else setState({ status: 'error' })
      })
  }, [slug])

  useEffect(load, [load])

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
        <div style={{ marginBottom: 12 }}>
          <Icon name="search" size={40} />
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>This page is not available</h1>
        <p style={{ color: '#666', marginTop: 8 }}>
          The page you are looking for may have been unpublished or removed.
        </p>
      </main>
    )
  }

  if (state.status === 'error') {
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
        <div style={{ marginBottom: 12 }}>
          <Icon name="alert-triangle" size={40} />
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Couldn&apos;t load this page</h1>
        <p style={{ color: '#666', margin: '8px 0 16px' }}>
          Please check your connection and try again.
        </p>
        <button
          onClick={load}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#4f46e5',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Retry
        </button>
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
