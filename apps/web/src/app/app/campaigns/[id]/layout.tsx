'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'
import { CampaignProvider, SaveTemplateButton, useCampaign } from '@/components/campaign-studio'

function CampaignTabs() {
  const { campaignId, campaign, loading, showPerformance } = useCampaign()
  const pathname = usePathname()
  const base = `/app/campaigns/${campaignId}`

  const tabs: { href: string; label: string; hide?: boolean }[] = [
    { href: `${base}/strategy`, label: 'Strategy' },
    { href: `${base}/assets`, label: 'Assets' },
    { href: `${base}/schedule`, label: 'Schedule' },
    { href: `${base}/performance`, label: 'Performance', hide: !showPerformance },
    { href: `${base}/report`, label: 'Report' },
  ]

  return (
    <>
      <div className="spread" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link className="btn ghost sm" href="/app/campaigns" style={{ marginBottom: 8 }}>
            <Icon name="arrow-left" size={14} /> All campaigns
          </Link>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>
            {loading && !campaign ? '…' : (campaign?.name ?? 'Campaign')}
          </h1>
          {campaign?.objective ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              {campaign.objective}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {campaign ? <SaveTemplateButton campaign={campaign} /> : null}
          {campaign?.status ? <StatusPill status={toStatus(campaign.status)} /> : null}
        </div>
      </div>

      <nav
        className="row"
        style={{
          gap: 4,
          marginBottom: 22,
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
        aria-label="Campaign sections"
      >
        {tabs
          .filter((t) => !t.hide)
          .map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`)
            return (
              <Link
                key={t.href}
                href={t.href}
                className={active ? 'btn sm primary' : 'btn ghost sm'}
                style={{
                  borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                  marginBottom: -1,
                  borderBottom: active ? '2px solid var(--cobalt-600)' : '2px solid transparent',
                }}
              >
                {t.label}
              </Link>
            )
          })}
      </nav>
    </>
  )
}

function CampaignShell({ children }: { children: ReactNode }) {
  const { loading, error, campaign } = useCampaign()

  if (loading && !campaign) {
    return (
      <div className="row" style={{ gap: 8, padding: 40 }}>
        <Spinner />
        <span className="dim">Loading campaign…</span>
      </div>
    )
  }

  return (
    <div>
      <CampaignTabs />
      {error ? (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export default function CampaignLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>()
  return (
    <CampaignProvider campaignId={params.id}>
      <CampaignShell>{children}</CampaignShell>
    </CampaignProvider>
  )
}
