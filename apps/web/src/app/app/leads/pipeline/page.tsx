import { redirect } from 'next/navigation'

/** Pipeline view — maps to CRM pipelines until Phase 5 dual inbox/pipeline toggle. */
export default function LeadsPipelineRedirect(): never {
  redirect('/app/crm/pipelines')
}
