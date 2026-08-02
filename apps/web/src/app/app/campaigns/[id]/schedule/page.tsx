'use client'

import { ContentCalendar } from '@/components/content-calendar'
import { useCampaign } from '@/components/campaign-studio'

export default function CampaignSchedulePage() {
  const { campaignId, campaign } = useCampaign()

  return (
    <ContentCalendar
      campaignId={campaignId}
      title="Schedule"
      subtitle={
        campaign?.name
          ? `Place approved creatives for ${campaign.name}.`
          : 'Place approved creatives on the timeline.'
      }
    />
  )
}
