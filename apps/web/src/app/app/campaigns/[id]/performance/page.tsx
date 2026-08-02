'use client'

import { EmptyState } from '@/components/kit'
import { AnalyticsSection, SkeletonList, useCampaign } from '@/components/campaign-studio'

/**
 * Performance tab — reuses the existing assets-by-platform analytics section.
 * Full metric tiles / sparklines are Phase 5 screen 8; no invented metrics here.
 */
export default function CampaignPerformancePage() {
  const { assets, showPerformance } = useCampaign()

  if (assets === null) return <SkeletonList />

  if (!showPerformance) {
    return (
      <EmptyState
        icon="bar-chart"
        title="Performance unlocks after publish"
        hint="Once an asset is scheduled or published, channel breakdowns appear here."
      />
    )
  }

  return <AnalyticsSection assets={assets} />
}
