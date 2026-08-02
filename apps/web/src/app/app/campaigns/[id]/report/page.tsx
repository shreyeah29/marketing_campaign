'use client'

import Link from 'next/link'

import { EmptyState } from '@/components/kit'
import { useCampaign } from '@/components/campaign-studio'

/**
 * Campaign report — document-like placeholder using real campaign fields only.
 * Full composeReportHtml mirroring is Phase 5 screen 12.
 */
export default function CampaignReportPage() {
  const { campaign, assets, showReport } = useCampaign()

  if (!campaign) return null

  if (!showReport) {
    return (
      <EmptyState
        icon="file-text"
        title="Report available when the campaign ends"
        hint="When status is COMPLETED or ARCHIVED, this page summarises the run from real campaign fields."
      />
    )
  }

  const total = assets?.length ?? 0
  const published = assets?.filter((a) => a.status === 'PUBLISHED').length ?? 0

  return (
    <article className="card" style={{ padding: 28, maxWidth: 720 }}>
      <div
        className="dim"
        style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        Campaign report
      </div>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', marginTop: 8 }}>{campaign.name}</h1>
      {campaign.status ? (
        <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
          Status · {campaign.status}
        </p>
      ) : null}

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Objective</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.objective ?? '—'}
        </p>
      </section>

      {campaign.strategy?.summary ? (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Strategy</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {campaign.strategy.summary}
          </p>
        </section>
      ) : null}

      {campaign.targetAudience?.description ? (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Audience</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {campaign.targetAudience.description}
          </p>
        </section>
      ) : null}

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Assets</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {total} total · {published} published
          {campaign.budgetTotal != null ? ` · Budget ${campaign.budgetTotal}` : ''}
        </p>
      </section>

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Ready for the next loop?
        </p>
        <Link className="btn primary" href="/app/create">
          Start next campaign
        </Link>
      </div>
    </article>
  )
}
