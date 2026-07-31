'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function InvoicesPage() {
  return <ModuleIntro title="Invoices" subtitle="Create, send and track invoices" icon="receipt"
    requires="Connect a payment provider (Stripe / Razorpay) to issue and collect on invoices."
    configureHref="/app/settings/providers"
    capabilities={[
      { title: 'Create invoices', body: 'Line items, taxes and due dates.' },
      { title: 'Send & remind', body: 'Email invoices and automatic reminders.' },
      { title: 'Track payments', body: 'See paid, pending and overdue at a glance.' },
    ]} />
}
