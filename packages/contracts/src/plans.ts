import { DEFAULT_ENABLED_FEATURES, FEATURES, resolveDependencies } from './features.js'

/**
 * Plans.
 *
 * A plan is a *named bundle of feature ids* plus default limits and price — it
 * hardcodes no behaviour. Adding a feature to a plan is editing a list, not
 * touching code, and a Custom plan is just another bundle. This mirrors the whole
 * platform philosophy: the plan references the registry, it does not redefine it.
 *
 * These built-in plans are the defaults synced to the `plan` table. A platform
 * owner can then create bespoke plans in the database without a deploy.
 */

export type PlanTierId = 'starter' | 'growth' | 'business' | 'enterprise' | 'custom'

export interface PlanDefinition {
  readonly id: PlanTierId
  readonly name: string
  readonly description: string
  /** Feature ids this plan includes. Dependencies are resolved automatically. */
  readonly featureIds: readonly string[]
  /** Default limits, by metric id. Overridable per organisation. */
  readonly limits: Readonly<Record<string, number>>
  readonly monthlyPriceUsd: number
  readonly yearlyPriceUsd: number
  /** Enterprise/custom plans are priced per contract, not from this table. */
  readonly customPricing: boolean
}

// Built cumulatively: each tier layers onto the one below, so a feature added to
// a lower tier is inherited without being restated. This is the same additive
// discipline the RBAC role ladder uses.
const STARTER_FEATURES = [
  ...DEFAULT_ENABLED_FEATURES,
  'crm.leads',
  'marketing.email',
  'automation.webhooks',
]

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  'marketing.campaigns',
  'crm.pipelines',
  'crm.deals',
  'crm.tasks',
  'ai.chat',
  'ai.copywriter',
  'automation.workflows',
  'analytics.reports',
  'marketing.seo',
  'marketing.social',
]

const BUSINESS_FEATURES = [
  ...GROWTH_FEATURES,
  'ai.image',
  'ai.knowledge_base',
  'ai.analytics',
  'ai.insights',
  'marketing.whatsapp',
  'marketing.sms',
  'analytics.revenue',
  'automation.scheduled_jobs',
  'automation.ai_automation',
  'commerce.invoices',
  'documents.storage',
  'documents.contracts',
  'support.ticketing',
]

// Enterprise gets everything in the registry. Rather than list every id (which
// would drift as features are added), it is expanded from the registry at build
// time below.

export const PLANS: readonly PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'CRM and email to get a small team running.',
    featureIds: resolveDependencies(STARTER_FEATURES).resolved,
    limits: {
      users: 3,
      storage_gb: 5,
      ai_requests: 500,
      emails: 2_000,
      contacts: 2_500,
      agents: 3,
      api_requests: 10_000,
    },
    monthlyPriceUsd: 49,
    yearlyPriceUsd: 490,
    customPricing: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'AI copy, automation and analytics for a growing team.',
    featureIds: resolveDependencies(GROWTH_FEATURES).resolved,
    limits: {
      users: 10,
      storage_gb: 50,
      ai_requests: 5_000,
      emails: 25_000,
      contacts: 25_000,
      voice_minutes: 0,
      agents: 8,
      automations: 25,
      api_requests: 100_000,
    },
    monthlyPriceUsd: 149,
    yearlyPriceUsd: 1_490,
    customPricing: false,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'The full marketing OS: image, voice-ready, WhatsApp, revenue.',
    featureIds: resolveDependencies(BUSINESS_FEATURES).resolved,
    limits: {
      users: 25,
      storage_gb: 250,
      ai_requests: 25_000,
      emails: 100_000,
      contacts: 100_000,
      voice_minutes: 600,
      sms: 5_000,
      whatsapp: 10_000,
      agents: 12,
      automations: 100,
      knowledge_base_mb: 2_000,
      api_requests: 500_000,
    },
    monthlyPriceUsd: 499,
    yearlyPriceUsd: 4_990,
    customPricing: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Everything, plus custom modules and bespoke limits.',
    // Every feature in the registry, expanded here so the plan never drifts
    // behind a newly added feature.
    featureIds: FEATURES.map((feature) => feature.id),
    limits: {
      // -1 is the sentinel for "unlimited", checked explicitly by the limit
      // service so an enterprise org is never blocked by a numeric cap.
      users: -1,
      storage_gb: -1,
      ai_requests: -1,
      emails: -1,
      contacts: -1,
      voice_minutes: -1,
      agents: -1,
      automations: -1,
      api_requests: -1,
    },
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    customPricing: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'A bespoke bundle assembled per client.',
    featureIds: resolveDependencies(DEFAULT_ENABLED_FEATURES).resolved,
    limits: {},
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    customPricing: true,
  },
]

const PLANS_BY_ID = new Map(PLANS.map((plan) => [plan.id, plan]))

export function findPlan(id: string): PlanDefinition | undefined {
  return PLANS_BY_ID.get(id as PlanTierId)
}

export const UNLIMITED = -1

/** A limit value of -1 means unlimited. */
export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED
}
