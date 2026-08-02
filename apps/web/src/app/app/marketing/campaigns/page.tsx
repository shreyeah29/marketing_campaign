import { redirect } from 'next/navigation'

/**
 * Legacy Campaign Studio entry. Creation spine lives at /app/create;
 * open a campaign via /app/campaigns/[id]/assets.
 */
export default function LegacyCampaignsRedirect(): never {
  redirect('/app/create')
}
