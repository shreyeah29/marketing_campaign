'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'
import { CampaignProvider, SaveTemplateButton, useCampaign } from '@/components/campaign-studio'

/**
 * The campaign header: name, objective, status, and the way back.
 *
 * The five-tab row that used to live here is gone. Sections are tabs inside the
 * page now, so a rail in the layout would be a second navigation competing with
 * the real one — and the layout has no reason to know which section is open.
 */
function CampaignHeader() {
  const { campaign, loading } = useCampaign()

  return (
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
      <CampaignHeader />
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
