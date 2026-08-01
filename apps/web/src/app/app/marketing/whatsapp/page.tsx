'use client'

import { ModuleIntro } from '@/components/module-intro'

export default function WhatsAppCampaignsPage() {
  return (
    <ModuleIntro
      title="WhatsApp Campaigns"
      subtitle="Send WhatsApp Business messages"
      icon="message-square"
      requires="Connect a WhatsApp Business provider to send template messages to your contacts."
      capabilities={[
        {
          title: 'Template messages',
          body: 'Send approved WhatsApp templates to opted-in contacts.',
        },
        { title: 'Conversations', body: 'Continue threads in the unified inbox.' },
        { title: 'Delivery & read receipts', body: 'Track sent, delivered and read per message.' },
      ]}
    />
  )
}
