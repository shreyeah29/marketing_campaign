'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { EmptyState, PageHeader } from '@/components/kit'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { StatusPill, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'
import { fetchCampaigns, type Campaign } from '@/components/campaign-studio'

export default function CampaignsListPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)

  useEffect(() => {
    fetchCampaigns().then(setCampaigns)
  }, [])

  return (
    <FadeIn>
      <PageHeader
        title="Campaigns"
        subtitle="Open a campaign to review strategy, assets, schedule and performance."
        actions={
          <Link className="btn primary" href="/app/create">
            <Icon name="sparkles" size={15} /> New campaign
          </Link>
        }
      />

      {campaigns === null ? (
        <div className="row" style={{ gap: 8, padding: 24 }}>
          <Spinner />
          <span className="dim">Loading campaigns…</span>
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title="No campaigns yet"
          hint="Start from the Command Center — describe what you want and the AI will plan it."
          action={
            <Link className="btn primary" href="/app/create">
              Create campaign
            </Link>
          }
        />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              className="asset-row"
              style={{ alignItems: 'center', padding: 14, width: '100%', textAlign: 'left' }}
              onClick={() => router.push(`/app/campaigns/${c.id}/assets`)}
            >
              <div className="avatar" style={{ background: 'var(--primary-soft)' }}>
                <Icon name="megaphone" size={15} />
              </div>
              <div className="body">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {c.objective ?? 'Open workspace'}
                </div>
              </div>
              {c.status ? <StatusPill status={toStatus(c.status)} /> : null}
              <Icon name="chevron-right" size={16} className="dim" />
            </button>
          ))}
        </div>
      )}
    </FadeIn>
  )
}
