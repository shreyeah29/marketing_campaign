'use client'

import type { ReactNode } from 'react'
import { useParams, usePathname } from 'next/navigation'

import { CreativeStudio } from '@/components/campaign-studio'

export default function CampaignAssetsLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const base = `/app/campaigns/${params.id}/assets`
  const rest = pathname.startsWith(base + '/') ? pathname.slice(base.length + 1) : ''
  const selectedAssetId = rest && !rest.includes('/') ? rest : null

  return <CreativeStudio selectedAssetId={selectedAssetId} drawer={children} />
}
