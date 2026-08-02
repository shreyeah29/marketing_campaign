import { redirect } from 'next/navigation'

/** Calendar lives at /app/calendar (brief Part 2). Old path redirects. */
export default function AnalyticsCalendarRedirect(): never {
  redirect('/app/calendar')
}
