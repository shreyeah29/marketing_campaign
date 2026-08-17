'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { SkeletonList } from '@/components/campaign-studio'

/**
 * The asset drawer used to be a nested route; it is now the `asset` query
 * parameter on the media section. This keeps every link that already points at
 * an individual asset — a workflow notification, a shared review link — landing
 * on that asset rather than on a 404.
 */
export default function CampaignAssetDetailRedirect() {
  const params = useParams<{ id: string; assetId: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/app/campaigns/${params.id}?section=media&asset=${params.assetId}`)
  }, [params.id, params.assetId, router])

  return <SkeletonList />
}
