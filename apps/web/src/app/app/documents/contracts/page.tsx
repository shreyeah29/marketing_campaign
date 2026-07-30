'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function ContractsPage() {
  return <ModuleIntro title="Contracts" subtitle="Draft, send and e-sign agreements" icon="📄"
    requires="Connect a storage provider to hold documents; e-signature integration enables signing."
    capabilities={[
      { title: 'Templates', body: 'Reusable contract templates with merge fields.' },
      { title: 'E-signature', body: 'Send for signature and track status.' },
      { title: 'Audit trail', body: 'Every view and signature is recorded.' },
    ]} />
}
