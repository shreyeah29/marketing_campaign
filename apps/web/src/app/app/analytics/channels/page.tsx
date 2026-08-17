'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, MetricTile, CardSkeleton } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { StatusPill } from '@/components/status'
import { PlatformIcon } from '@/components/platform-icon'

import { useAnalyticsFilters } from '../layout'

interface ChannelPerformance {
  email: { sent: number; opened: number; clicked: number }
  social: { platform: string; assets: number }[]
}

interface MetaSummary {
  impressions: number
  reach: number
  clicks: number
  leads: number
  activeCampaigns: number
  ctr: number
  leadsPer1kImpressions: number
}

function fromDate(days: string): string {
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10)
}

function num(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString()
}

function pct(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function rate(numVal: number, denom: number): string {
  if (denom <= 0) return '—'
  return `${Math.round((numVal / denom) * 1000) / 10}%`
}

function ChannelCard({
  platform,
  connected,
  children,
  hint,
}: {
  platform: string
  connected: boolean
  children?: ReactNode | undefined
  hint?: string | undefined
}) {
  return (
    <div className="card" style={{ padding: 16, opacity: connected ? 1 : 0.85 }}>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span style={{ opacity: connected ? 1 : 0.4, display: 'flex' }}>
            <PlatformIcon platform={platform} size={20} />
          </span>
          <span style={{ fontWeight: 600 }}>{platform}</span>
        </div>
        <StatusPill status={connected ? 'live' : 'draft'} />
      </div>
      {connected ? (
        children
      ) : (
        <EmptyState
          icon="link"
          title={`${platform} not connected`}
          hint={
            hint ??
            `Connect ${platform} in Connections to see performance metrics for this channel.`
          }
          action={
            <Link href="/app/connections" className="btn sm primary">
              Go to Connections
            </Link>
          }
        />
      )}
    </div>
  )
}

export default function AnalyticsChannelsPage() {
  const { days } = useAnalyticsFilters()
  const [channels, setChannels] = useState<ChannelPerformance | null>(null)
  const [meta, setMeta] = useState<MetaSummary | null | 'missing'>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const qs = `?from=${fromDate(days)}`
    Promise.all([
      api.get<ChannelPerformance>('/analytics/channel-performance'),
      api.get<MetaSummary>(`/meta/analytics/summary${qs}`).catch(() => 'missing' as const),
    ])
      .then(([ch, m]) => {
        setChannels(ch)
        setMeta(m)
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load channel performance'),
      )
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return <ErrorState message={error} onRetry={load} />
  }

  if (loading || !channels) {
    return <CardSkeleton count={3} />
  }

  const metaSummary = meta !== null && meta !== 'missing' ? meta : null

  const metaConnected =
    metaSummary !== null &&
    (metaSummary.impressions > 0 || metaSummary.clicks > 0 || metaSummary.leads > 0)

  const hasEmail =
    channels.email.sent > 0 || channels.email.opened > 0 || channels.email.clicked > 0

  const socialPlatforms = channels.social.filter((s) => s.assets > 0)

  const nothingConnected = !metaConnected && !hasEmail && socialPlatforms.length === 0

  if (nothingConnected) {
    return (
      <FadeIn>
        <EmptyState
          icon="share"
          title="No channel data yet"
          hint="Connect Meta in Connections and publish from email or social — each channel shows its own metrics once data flows."
          action={
            <Link href="/app/connections" className="btn primary">
              Connect a channel
            </Link>
          }
        />
      </FadeIn>
    )
  }

  return (
    <FadeIn>
      <p className="dim" style={{ fontSize: 12, margin: '0 0 16px' }}>
        Each channel uses the metrics that fit it — Meta from ad delivery, email from sends, social
        from published assets. Last {days} days where noted.
      </p>

      <div className="stack" style={{ gap: 16 }}>
        <ChannelCard
          platform="Meta"
          connected={metaConnected}
          hint="Connect your Facebook or Instagram ad account to see spend, CTR, and lead metrics."
        >
          {metaSummary && metaConnected ? (
            <Stagger className="cols-3 grid" style={{ gap: 12 }} interval={0.04}>
              <StaggerItem>
                <MetricTile label="Impressions" value={num(metaSummary.impressions)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="Reach" value={num(metaSummary.reach)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="CTR" value={pct(metaSummary.ctr)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="Leads" value={num(metaSummary.leads)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="Clicks" value={num(metaSummary.clicks)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile
                  label="Leads per 1,000 impressions"
                  value={
                    typeof metaSummary.leadsPer1kImpressions === 'number'
                      ? metaSummary.leadsPer1kImpressions.toFixed(2)
                      : '—'
                  }
                />
              </StaggerItem>
            </Stagger>
          ) : null}
        </ChannelCard>

        <ChannelCard
          platform="Email"
          connected={hasEmail}
          hint="Send campaigns from Marketing → Email — open and click rates appear after your first send."
        >
          {hasEmail ? (
            <Stagger className="cols-3 grid" style={{ gap: 12 }} interval={0.04}>
              <StaggerItem>
                <MetricTile label="Sent" value={num(channels.email.sent)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile
                  label="Open rate"
                  value={rate(channels.email.opened, channels.email.sent)}
                />
              </StaggerItem>
              <StaggerItem>
                <MetricTile
                  label="Click rate"
                  value={rate(channels.email.clicked, channels.email.sent)}
                />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="Opened" value={num(channels.email.opened)} />
              </StaggerItem>
              <StaggerItem>
                <MetricTile label="Clicked" value={num(channels.email.clicked)} />
              </StaggerItem>
            </Stagger>
          ) : null}
        </ChannelCard>

        {socialPlatforms.length > 0
          ? socialPlatforms.map((s) => (
              <ChannelCard key={s.platform} platform={s.platform} connected>
                <MetricTile label="Published assets" value={num(s.assets)} />
                <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>
                  Asset count from /analytics/channel-performance for this workspace.
                </p>
              </ChannelCard>
            ))
          : channels.social.map((s) => (
              <ChannelCard
                key={s.platform}
                platform={s.platform}
                connected={false}
                hint={`Publish ${s.platform} assets from a campaign to see counts here.`}
              />
            ))}
      </div>
    </FadeIn>
  )
}
