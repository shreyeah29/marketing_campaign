import { defaultFeatureConfig } from './feature-config.js'
import { resolveDependencies } from './features.js'
import type { PlanTierId } from './plans.js'

/**
 * Industry presets — the one-click templates that make onboarding fast.
 *
 * The point the platform owner made: configuring a client feature-by-feature is
 * slow and error-prone. A preset is a curated bundle — features, recommended
 * plan, and *per-feature config defaults* — so onboarding a law firm or a clinic
 * is "pick the template, click Save", not forty checkboxes and a dozen settings
 * forms.
 *
 * A preset is a starting point, not a cage: the wizard applies it, then the
 * operator can adjust anything before saving. Dependencies are resolved
 * automatically, and each feature lands with its default configuration already
 * filled in, so an applied preset is immediately functional.
 */

export interface FeaturePreset {
  readonly id: string
  readonly name: string
  readonly industry: string
  readonly description: string
  /** Recommended plan; the operator can still change it. */
  readonly recommendedPlan: PlanTierId
  /** Features to enable. Dependencies are added automatically. */
  readonly featureIds: readonly string[]
  /**
   * Per-feature config overrides on top of the feature defaults. Only the fields
   * that differ from the default need appear; the rest come from
   * `defaultFeatureConfig`.
   */
  readonly featureConfigOverrides?: Readonly<Record<string, Record<string, unknown>>>
  /** Suggested AI personality / brand-voice seed for the branding step. */
  readonly brandVoice?: string
}

const preset = (p: FeaturePreset): FeaturePreset => p

export const PRESETS: readonly FeaturePreset[] = [
  preset({
    id: 'marketing_agency',
    name: 'Marketing Agency',
    industry: 'Agency',
    description: 'Full marketing stack: campaigns, social, SEO, AI copy and analytics.',
    recommendedPlan: 'business',
    featureIds: [
      'crm.contacts',
      'crm.companies',
      'crm.leads',
      'crm.pipelines',
      'crm.deals',
      'marketing.email',
      'marketing.social',
      'marketing.seo',
      'marketing.landing_pages',
      'marketing.forms',
      'ai.chat',
      'ai.copywriter',
      'ai.image',
      'ai.analytics',
      'automation.workflows',
      'analytics.dashboard',
      'analytics.reports',
      'analytics.revenue',
    ],
    brandVoice: 'Confident, creative, results-driven. Speak like a senior strategist.',
  }),
  preset({
    id: 'law_firm',
    name: 'Law Firm',
    industry: 'Legal',
    description: 'Client intake, matter tracking, contracts and a compliant voice line.',
    recommendedPlan: 'business',
    featureIds: [
      'crm.contacts',
      'crm.companies',
      'crm.leads',
      'crm.tasks',
      'crm.notes',
      'marketing.email',
      'ai.chat',
      'ai.knowledge_base',
      'ai.voice_calling',
      'documents.storage',
      'documents.contracts',
      'support.ticketing',
      'analytics.dashboard',
    ],
    featureConfigOverrides: {
      // Consultations are recorded; a law firm's calls must always identify as AI
      // and hand off to a human quickly.
      'ai.voice_calling': { identifyAsAi: true, monthlyMinuteLimit: 300 },
      'ai.chat': { effort: 'high' },
    },
    brandVoice: 'Professional, precise, reassuring. Plain language over legalese. Never give legal advice.',
  }),
  preset({
    id: 'medical_clinic',
    name: 'Medical Clinic',
    industry: 'Healthcare',
    description: 'Patient contacts, appointment reminders, receptionist and secure documents.',
    recommendedPlan: 'business',
    featureIds: [
      'crm.contacts',
      'crm.tasks',
      'crm.notes',
      'marketing.sms',
      'marketing.email',
      'ai.voice_receptionist',
      'ai.voice_calling',
      'ai.knowledge_base',
      'documents.storage',
      'support.ticketing',
      'support.customer_portal',
      'analytics.dashboard',
    ],
    featureConfigOverrides: {
      'ai.voice_receptionist': { greeting: 'Thank you for calling. This is an AI assistant.' },
      'ai.voice_calling': { identifyAsAi: true },
    },
    brandVoice: 'Warm, careful, clear. Never diagnose or give medical advice; direct to a clinician.',
  }),
  preset({
    id: 'ecommerce',
    name: 'E-commerce',
    industry: 'Retail',
    description: 'Customer CRM, email and WhatsApp marketing, live chat and revenue analytics.',
    recommendedPlan: 'business',
    featureIds: [
      'crm.contacts',
      'crm.leads',
      'marketing.email',
      'marketing.sms',
      'marketing.whatsapp',
      'marketing.social',
      'ai.chat',
      'ai.copywriter',
      'ai.image',
      'comms.live_chat',
      'automation.workflows',
      'analytics.dashboard',
      'analytics.revenue',
      'commerce.invoices',
    ],
    brandVoice: 'Friendly, energetic, concise. On-brand and conversion-focused.',
  }),
  preset({
    id: 'real_estate',
    name: 'Real Estate',
    industry: 'Property',
    description: 'Lead capture, nurture, AI calling and pipeline tracking for agents.',
    recommendedPlan: 'growth',
    featureIds: [
      'crm.contacts',
      'crm.leads',
      'crm.pipelines',
      'crm.deals',
      'crm.tasks',
      'marketing.email',
      'marketing.sms',
      'ai.chat',
      'ai.voice_calling',
      'automation.workflows',
      'analytics.dashboard',
    ],
    brandVoice: 'Personable, proactive, trustworthy. Local-market savvy.',
  }),
  preset({
    id: 'starter_crm',
    name: 'Simple CRM',
    industry: 'General',
    description: 'A lean CRM with email — the smallest sensible starting point.',
    recommendedPlan: 'starter',
    featureIds: ['crm.contacts', 'crm.companies', 'crm.leads', 'marketing.email', 'analytics.dashboard'],
    brandVoice: 'Clear and professional.',
  }),
]

const PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]))

export function findPreset(id: string): FeaturePreset | undefined {
  return PRESETS_BY_ID.get(id)
}

/**
 * Resolves a preset into a concrete, ready-to-save provisioning spec.
 *
 * This is what the wizard's "apply template" produces: the full feature closure
 * (dependencies included) and each feature's effective config (defaults merged
 * with the preset's overrides). The operator sees exactly what will be created,
 * with nothing left to configure by hand — which is the entire point.
 */
export function resolvePreset(presetId: string): {
  readonly plan: PlanTierId
  readonly features: readonly string[]
  readonly featureConfig: Readonly<Record<string, Record<string, unknown>>>
  readonly brandVoice: string | null
} {
  const found = PRESETS_BY_ID.get(presetId)
  if (!found) {
    throw new Error(`Unknown preset: ${presetId}`)
  }

  const { resolved } = resolveDependencies(found.featureIds)

  const featureConfig: Record<string, Record<string, unknown>> = {}
  for (const featureId of resolved) {
    const defaults = defaultFeatureConfig(featureId)
    const overrides = found.featureConfigOverrides?.[featureId] ?? {}
    if (Object.keys(defaults).length > 0 || Object.keys(overrides).length > 0) {
      featureConfig[featureId] = { ...defaults, ...overrides }
    }
  }

  return {
    plan: found.recommendedPlan,
    features: resolved,
    featureConfig,
    brandVoice: found.brandVoice ?? null,
  }
}
