'use client'

import { useRouter } from 'next/navigation'

import { EmptyState } from '@/components/kit'
import { AssetCard } from '@/components/asset-card'
import { SkeletonList, useCampaign } from '@/components/campaign-studio'

export default function CampaignSchedulePage() {
  const { campaignId, assets } = useCampaign()
  const router = useRouter()

  if (assets === null) return <SkeletonList />

  const scheduled = assets.filter((a) => Boolean(a.scheduledFor))

  if (scheduled.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing scheduled yet"
        hint="Approved assets with a schedule appear here. Use the calendar to place them on the timeline."
        action={
          <button className="btn" onClick={() => router.push('/app/calendar')}>
            Open calendar
          </button>
        }
      />
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>Scheduled assets</h2>
      <div className="stack" style={{ gap: 10 }}>
        {scheduled
          .slice()
          .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
          .map((a) => (
            <AssetCard
              key={a.id}
              platform={a.platform}
              kind={a.kind}
              status={a.status}
              body={a.body}
              onClick={() => router.push(`/app/campaigns/${campaignId}/assets/${a.id}`)}
            />
          ))}
      </div>
    </div>
  )
}
