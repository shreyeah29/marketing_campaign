'use client'

import { StrategySection, useCampaign } from '@/components/campaign-studio'
import { Spinner } from '@/components/ui'

export default function CampaignStrategyPage() {
  const { campaign, loading } = useCampaign()
  if (loading && !campaign) return <Spinner />
  if (!campaign) return null
  return <StrategySection campaign={campaign} />
}
