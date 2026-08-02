'use client'

import { useRouter } from 'next/navigation'

import { EmptyState } from '@/components/kit'
import { AssetCard } from '@/components/asset-card'
import {
  REVIEW_STATUSES,
  SkeletonList,
  useCampaign,
  type Asset,
} from '@/components/campaign-studio'

export default function CampaignAssetsPage() {
  const { campaignId, assets } = useCampaign()
  const router = useRouter()

  function open(a: Asset) {
    router.push(`/app/campaigns/${campaignId}/assets/${a.id}`)
  }

  if (assets === null) return <SkeletonList />

  const review = assets.filter((a) => (REVIEW_STATUSES as readonly string[]).includes(a.status))

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Review queue</h2>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
          Assets in GENERATED, NEEDS_REVIEW or DRAFT — approve, edit or reject.
        </p>
        {review.length === 0 ? (
          <EmptyState
            icon="check-square"
            title="Nothing waiting for review"
            hint="New AI drafts land here. Approved work moves to the full grid below."
          />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {review.map((a) => (
              <AssetCard
                key={a.id}
                platform={a.platform}
                kind={a.kind}
                status={a.status}
                body={a.body}
                onClick={() => open(a)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>All assets</h2>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
          {assets.length} item{assets.length === 1 ? '' : 's'}
        </p>
        {assets.length === 0 ? (
          <EmptyState
            icon="layout"
            title="No assets yet"
            hint="Generate from Create, then come back here to review."
          />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {assets.map((a) => (
              <AssetCard
                key={a.id}
                platform={a.platform}
                kind={a.kind}
                status={a.status}
                body={a.body}
                onClick={() => open(a)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
