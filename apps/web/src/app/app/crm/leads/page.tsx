import { redirect } from 'next/navigation'

/**
 * Leads live at /app/leads, which the CRM nav item points at and which carries
 * both the inbox and the pipeline view. This older path stays as a redirect so
 * existing links and bookmarks keep working.
 */
export default function CrmLeadsRedirect(): never {
  redirect('/app/leads')
}
