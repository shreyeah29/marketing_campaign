import { z } from 'zod'

/**
 * Per-feature configuration.
 *
 * An enabled feature is rarely just on or off — the email module needs a sending
 * domain and a provider, voice needs a caller id and a script, the knowledge base
 * needs an embedding model and a size cap. This is the schema for that
 * per-organisation, per-feature settings blob (`FeatureAssignment.config`).
 *
 * Each feature that has configuration declares a Zod schema here. The backend
 * validates writes against it; the admin portal renders a form from it; and the
 * defaults mean a preset can enable a feature with sane settings and *no* manual
 * configuration — which is the point of one-click onboarding. A feature with no
 * entry here simply has no per-feature settings.
 */

/**
 * A capability slot a feature fills by naming a provider. The concrete provider
 * and its credential are resolved per organisation, so the config stores only the
 * choice, never a secret.
 */
const providerChoice = (capability: string) =>
  z
    .string()
    .min(1)
    .describe(`Provider selected for the ${capability} capability of this feature`)

/**
 * Per-feature limit overrides. A feature can carry its own caps that sit under
 * the organisation-wide limits — e.g. this email module may send at most N/day
 * even if the org's overall email limit is higher.
 */
const featureLimit = z.number().int().nonnegative().optional()

/**
 * The config schema for each feature, keyed by feature id.
 *
 * Only features with settings appear. Each entry pairs a Zod schema (validation +
 * form generation) with defaults (so a preset can enable the feature without the
 * operator touching anything).
 */
export const FEATURE_CONFIG: Record<
  string,
  { readonly schema: z.ZodType<Record<string, unknown>>; readonly defaults: Record<string, unknown> }
> = {
  'marketing.email': {
    schema: z.object({
      provider: providerChoice('email').default('resend'),
      fromName: z.string().max(100).optional(),
      fromEmail: z.string().email().optional(),
      dailySendLimit: featureLimit,
      requireDoubleOptIn: z.boolean().default(true),
    }),
    defaults: { provider: 'resend', requireDoubleOptIn: true },
  },
  'marketing.whatsapp': {
    schema: z.object({
      provider: providerChoice('whatsapp').default('whatsapp_business'),
      phoneNumberId: z.string().optional(),
      dailySendLimit: featureLimit,
    }),
    defaults: { provider: 'whatsapp_business' },
  },
  'ai.chat': {
    schema: z.object({
      llmProvider: providerChoice('llm').default('anthropic'),
      // Left unset means "let the model router choose by capability" — the
      // config never hardcodes a model string, matching the router's design.
      model: z.string().optional(),
      effort: z.enum(['low', 'medium', 'high', 'max']).default('medium'),
      monthlyTokenLimit: featureLimit,
    }),
    defaults: { llmProvider: 'anthropic', effort: 'medium' },
  },
  'ai.copywriter': {
    schema: z.object({
      llmProvider: providerChoice('llm').default('anthropic'),
      effort: z.enum(['low', 'medium', 'high', 'max']).default('high'),
    }),
    defaults: { llmProvider: 'anthropic', effort: 'high' },
  },
  'ai.image': {
    schema: z.object({
      provider: providerChoice('image').default('ideogram'),
      monthlyImageLimit: featureLimit,
    }),
    defaults: { provider: 'ideogram' },
  },
  'ai.video': {
    schema: z.object({
      provider: providerChoice('video').default('runway'),
      monthlyClipLimit: featureLimit,
    }),
    defaults: { provider: 'runway' },
  },
  'ai.voice_calling': {
    schema: z.object({
      provider: providerChoice('telephony').default('twilio'),
      voiceProvider: providerChoice('voice').default('elevenlabs'),
      callerId: z
        .string()
        .regex(/^\+[1-9]\d{7,14}$/, 'Caller id must be E.164')
        .optional(),
      monthlyMinuteLimit: featureLimit,
      // Legally required in several jurisdictions and defaulted on, so a client
      // cannot accidentally run non-identifying AI calls.
      identifyAsAi: z.boolean().default(true),
    }),
    defaults: { provider: 'twilio', voiceProvider: 'elevenlabs', identifyAsAi: true },
  },
  'ai.voice_receptionist': {
    schema: z.object({
      provider: providerChoice('telephony').default('vapi'),
      greeting: z.string().max(500).optional(),
      handoffNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
    }),
    defaults: { provider: 'vapi' },
  },
  'ai.knowledge_base': {
    schema: z.object({
      embeddingProvider: providerChoice('embedding').default('openai'),
      maxSizeMb: z.number().int().positive().max(10_000).default(500),
    }),
    defaults: { embeddingProvider: 'openai', maxSizeMb: 500 },
  },
  'documents.storage': {
    schema: z.object({
      provider: providerChoice('storage').default('r2'),
      maxSizeGb: z.number().int().positive().default(50),
    }),
    defaults: { provider: 'r2', maxSizeGb: 50 },
  },
  'commerce.stripe': {
    schema: z.object({
      mode: z.enum(['test', 'live']).default('test'),
    }),
    defaults: { mode: 'test' },
  },
}

/** Whether a feature carries per-feature configuration at all. */
export function hasFeatureConfig(featureId: string): boolean {
  return featureId in FEATURE_CONFIG
}

/**
 * Default configuration for a feature.
 *
 * Returned when a feature is enabled without explicit settings, which is what
 * makes preset-driven onboarding possible: enable, apply defaults, done.
 */
export function defaultFeatureConfig(featureId: string): Record<string, unknown> {
  const entry = FEATURE_CONFIG[featureId]
  if (!entry) return {}
  // Parse the empty object through the schema so every field with a Zod
  // `.default()` is materialised, not just the ones listed in `defaults`.
  const parsed = entry.schema.safeParse({ ...entry.defaults })
  return parsed.success ? parsed.data : { ...entry.defaults }
}

/**
 * Validates a config write for a feature.
 *
 * Returns the parsed config or the list of issues. A feature with no schema
 * accepts no config — sending settings to a feature that has none is a client
 * error worth surfacing, not silently dropping.
 */
export function validateFeatureConfig(
  featureId: string,
  config: unknown,
): { readonly ok: true; readonly config: Record<string, unknown> } | { readonly ok: false; readonly issues: readonly string[] } {
  const entry = FEATURE_CONFIG[featureId]
  if (!entry) {
    if (config === undefined || config === null || Object.keys(config as object).length === 0) {
      return { ok: true, config: {} }
    }
    return { ok: false, issues: [`Feature ${featureId} does not accept configuration`] }
  }

  const result = entry.schema.safeParse(config ?? {})
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }
  return { ok: true, config: result.data }
}
