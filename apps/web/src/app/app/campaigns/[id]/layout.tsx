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

  /**
   * One line: the way back, the name, the status.
   *
   * Was three stacked rows — a back button, a 26px heading and the objective —
   * above a section bar that is itself navigation. On the media section that put
   * roughly a third of the viewport above the first creative, on a screen whose
   * whole purpose is looking at creatives.
   *
   * The objective moves to Overview, where it is already shown. It is a
   * paragraph about strategy, and reprinting it above every section meant
   * reading it while judging a poster.
   */
  return (
    <div className="camp-head">
      <Link className="btn ghost sm" href="/app/campaigns">
        <Icon name="arrow-left" size={14} /> All campaigns
      </Link>
      <span className="camp-head__sep" aria-hidden="true" />
      <h1 className="camp-head__title">
        {loading && !campaign ? '…' : (campaign?.name ?? 'Campaign')}
      </h1>
      {campaign?.status ? <StatusPill status={toStatus(campaign.status)} /> : null}
      <div className="camp-head__end">
        {campaign ? <SaveTemplateButton campaign={campaign} /> : null}
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
