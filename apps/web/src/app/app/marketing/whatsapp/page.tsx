'use client'

import { EmptyState, PageHeader, ProviderNotConfigured } from '@/components/kit'

export default function WhatsAppCampaignsPage() {
  return (
    <>
      <PageHeader
        title="WhatsApp Campaigns"
        subtitle="Send WhatsApp Business messages once a provider is connected."
      />
      <ProviderNotConfigured capability="WhatsApp" />
      <EmptyState
        icon="🟢"
        title="No WhatsApp provider connected"
        hint="Connect a WhatsApp Business provider to send template messages to your contacts."
      />
    </>
  )
}
