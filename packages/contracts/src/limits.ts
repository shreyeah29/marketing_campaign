/**
 * Limit definitions.
 *
 * The registry of *what can be metered and capped*. An organisation's actual caps
 * are data (`OrganizationLimit`, seeded from its plan and overridable); this is
 * the immutable catalogue of metrics, their units, and how they reset.
 *
 * A limit is enforced *before* the work that consumes it, generalising the AI
 * budget guard already in `ai-core`: projected usage against the cap, refuse if it
 * would exceed. Checking after the fact is accounting, not a limit.
 */

export type LimitUnit = 'count' | 'gigabytes' | 'megabytes' | 'minutes'

/**
 * How a limit resets. `total` limits (users, storage) are a standing ceiling;
 * `monthly` limits (emails, AI requests) refill each billing period.
 */
export type LimitPeriod = 'total' | 'monthly' | 'daily'

export interface LimitDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly unit: LimitUnit
  readonly period: LimitPeriod
  /**
   * How usage is counted. `gauge` reads the current value (rows in a table, bytes
   * stored); `counter` accumulates events over the period (emails sent). The
   * distinction decides whether the limit service counts or sums.
   */
  readonly meter: 'gauge' | 'counter'
  /** Feature whose usage this limit governs, if any. Null for org-wide limits. */
  readonly feature: string | null
}

const l = (d: LimitDefinition): LimitDefinition => d

export const LIMITS: readonly LimitDefinition[] = [
  l({ id: 'users', name: 'Users', description: 'Active members in the workspace.', unit: 'count', period: 'total', meter: 'gauge', feature: null }),
  l({ id: 'storage_gb', name: 'Storage', description: 'Total file storage.', unit: 'gigabytes', period: 'total', meter: 'gauge', feature: 'documents.storage' }),
  l({ id: 'ai_requests', name: 'AI Requests', description: 'Model calls per month.', unit: 'count', period: 'monthly', meter: 'counter', feature: null }),
  l({ id: 'voice_minutes', name: 'Voice Minutes', description: 'AI call minutes per month.', unit: 'minutes', period: 'monthly', meter: 'counter', feature: 'ai.voice_calling' }),
  l({ id: 'emails', name: 'Emails', description: 'Emails sent per month.', unit: 'count', period: 'monthly', meter: 'counter', feature: 'marketing.email' }),
  l({ id: 'sms', name: 'SMS', description: 'SMS sent per month.', unit: 'count', period: 'monthly', meter: 'counter', feature: 'marketing.sms' }),
  l({ id: 'whatsapp', name: 'WhatsApp Messages', description: 'WhatsApp messages per month.', unit: 'count', period: 'monthly', meter: 'counter', feature: 'marketing.whatsapp' }),
  l({ id: 'contacts', name: 'Contacts', description: 'Stored contacts.', unit: 'count', period: 'total', meter: 'gauge', feature: 'crm.contacts' }),
  l({ id: 'projects', name: 'Projects', description: 'Active projects.', unit: 'count', period: 'total', meter: 'gauge', feature: null }),
  l({ id: 'automations', name: 'Automations', description: 'Active workflows.', unit: 'count', period: 'total', meter: 'gauge', feature: 'automation.workflows' }),
  l({ id: 'agents', name: 'AI Agents', description: 'Enabled agents.', unit: 'count', period: 'total', meter: 'gauge', feature: null }),
  l({ id: 'knowledge_base_mb', name: 'Knowledge Base Size', description: 'Indexed knowledge, in MB.', unit: 'megabytes', period: 'total', meter: 'gauge', feature: 'ai.knowledge_base' }),
  l({ id: 'api_requests', name: 'API Requests', description: 'API requests per month.', unit: 'count', period: 'monthly', meter: 'counter', feature: null }),
]

const LIMITS_BY_ID = new Map(LIMITS.map((limit) => [limit.id, limit]))

export function findLimit(id: string): LimitDefinition | undefined {
  return LIMITS_BY_ID.get(id)
}

export function isKnownLimit(id: string): boolean {
  return LIMITS_BY_ID.has(id)
}
