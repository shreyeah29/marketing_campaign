'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function HelpdeskPage() {
  return <ModuleIntro title="Help Desk" subtitle="A self-serve knowledge base for your customers" icon="🛟"
    requires="Publish articles from your AI Knowledge base to enable the customer help center."
    configureHref="/app/ai/knowledge"
    capabilities={[
      { title: 'Public articles', body: 'Turn knowledge-base docs into help articles.' },
      { title: 'AI search', body: 'Customers get instant answers from your content.' },
      { title: 'Deflect tickets', body: 'Resolve common questions before they reach you.' },
    ]} />
}
