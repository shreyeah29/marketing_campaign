'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { EmptyState } from '@/components/kit'
import { AssetEditor, SkeletonList, useCampaign } from '@/components/campaign-studio'

export default function CampaignAssetDetailPage() {
  const params = useParams<{ id: string; assetId: string }>()
  const router = useRouter()
  const { assets, reload } = useCampaign()

  const asset = useMemo(
    () => assets?.find((a) => a.id === params.assetId) ?? null,
    [assets, params.assetId],
  )

  if (assets === null) return <SkeletonList />

  if (!asset) {
    return (
      <EmptyState
        icon="file-text"
        title="Asset not found"
        hint="It may have been deleted, or this campaign has no matching asset."
        action={
          <button className="btn" onClick={() => router.push(`/app/campaigns/${params.id}/assets`)}>
            Back to assets
          </button>
        }
      />
    )
  }

  return (
    <AssetEditor
      asset={asset}
      variant="drawer"
      onBack={() => router.push(`/app/campaigns/${params.id}/assets`)}
      onChanged={() => {
        reload()
        router.push(`/app/campaigns/${params.id}/assets`)
      }}
    />
  )
}
