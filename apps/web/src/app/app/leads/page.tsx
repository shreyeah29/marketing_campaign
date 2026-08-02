import { redirect } from 'next/navigation'

/** Leads inbox — existing board lives under CRM; brief path is /app/leads. */
export default function LeadsAliasRedirect(): never {
  redirect('/app/crm/leads')
}
