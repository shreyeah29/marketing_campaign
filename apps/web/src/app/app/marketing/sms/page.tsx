'use client'

import { EmptyState, PageHeader, ProviderNotConfigured } from '@/components/kit'

export default function SmsCampaignsPage() {
  return (
    <>
      <PageHeader
        title="SMS Campaigns"
        subtitle="Reach your audience over SMS once a provider is connected."
      />
      <ProviderNotConfigured capability="SMS" />
      <EmptyState
        icon="💬"
        title="No SMS provider connected"
        hint="Connect an SMS provider to send campaigns to your contacts."
      />
    </>
  )
}
