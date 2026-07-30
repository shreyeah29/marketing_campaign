'use client'

import { PageHeader } from '@/components/kit'
import { useWorkspace } from '../../layout'

/**
 * Billing is managed centrally by the platform operator on this deployment — there
 * is no self-serve payment flow to configure — so this is an honest informational
 * page rather than a setup prompt. It still shows the org's current plan (real data
 * from the workspace bootstrap), which is the one billing-adjacent fact a customer
 * cares about here.
 */
export default function BillingPage() {
  const ws = useWorkspace()
  const planName = ws.plan?.name ?? 'Custom plan'

  return (
    <>
      <PageHeader title="Billing" subtitle="Your plan and how billing is handled" />

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="spread" style={{ alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Current plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{planName}</div>
          </div>
          <span className="badge">Active</span>
        </div>

        <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Billing for this workspace is managed by your platform operator. To change your plan, adjust the
          modules included, or request an invoice, please contact your account manager — there&apos;s nothing
          to set up here.
        </p>
      </div>
    </>
  )
}
