import { redirect } from 'next/navigation'

export default function AnalyticsOverviewRedirect(): never {
  redirect('/app/dashboard')
}
