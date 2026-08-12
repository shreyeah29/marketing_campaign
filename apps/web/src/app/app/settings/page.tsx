import { redirect } from 'next/navigation'

/**
 * `/app/settings` has no page of its own — the six sections are the content.
 * Without this it is a 404, which anyone who trims the URL or follows a stale
 * link lands on. Organization is the landing section, matching the sidebar.
 */
export default function SettingsIndex(): never {
  redirect('/app/settings/organization')
}
