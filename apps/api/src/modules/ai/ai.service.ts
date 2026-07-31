import { Inject, Injectable } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { EncryptionService } from '../../common/crypto/encryption.service.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Capabilities as stored on `ProviderConfiguration`/`ProviderCredential`
 * (the Prisma `ProviderCapability` / `ProviderKind` enum values).
 */
export type AiCapability = 'LLM' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'TRANSCRIPTION'

/** A resolved, ready-to-use provider selection with its plaintext key in memory only. */
export interface ResolvedProvider {
  readonly providerId: string
  readonly apiKey: string
  readonly model?: string
}

export interface RecordUsageInput {
  readonly capability: AiCapability
  readonly providerId: string
  readonly model: string
  readonly operation: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly latencyMs?: number
  readonly succeeded: boolean
  readonly errorCode?: string
}

// Provider registry ids → the `AiProvider` enum used by `ai_usage.provider`.
// Providers with no enum member (e.g. mistral, openrouter) simply aren't ledgered
// — usage recording is best-effort and never blocks a response.
const AI_PROVIDER_ENUM: Record<string, string> = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  google: 'GOOGLE',
  xai: 'XAI',
  deepseek: 'DEEPSEEK',
  elevenlabs: 'ELEVENLABS',
  deepgram: 'DEEPGRAM',
  ideogram: 'IDEOGRAM',
  flux: 'FLUX',
  runway: 'RUNWAY',
  luma: 'LUMA',
  pika: 'PIKA',
}

/**
 * Resolves an organisation's active provider for an AI capability and decrypts its
 * credential — the single place plaintext keys briefly exist in memory.
 *
 * The whole design turns on one property: when nothing is configured, this returns
 * `null` rather than throwing. The controller renders that as a clean 409
 * `provider_not_configured`, and the UI degrades gracefully. No key, no crash.
 */
@Injectable()
export class AiService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
  ) {}

  async resolve(capability: AiCapability): Promise<ResolvedProvider | null> {
    // LLM is a built-in platform service: the key comes ONLY from the environment,
    // never the database or the user. Every org's chat / copywriter / campaign
    // generation uses the operator's key automatically, with zero setup.
    if (capability === 'LLM') return this.platformKey()

    const config = await withTenantTransaction(this.db, (tx) =>
      tx.providerConfiguration.findFirst({
        where: {
          capability: capability as never,
          isActive: true,
          credentialId: { not: null },
        },
        include: { credential: true },
        orderBy: { updatedAt: 'desc' },
      }),
    )
    // Non-LLM capabilities have no platform key; unconfigured means unavailable.
    if (!config || !config.credential) return null

    const cred = config.credential
    let opened: Record<string, unknown>
    try {
      opened = this.encryption.open({
        ciphertext: Buffer.from(cred.ciphertext),
        iv: Buffer.from(cred.iv),
        authTag: Buffer.from(cred.authTag),
        wrappedKey: Buffer.from(cred.wrappedKey),
        keyVersion: cred.keyVersion,
      })
    } catch {
      // A credential that fails to decrypt is treated as absent, never a 500.
      return null
    }

    const apiKey = typeof opened['apiKey'] === 'string' ? (opened['apiKey'] as string) : ''
    if (apiKey.length === 0) return null

    const cfg = (config.config ?? {}) as { model?: unknown }
    const model = typeof cfg.model === 'string' ? cfg.model : undefined

    return { providerId: config.provider, apiKey, ...(model === undefined ? {} : { model }) }
  }

  /**
   * The platform-managed OpenAI key from the environment — the single source of AI
   * credentials. Returns null only when the operator has not configured the server,
   * which the caller surfaces as a generic "AI unavailable" error (never a mention
   * of OpenAI or keys to the user).
   */
  private platformKey(): ResolvedProvider | null {
    const env = loadEnv()
    if (!env.OPENAI_API_KEY) return null
    const model = env.OPENAI_MODEL
    return { providerId: 'openai', apiKey: env.OPENAI_API_KEY, ...(model ? { model } : {}) }
  }

  /**
   * The platform-managed OpenAI key for image generation. Read ONLY from the
   * environment — never the database, never the user — exactly like `platformKey()`.
   * Returns null when the operator has not configured the server, which the caller
   * surfaces as a generic "AI unavailable" error.
   */
  platformImageKey(): { apiKey: string } | null {
    return this.platformOpenAiKey()
  }

  /** The platform-managed OpenAI key for text-to-speech. See {@link platformImageKey}. */
  platformVoiceKey(): { apiKey: string } | null {
    return this.platformOpenAiKey()
  }

  private platformOpenAiKey(): { apiKey: string } | null {
    const env = loadEnv()
    if (!env.OPENAI_API_KEY) return null
    return { apiKey: env.OPENAI_API_KEY }
  }

  /**
   * The platform-managed Runway key for video (and, when configured, image)
   * generation. Read ONLY from the environment — never the database, never the
   * user — so Runway is an operator-level capability that never surfaces in any
   * tenant configuration UI. Returns null when the operator has not set it, which
   * the caller renders as a generic "AI unavailable" (video) or a fall-back to the
   * OpenAI image model (image).
   */
  platformRunwayKey(): { apiKey: string; imageModel?: string; videoModel?: string } | null {
    const env = loadEnv()
    if (!env.RUNWAY_API_KEY) return null
    return {
      apiKey: env.RUNWAY_API_KEY,
      ...(env.RUNWAY_IMAGE_MODEL ? { imageModel: env.RUNWAY_IMAGE_MODEL } : {}),
      ...(env.RUNWAY_VIDEO_MODEL ? { videoModel: env.RUNWAY_VIDEO_MODEL } : {}),
    }
  }

  /**
   * Writes an `ai_usage` row. Best-effort by contract: a ledger failure must never
   * turn a successful completion into an error for the user, and a provider without
   * an `AiProvider` enum member is simply skipped.
   */
  async recordUsage(principal: Principal, input: RecordUsageInput): Promise<void> {
    const provider = AI_PROVIDER_ENUM[input.providerId]
    if (provider === undefined) return
    try {
      await withTenantTransaction(this.db, (tx) =>
        tx.aiUsage.create({
          data: {
            organizationId: principal.organizationId,
            userId: principal.type === 'user' ? principal.id : null,
            kind: input.capability as never,
            provider: provider as never,
            model: input.model,
            operation: input.operation,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            ...(input.latencyMs === undefined ? {} : { latencyMs: input.latencyMs }),
            succeeded: input.succeeded,
            ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          },
        }),
      )
    } catch {
      // Swallow: usage accounting is never on the critical path of a response.
    }
  }

  /** Recent usage rows for the org, newest first. */
  async recentUsage(limit = 50): Promise<unknown[]> {
    return withTenantTransaction(this.db, (tx) =>
      tx.aiUsage.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          provider: true,
          model: true,
          operation: true,
          inputTokens: true,
          outputTokens: true,
          cachedTokens: true,
          costUsd: true,
          latencyMs: true,
          succeeded: true,
          createdAt: true,
        },
      }),
    )
  }
}
