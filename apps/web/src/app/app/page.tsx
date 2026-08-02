import { redirect } from 'next/navigation'

/**
 * /app lands on the Command Center (creation spine). Full Home zones are Phase 5.
 */
export default function AppIndex(): never {
  redirect('/app/create')
}
