/**
 * Provider registry.
 *
 * The catalogue of every provider the platform can use, grouped by the capability
 * it fills. Like the feature registry, this declares *what exists*; which provider
 * an organisation actually uses for a capability is data (`ProviderConfiguration`),
 * and the secret is a separate envelope-encrypted row (`ProviderCredential`).
 *
 * This lives in `@vsp/contracts` — metadata only, never an SDK — so the frontend
 * can render a provider picker and the backend can validate a selection from the
 * same source. The actual adapters implement the `@vsp/ai-core` ports and live in
 * `@vsp/providers`; business logic depends on the port, so a provider is a
 * configuration choice, not a code change.
 */

export type ProviderCapability =
  | 'llm'
  | 'image'
  | 'video'
  | 'voice'
  | 'transcription'
  | 'embedding'
  | 'telephony'
  | 'email'
  | 'social'
  | 'storage'
  | 'payment'

export interface ProviderManifest {
  readonly id: string
  readonly name: string
  readonly capability: ProviderCapability
  /** Whether a credential must be configured before the provider can be used. */
  readonly needsCredential: boolean
  /**
   * Credential fields the provider needs, so the admin UI renders the right form
   * and the backend knows what to envelope-encrypt. Most are a single API key;
   * some (OAuth, cloud storage) need several.
   */
  readonly credentialFields: readonly string[]
  /** True for the platform's recommended default in this capability. */
  readonly recommended?: boolean
  readonly docsUrl?: string
}

const p = (m: ProviderManifest): ProviderManifest => m

export const PROVIDERS: readonly ProviderManifest[] = [
  // ── LLM ──────────────────────────────────────────────────────────────────────
  p({
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'openai',
    name: 'OpenAI',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'google',
    name: 'Google Gemini',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'xai',
    name: 'xAI (Grok)',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'deepseek',
    name: 'DeepSeek',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'mistral',
    name: 'Mistral',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'openrouter',
    name: 'OpenRouter',
    capability: 'llm',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Voice ────────────────────────────────────────────────────────────────────
  p({
    id: 'elevenlabs',
    name: 'ElevenLabs',
    capability: 'voice',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'cartesia',
    name: 'Cartesia',
    capability: 'voice',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Transcription ────────────────────────────────────────────────────────────
  p({
    id: 'deepgram',
    name: 'Deepgram',
    capability: 'transcription',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),

  // ── Telephony ────────────────────────────────────────────────────────────────
  p({
    id: 'twilio',
    name: 'Twilio',
    capability: 'telephony',
    needsCredential: true,
    credentialFields: ['accountSid', 'authToken'],
    recommended: true,
  }),
  p({
    id: 'vapi',
    name: 'Vapi',
    capability: 'telephony',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'retell',
    name: 'Retell',
    capability: 'telephony',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Image ────────────────────────────────────────────────────────────────────
  p({
    id: 'ideogram',
    name: 'Ideogram',
    capability: 'image',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'flux',
    name: 'Flux (fal.ai)',
    capability: 'image',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'dalle',
    name: 'DALL·E (OpenAI)',
    capability: 'image',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Video ────────────────────────────────────────────────────────────────────
  p({
    id: 'runway',
    name: 'Runway',
    capability: 'video',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'luma',
    name: 'Luma',
    capability: 'video',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'pika',
    name: 'Pika',
    capability: 'video',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Embedding ────────────────────────────────────────────────────────────────
  p({
    id: 'openai_embed',
    name: 'OpenAI Embeddings',
    capability: 'embedding',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'voyage',
    name: 'Voyage',
    capability: 'embedding',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),

  // ── Storage ──────────────────────────────────────────────────────────────────
  p({
    id: 'r2',
    name: 'Cloudflare R2',
    capability: 'storage',
    needsCredential: true,
    credentialFields: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'],
    recommended: true,
  }),
  p({
    id: 's3',
    name: 'AWS S3',
    capability: 'storage',
    needsCredential: true,
    credentialFields: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'],
  }),
  p({
    id: 'supabase',
    name: 'Supabase Storage',
    capability: 'storage',
    needsCredential: true,
    credentialFields: ['url', 'serviceKey', 'bucket'],
  }),

  // ── Email ────────────────────────────────────────────────────────────────────
  p({
    id: 'resend',
    name: 'Resend',
    capability: 'email',
    needsCredential: true,
    credentialFields: ['apiKey'],
    recommended: true,
  }),
  p({
    id: 'sendgrid',
    name: 'SendGrid',
    capability: 'email',
    needsCredential: true,
    credentialFields: ['apiKey'],
  }),
  p({
    id: 'ses',
    name: 'Amazon SES',
    capability: 'email',
    needsCredential: true,
    credentialFields: ['accessKeyId', 'secretAccessKey', 'region'],
  }),

  // ── Payments ─────────────────────────────────────────────────────────────────
  p({
    id: 'stripe',
    name: 'Stripe',
    capability: 'payment',
    needsCredential: true,
    credentialFields: ['secretKey', 'webhookSecret'],
    recommended: true,
  }),
  p({
    id: 'razorpay',
    name: 'Razorpay',
    capability: 'payment',
    needsCredential: true,
    credentialFields: ['keyId', 'keySecret'],
  }),
]

const PROVIDERS_BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]))

export function findProvider(id: string): ProviderManifest | undefined {
  return PROVIDERS_BY_ID.get(id)
}

export function providersFor(capability: ProviderCapability): readonly ProviderManifest[] {
  return PROVIDERS.filter((provider) => provider.capability === capability)
}

export const PROVIDER_CAPABILITIES: readonly ProviderCapability[] = [
  'llm',
  'image',
  'video',
  'voice',
  'transcription',
  'embedding',
  'telephony',
  'email',
  'social',
  'storage',
  'payment',
]

/**
 * Validates that a provider is valid for a capability and that the supplied
 * credential has the fields the provider needs. Returns the missing fields, if
 * any, so the caller can produce a precise error rather than a generic one.
 */
export function validateProviderCredential(
  providerId: string,
  capability: ProviderCapability,
  credential: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const provider = PROVIDERS_BY_ID.get(providerId)
  if (!provider) return { ok: false, reason: `Unknown provider: ${providerId}` }
  if (provider.capability !== capability) {
    return { ok: false, reason: `${providerId} does not provide the ${capability} capability` }
  }
  const missing = provider.credentialFields.filter(
    (field) => typeof credential[field] !== 'string' || (credential[field] as string).length === 0,
  )
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing credential fields for ${providerId}: ${missing.join(', ')}`,
    }
  }
  return { ok: true }
}
