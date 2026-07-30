'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function TicketsPage() {
  return <ModuleIntro title="Support Tickets" subtitle="Track and resolve customer requests" icon="🎫"
    requires="Connect an inbound channel (email / live chat) in Settings → Providers to receive tickets."
    capabilities={[
      { title: 'Unified queue', body: 'Tickets from email, chat and forms in one place.' },
      { title: 'Assign & prioritize', body: 'Route to the right teammate with SLAs.' },
      { title: 'AI replies', body: 'Draft responses with your AI assistant.' },
    ]} />
}
