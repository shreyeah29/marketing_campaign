'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { Spinner } from '@/components/ui'

interface ChannelPerformance {
  email: { sent: number; opened: number; clicked: number }
  social: { platform: string; assets: number }[]
}

/** Channels analytics — uses existing /analytics/channel-performance only. */
export default function AnalyticsChannelsPage() {
  const [data, setData] = useState<ChannelPerformance | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setError(null)
    api
      .get<ChannelPerformance>('/analytics/channel-performance')
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load channel performance'),
      )
  }

  useEffect(load, [])

  if (error) {
    return (
      <>
        <PageHeader title="Channels" subtitle="Performance by channel." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  if (!data) {
    return (
      <div className="row" style={{ gap: 8, padding: 24 }}>
        <Spinner />
        <span className="dim">Loading…</span>
      </div>
    )
  }

  const hasSocial = data.social.length > 0
  const hasEmail = data.email.sent > 0 || data.email.opened > 0 || data.email.clicked > 0

  if (!hasSocial && !hasEmail) {
    return (
      <FadeIn>
        <PageHeader title="Channels" subtitle="Performance by channel." />
        <EmptyState
          icon="share"
          title="No channel data yet"
          hint="Publish or send from connected channels — counts from /analytics/channel-performance will show here."
        />
      </FadeIn>
    )
  }

  return (
    <FadeIn>
      <PageHeader title="Channels" subtitle="From /analytics/channel-performance." />
      <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
        {hasEmail ? (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 10 }}>Email</h3>
            <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Sent
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22 }}>
                  {data.email.sent}
                </div>
              </div>
              <div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Opened
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22 }}>
                  {data.email.opened}
                </div>
              </div>
              <div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Clicked
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22 }}>
                  {data.email.clicked}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {hasSocial
          ? data.social.map((s) => (
              <div
                key={s.platform}
                className="card"
                style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <PlatformIcon platform={s.platform} size={18} />
                <div style={{ flex: 1, fontWeight: 600 }}>{s.platform}</div>
                <div className="dim" style={{ fontFamily: 'var(--font-mono)' }}>
                  {s.assets} assets
                </div>
              </div>
            ))
          : null}
      </div>
    </FadeIn>
  )
}
