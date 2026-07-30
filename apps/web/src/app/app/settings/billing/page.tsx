'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function BillingPage() {
  return <ModuleIntro title="Billing" subtitle="Your plan, invoices and payment method" icon="💳"
    requires="Billing is managed by your platform operator. A payment provider (Stripe) enables self-serve plan changes and invoices."
    configureHref="/app/settings/organization"
    capabilities={[
      { title: 'Your plan', body: 'See your current plan and the modules it includes.' },
      { title: 'Invoices', body: 'Download past invoices once a payment provider is connected.' },
      { title: 'Usage', body: 'Track usage against your plan limits.' },
    ]} />
}
