'use client'

import { EmptyState, PageHeader } from '@/components/kit'
import { FadeIn } from '@/components/motion'

/**
 * Audience analytics — no dedicated audience endpoint in the frozen contract.
 * Honest empty/gap state; do not invent metrics.
 */
export default function AnalyticsAudiencePage() {
  return (
    <FadeIn>
      <PageHeader title="Audience" subtitle="Audience insights for this workspace." />
      <EmptyState
        icon="users"
        title="Audience analytics not available yet"
        hint="There is no audience endpoint in the current API contract. This route is reserved for when that data ships — nothing is invented here."
      />
    </FadeIn>
  )
}
