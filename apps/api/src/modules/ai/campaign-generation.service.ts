import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../../common/auth/principal.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'

import { getLlmAdapter } from './adapters/llm.js'
import { AiService } from './ai.service.js'

/**
 * AI campaign generation — the entry point of the marketing automation engine.
 *
 * A user types a single brief ("Create a campaign for our new product launch")
 * and this turns it into a real, reviewable campaign: a strategy document plus a
 * set of per-platform draft assets (posts, captions, hashtags, CTAs, ad copy) that
 * land in the review queue as `GENERATED`.
 *
 * It reuses the org's configured LLM provider through `AiService`. With no provider
 * configured it throws a 409 the API renders as `provider_not_configured` — the
 * same graceful degradation as the rest of the AI surface. No key, no crash.
 */

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'GOOGLE'] as const

interface GeneratedPlan {
  campaignName: string
  objective: string
  strategy: string
  goals: string[]
  audience: string
  schedule: string
  suggestedBudget: number
  assets: Array<{
    platform: string
    kind: string
    title?: string
    body: string
    caption?: string
    hashtags?: string[]
    cta?: string
  }>
}

@Injectable()
export class CampaignGenerationService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  async generate(
    principal: Principal,
    brief: string,
  ): Promise<{ campaignId: string; assetCount: number; strategy: unknown }> {
    const resolved = await this.ai.resolve('LLM')
    const adapter = resolved ? getLlmAdapter(resolved.providerId) : undefined
    if (!resolved || !adapter) throw new ServiceUnavailableException(AI_UNAVAILABLE)

    const model = resolved.model ?? adapter.defaultModel
    const startedAt = Date.now()

    let plan: GeneratedPlan
    try {
      const result = await adapter.chat({
        apiKey: resolved.apiKey,
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Marketing brief: ${brief}\n\nReturn ONLY the JSON object described.` },
        ],
        // A full multi-platform campaign is a large JSON document, and reasoning
        // models spend part of the budget on hidden reasoning tokens — the default
        // 1024 cap truncates the output and JSON.parse fails. Give it real room.
        maxTokens: 8000,
      })
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model: result.model,
        operation: 'campaign.generate',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      })
      plan = parsePlan(result.content)
    } catch (err) {
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model,
        operation: 'campaign.generate',
        inputTokens: 0,
        outputTokens: 0,
        succeeded: false,
        errorCode: 'provider_error',
      })
      // Log the real cause server-side (operators need it — model name, bad key,
      // quota) but never surface it to the user.
      this.logger.error(
        { err, providerId: resolved.providerId, model, operation: 'campaign.generate' },
        'AI generation failed — check the provider key and OPENAI_MODEL',
      )
      throw new ServiceUnavailableException(AI_UNAVAILABLE)
    }

    // Persist the campaign + its assets in one transaction. Assets enter the review
    // queue as GENERATED, owned by the creator.
    return withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          organizationId: principal.organizationId,
          name: plan.campaignName || 'AI Campaign',
          objective: plan.objective ?? null,
          description: brief,
          status: 'DRAFT',
          strategy: {
            summary: plan.strategy,
            goals: plan.goals ?? [],
            schedule: plan.schedule ?? null,
          } as never,
          targetAudience: { description: plan.audience ?? null } as never,
          budgetTotal: Number.isFinite(plan.suggestedBudget) ? plan.suggestedBudget : null,
        },
      })

      const assets = plan.assets.slice(0, 40).map((a) => ({
        organizationId: principal.organizationId,
        campaignId: campaign.id,
        platform: normalizePlatform(a.platform),
        kind: normalizeKind(a.kind),
        status: 'GENERATED' as const,
        title: a.title ?? null,
        body: a.body ?? '',
        caption: a.caption ?? null,
        hashtags: Array.isArray(a.hashtags) ? a.hashtags.slice(0, 30) : [],
        cta: a.cta ?? null,
        ownerId: principal.type === 'user' ? principal.id : null,
      }))
      if (assets.length > 0) {
        await tx.campaignAsset.createMany({ data: assets as never })
      }

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'campaign.generated',
          resourceType: 'campaign',
          resourceId: campaign.id,
          after: { assets: assets.length, brief },
        },
      })

      // Module 9: assets are waiting for a human — raise an "approval required"
      // notification so a reviewer knows there is work in the queue.
      if (assets.length > 0) {
        await tx.notification.create({
          data: {
            organizationId: principal.organizationId,
            level: 'INFO',
            title: `${String(assets.length)} assets ready for review`,
            body: `Your campaign "${campaign.name}" was generated. Review and approve the assets.`,
            actionUrl: '/app/marketing/campaigns',
          },
        })
      }

      return { campaignId: campaign.id, assetCount: assets.length, strategy: campaign.strategy }
    })
  }

  /**
   * Regenerates the copy for a single asset. Returns the new body text; the caller
   * keeps the previous version for comparison. Throws the same 409 when no provider.
   */
  async regenerateAsset(
    principal: Principal,
    asset: { platform: string; kind: string; body: string; title?: string | null },
  ): Promise<string> {
    const resolved = await this.ai.resolve('LLM')
    const adapter = resolved ? getLlmAdapter(resolved.providerId) : undefined
    if (!resolved || !adapter) throw new ServiceUnavailableException(AI_UNAVAILABLE)
    const startedAt = Date.now()
    try {
      const result = await adapter.chat({
        apiKey: resolved.apiKey,
        model: resolved.model ?? adapter.defaultModel,
        // Room for reasoning-token overhead so the rewrite isn't truncated.
        maxTokens: 2000,
        messages: [
          {
            role: 'system',
            content: `You are a marketing copywriter. Rewrite the given ${asset.platform} ${asset.kind} to be fresh, on-brand and high-converting. Return ONLY the new copy, no preamble.`,
          },
          { role: 'user', content: `Current copy:\n${asset.body}\n\nRewrite it.` },
        ],
      })
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model: result.model,
        operation: 'asset.regenerate',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      })
      return result.content.trim()
    } catch {
      throw new ServiceUnavailableException(AI_UNAVAILABLE)
    }
  }
}

/** The single generic message shown when AI can't run — never leaks provider details. */
const AI_UNAVAILABLE = 'AI is temporarily unavailable. Please try again in a moment.'

const SYSTEM_PROMPT = `You are an expert marketing strategist and copywriter. Given a brief, design a complete multi-channel campaign and return a SINGLE JSON object (no markdown, no prose) with EXACTLY this shape:
{
  "campaignName": string,
  "objective": string,
  "strategy": string,
  "goals": string[],
  "audience": string,
  "schedule": string,
  "suggestedBudget": number,
  "assets": [
    { "platform": "INSTAGRAM"|"FACEBOOK"|"LINKEDIN"|"X"|"GOOGLE",
      "kind": "POST"|"AD_COPY"|"AD_HEADLINE"|"AD_DESCRIPTION"|"CAPTION",
      "title": string, "body": string, "caption": string, "hashtags": string[], "cta": string }
  ]
}
Produce at least one POST per platform (Instagram, Facebook, LinkedIn, X, Google) plus a few ad-copy assets. Keep captions platform-appropriate. Return valid JSON only.`

function parsePlan(raw: string): GeneratedPlan {
  // Models sometimes wrap JSON in prose or code fences — extract the object.
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : text
  const parsed = JSON.parse(json) as Partial<GeneratedPlan>
  return {
    campaignName: String(parsed.campaignName ?? 'AI Campaign'),
    objective: String(parsed.objective ?? ''),
    strategy: String(parsed.strategy ?? ''),
    goals: Array.isArray(parsed.goals) ? parsed.goals.map(String) : [],
    audience: String(parsed.audience ?? ''),
    schedule: String(parsed.schedule ?? ''),
    suggestedBudget: Number(parsed.suggestedBudget ?? 0),
    assets: Array.isArray(parsed.assets) ? (parsed.assets as GeneratedPlan['assets']) : [],
  }
}

function normalizePlatform(p: string): string {
  const up = String(p ?? '').toUpperCase()
  return (PLATFORMS as readonly string[]).includes(up) ? up : 'GENERIC'
}

function normalizeKind(k: string): string {
  const up = String(k ?? '').toUpperCase()
  const valid = ['POST', 'STORY', 'REEL', 'CAPTION', 'AD_COPY', 'AD_HEADLINE', 'AD_DESCRIPTION', 'IMAGE_PROMPT', 'VIDEO_PROMPT']
  return valid.includes(up) ? up : 'POST'
}
