import { redirect } from 'next/navigation'

/**
 * /app is the AI engine, not a dashboard: landing in the workspace drops you
 * straight into the Campaign Studio prompt — one place, one prompt, everything
 * flows from there. The dashboard stays one click away in the sidebar.
 */
export default function AppIndex(): never {
  redirect('/app/marketing/campaigns')
}
