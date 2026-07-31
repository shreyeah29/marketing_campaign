'use client'

import { ModuleIntro } from '@/components/module-intro'

export default function SmsCampaignsPage() {
  return (
    <ModuleIntro
      title="SMS Campaigns"
      subtitle="Reach your audience over SMS"
      icon="message-square"
      requires="Connect an SMS provider (Twilio, Telnyx) to send text campaigns to your contacts."
      capabilities={[
        { title: 'Broadcasts', body: 'Send a message to a segment of your contacts at once.' },
        { title: 'Two-way replies', body: 'Route inbound replies into the unified inbox.' },
        { title: 'Delivery tracking', body: 'See delivered, failed and opt-out counts per send.' },
      ]}
    />
  )
}
