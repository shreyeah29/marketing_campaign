import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

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

/** A `{ label, value }` row from the brand kit's JSON columns. */
interface LabelledValue {
  label?: unknown
  value?: unknown
}

/** Reads a JSON column as `{ label, value }` rows, discarding malformed entries. */
function labelledRows(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const row = (entry ?? {}) as LabelledValue
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const value = typeof row.value === 'string' ? row.value.trim() : ''
      return { label, value }
    })
    .filter((row) => row.value.length > 0)
    .slice(0, 8)
}

/** Reads a JSON column as a plain string list. */
function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12)
}

/** The brand kit's factual block, rendered as prompt lines. */
function brandKitLines(
  branding: {
    contactEmail?: string | null
    contactPhones?: unknown
    offices?: unknown
    services?: unknown
    disclaimers?: unknown
  } | null,
): string[] {
  if (!branding) return []
  const fmt = (rows: { label: string; value: string }[]): string =>
    rows.map((r) => (r.label ? `${r.label}: ${r.value}` : r.value)).join(' · ')

  const phones = labelledRows(branding.contactPhones)
  const offices = labelledRows(branding.offices)
  const disclaimers = labelledRows(branding.disclaimers)
  const services = stringList(branding.services)

  return [
    branding.contactEmail ? `Email: ${branding.contactEmail}` : null,
    phones.length > 0 ? `Phone: ${fmt(phones)}` : null,
    offices.length > 0 ? `Offices: ${fmt(offices)}` : null,
    services.length > 0 ? `Services offered: ${services.join(', ')}` : null,
    disclaimers.length > 0
      ? `Required advertising disclaimers (the system stamps these; do not invent your own): ${fmt(disclaimers)}`
      : null,
  ].filter((line): line is string => line !== null)
}

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
    /** The whole poster's copy. See the prompt's WORDS ON THE POSTER. */
    posterText?: Record<string, unknown>
    /** POSTER draws the words; PHOTO forbids them. See PICTURE TYPES. */
    visualStyle?: string
  }>
}

/**
 * Keep a poster message only when it is real and short.
 *
 * Length is a design constraint, not a preference: the headline is the largest
 * type on the poster and the band grows to hold it, so an unbounded string eats
 * the artwork it was meant to sit on. Anything without a headline is dropped
 * whole — a subline with nothing above it is a caption in the wrong place.
 */
function normalizePosterText(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>

  const line = (key: string, max: number): string => {
    const value = o[key]
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
  }

  const headline = line('headline', 70)
  if (headline.length === 0) return null

  // Length caps are layout constraints, not style preferences: the offer is set
  // enormous and a long string there stops being a focal point, and an icon
  // caption that wraps to three lines breaks the row it sits in.
  const out: Record<string, unknown> = { headline }
  for (const [key, max] of [
    ['subline', 110],
    ['offer', 24],
    ['offerNote', 40],
    ['condition', 60],
    ['dateLine', 40],
    ['footnote', 30],
  ] as const) {
    const value = line(key, max)
    if (value) out[key] = value
  }

  const features = Array.isArray(o['features'])
    ? o['features']
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 28))
        .slice(0, 4)
    : []
  if (features.length > 0) out['features'] = features

  return out
}

@Injectable()
export class CampaignGenerationService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * Step 1 of the AI campaign flow: produce a structured *plan* (name, objective,
   * audience, platforms, duration, deliverables) WITHOUT generating or persisting
   * any assets. The workspace shows this for the user to confirm before spending a
   * full generation. Reuses the platform LLM; nothing is written to the database.
   */
  /**
   * The tenant's brand profile as a prompt block — the onboarding promise kept.
   * Whatever the operator captured (vision, audience, tagline, tone) shapes every
   * plan and every asset. Best-effort: an org without a profile gets ''.
   */
  private async brandContext(principal: Principal): Promise<string> {
    try {
      const [settings, branding, org, rejections, approvedCreatives] = await withTenantTransaction(
        this.db,
        (tx) =>
          Promise.all([
            tx.organizationSettings.findFirst(),
            tx.branding.findFirst(),
            tx.organization.findFirst({
              where: { id: principal.organizationId },
              select: { name: true, industry: true, metadata: true },
            }),
            // The learning loop: recent human rejection reasons become standing
            // negative guidance, so the same mistake isn't generated twice.
            tx.campaignAssetComment.findMany({
              where: { event: 'rejected', body: { startsWith: 'Rejected: ' } },
              orderBy: { createdAt: 'desc' },
              take: 8,
              select: { body: true },
            }),
            // ...and recently approved visual concepts are the positive signal.
            tx.campaignAsset.findMany({
              where: {
                kind: { in: ['IMAGE_PROMPT', 'VIDEO_PROMPT'] },
                status: { in: ['APPROVED', 'SCHEDULED', 'PUBLISHED'] },
                deletedAt: null,
                title: { not: null },
              },
              orderBy: { updatedAt: 'desc' },
              take: 5,
              select: { title: true },
            }),
          ]),
      )
      const meta = (org?.metadata ?? {}) as Record<string, unknown>
      const avoid = [...new Set(rejections.map((r) => r.body.slice('Rejected: '.length).trim()))]
        .filter((r) => r.length > 0)
        .slice(0, 5)
      const liked = approvedCreatives.map((a) => a.title).filter(Boolean)
      const lines = [
        org ? `Company: ${org.name}${org.industry ? ` (${org.industry})` : ''}` : null,
        typeof meta['description'] === 'string' ? `About: ${meta['description']}` : null,
        settings?.tagline ? `Tagline: ${settings.tagline}` : null,
        settings?.brandVoice ? `Vision & brand voice: ${settings.brandVoice}` : null,
        settings?.targetAudience ? `Target audience: ${settings.targetAudience}` : null,
        branding?.aiPersonality ? `Tone: ${branding.aiPersonality}` : null,
        liked.length > 0 ? `Creative direction they approved recently: ${liked.join('; ')}` : null,
        avoid.length > 0
          ? `AVOID — feedback from recently rejected content: ${avoid.join('; ')}`
          : null,
      ].filter(Boolean)

      // The factual block. These are printed onto the artwork afterwards, so the
      // model is told they exist — to leave room and to stay consistent with
      // them — and told explicitly not to draw them. Image models render text as
      // plausible-looking gibberish, and a flyer with a mangled phone number is
      // worse than no flyer.
      const kit = brandKitLines(branding)
      const facts =
        kit.length > 0
          ? `\n\nBUSINESS DETAILS — these are real and will be typeset onto the artwork by the system.\nNever spell them out inside an IMAGE_PROMPT; instead leave clean, uncluttered space for them.\n${kit.join('\n')}`
          : ''

      // Regulated professions cannot make certain claims, and the reviewer's
      // check catches these after the fact. Saying so up front is cheaper than
      // a rewrite, and far cheaper than the claim reaching an audience.
      const banned = stringList(branding?.bannedClaims)
      const prohibitions =
        banned.length > 0
          ? `\n\nPROHIBITED CLAIMS — this business advertises under professional-conduct rules. Never use these words or phrases, in any form, in any copy, headline, caption or call to action: ${banned.join(', ')}. Rephrase around them rather than approximating them.`
          : ''

      if (lines.length === 0 && facts === '' && prohibitions === '') return ''
      return `BRAND PROFILE — write ALL content in this brand's voice, for this audience:\n${lines.join('\n')}${facts}${prohibitions}\n\n`
    } catch {
      return ''
    }
  }

  async plan(principal: Principal, brief: string): Promise<CampaignPlan> {
    const resolved = await this.ai.resolve('LLM')
    const adapter = resolved ? getLlmAdapter(resolved.providerId) : undefined
    if (!resolved || !adapter) throw new ServiceUnavailableException(AI_UNAVAILABLE)
    const model = resolved.model ?? adapter.defaultModel
    const brand = await this.brandContext(principal)
    const startedAt = Date.now()
    try {
      const result = await adapter.chat({
        apiKey: resolved.apiKey,
        model,
        maxTokens: 2000,
        messages: [
          { role: 'system', content: PLAN_PROMPT },
          {
            role: 'user',
            content: `${brand}Brief: ${brief}\n\nReturn ONLY the JSON object described.`,
          },
        ],
      })
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model: result.model,
        operation: 'campaign.plan',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      })
      return parseCampaignPlan(result.content)
    } catch (err) {
      this.logger.error({ err, model, operation: 'campaign.plan' }, 'AI campaign planning failed')
      throw new ServiceUnavailableException(AI_UNAVAILABLE)
    }
  }

  async generate(
    principal: Principal,
    brief: string,
    /** Exact words for the artwork, typed by the person rather than inferred. */
    posterText?: string,
  ): Promise<{ campaignId: string; assetCount: number; strategy: unknown }> {
    const resolved = await this.ai.resolve('LLM')
    const adapter = resolved ? getLlmAdapter(resolved.providerId) : undefined
    if (!resolved || !adapter) throw new ServiceUnavailableException(AI_UNAVAILABLE)

    const model = resolved.model ?? adapter.defaultModel
    const brand = await this.brandContext(principal)
    const startedAt = Date.now()

    let plan: GeneratedPlan
    try {
      const result = await adapter.chat({
        apiKey: resolved.apiKey,
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${brand}Marketing brief: ${brief}\n\nReturn ONLY the JSON object described.`,
          },
        ],
        // A full multi-platform campaign is a large JSON document, and reasoning
        // models spend part of the budget on hidden reasoning tokens — the old
        // 1024 cap truncated the output and JSON.parse failed. Ask for generous
        // headroom; the adapter clamps automatically if the model's limit is lower.
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

      const typed = posterText?.trim().slice(0, 70) ?? ''
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
        // Only on artwork. Copy carries its message in the body; a headline on a
        // caption asset would be typeset onto nothing.
        /**
         * The typed line wins where the model left one out.
         *
         * Precedence rather than replacement: a brief that asks for different
         * words on different concepts still gets them, and a person who typed a
         * line once gets it on every poster that would otherwise carry none. A
         * stated instruction should not depend on a model remembering it.
         */
        /**
         * Anything but an explicit POSTER is a photograph.
         *
         * The safe direction: a photograph mislabelled a poster comes back with
         * invented lettering all over it, where a poster mislabelled a
         * photograph is merely a picture without its words — visible, and one
         * click from being regenerated.
         */
        visualStyle:
          normalizeKind(a.kind) === 'IMAGE_PROMPT' && a.visualStyle === 'POSTER'
            ? 'POSTER'
            : 'PHOTO',
        posterText:
          normalizeKind(a.kind) === 'IMAGE_PROMPT'
            ? (normalizePosterText(a.posterText) ?? (typed ? { headline: typed } : null))
            : null,
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

/** The structured plan returned by {@link CampaignGenerationService.plan}. */
export interface CampaignPlan {
  campaignName: string
  objective: string
  audience: string
  strategy: string
  platforms: string[]
  durationDays: number
  suggestedBudget: number
  deliverables: string[]
  estimatedAssets: number
}

const PLAN_PROMPT = `You are an expert marketing strategist acting as a Marketing Director. Given a brief (and any requested output channels), design a campaign PLAN — NOT the content itself. Return a SINGLE JSON object (no markdown, no prose) with EXACTLY this shape:
{
  "campaignName": string,          // punchy, specific
  "objective": string,             // one clear sentence
  "audience": string,              // who this targets
  "strategy": string,              // 2-3 sentence approach
  "platforms": string[],           // channels, e.g. ["Instagram","Facebook","Google Ads","Email"]
  "durationDays": number,          // recommended run length
  "suggestedBudget": number,       // USD, realistic
  "deliverables": string[],        // e.g. ["6 Instagram posts","3 Meta ad variants","2 email sends","1 landing page"]
  "estimatedAssets": number        // total assets that would be generated
}
Be concrete and realistic for the brief. Return valid JSON only.`

function parseCampaignPlan(raw: string): CampaignPlan {
  const text = raw
    .trim()
    .replace(/^\`\`\`(?:json)?/i, '')
    .replace(/\`\`\`$/, '')
    .trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : text
  const p = JSON.parse(json) as Partial<CampaignPlan>
  return {
    campaignName: String(p.campaignName ?? 'AI Campaign'),
    objective: String(p.objective ?? ''),
    audience: String(p.audience ?? ''),
    strategy: String(p.strategy ?? ''),
    platforms: Array.isArray(p.platforms) ? p.platforms.map(String) : [],
    durationDays: Number.isFinite(p.durationDays) ? Number(p.durationDays) : 14,
    suggestedBudget: Number.isFinite(p.suggestedBudget) ? Number(p.suggestedBudget) : 0,
    deliverables: Array.isArray(p.deliverables) ? p.deliverables.map(String) : [],
    estimatedAssets: Number.isFinite(p.estimatedAssets) ? Number(p.estimatedAssets) : 0,
  }
}

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
      "kind": "POST"|"AD_COPY"|"AD_HEADLINE"|"AD_DESCRIPTION"|"CAPTION"|"IMAGE_PROMPT"|"VIDEO_PROMPT",
      "posterText": { "headline": string, "subline"?: string } | omitted,
      "visualStyle": "POSTER"|"PHOTO",   // IMAGE_PROMPT only — see PICTURE TYPES in the brief
      "title": string, "body": string, "caption": string, "hashtags": string[], "cta": string }
  ]
}
Produce at least one POST per platform (Instagram, Facebook, LinkedIn, X, Google) plus a few ad-copy assets. Keep captions platform-appropriate.
ALSO produce 2-4 IMAGE_PROMPT assets (poster/visual concepts) and 1-2 VIDEO_PROMPT assets (short clip concepts). For these, "title" is the concept name and "body" is a rich, detailed generation prompt for an AI image/video model — subject, composition, lighting, mood, colours, style — written to match the brand.

CRITICAL for every IMAGE_PROMPT: the artwork must contain NO text, NO lettering, NO numbers, NO logos, NO signage and NO watermarks of any kind. Image models cannot spell, and a poster with an invented phone number is unusable. Describe only the picture, and end every IMAGE_PROMPT body with: "No text, letters, numbers or logos anywhere in the image. Leave the lower quarter visually calm and uncluttered — a plain surface, sky, gradient or shadow — with no important subject matter there." The real name, phone numbers, email and logo are typeset onto that space afterwards by the system.

WORDS ON THE POSTER — for every IMAGE_PROMPT whose "visualStyle" is "POSTER", you write the whole poster's copy. The person described what they want; they are not going to type the lines. Fill "posterText" with as much of this as the campaign supports:

{
  "headline":   "the line read first, 3-6 words, title case",
  "subline":    "a warmer second phrase, 3-8 words — optional",
  "offer":      "the focal element, very short: 1+1, 40% OFF, BUY 2 GET 1",
  "offerNote":  "what it applies to: ON ALL ITEMS — optional",
  "condition":  "the catch, if there is one: WHEN YOU BRING YOUR SIBLING — optional",
  "features":   ["2-4 benefit captions, 2-3 words each, for a row of icons"],
  "dateLine":   "when it runs, e.g. 9TH – 19TH AUGUST — only if the brief gives dates",
  "footnote":   "*T&C Apply — only when there are real terms"
}

Write these from the campaign's own facts. Every one is typeset onto the artwork exactly as written, so they must be spelled correctly and must be true: never invent an offer, a date or a condition the brief did not state, and leave a field out rather than filling it with something plausible. NEVER put an amount of money in any of them — the offer may be "1+1" or "40% OFF", never "₹99" — because prices are typeset from the catalogue where they cannot drift. Do not repeat any of this inside the picture description; the description says what the picture shows, "posterText" says what it says.

For a "PHOTO" concept omit "posterText" entirely: a photograph carries no words.

Return valid JSON only.`

function parsePlan(raw: string): GeneratedPlan {
  // Models sometimes wrap JSON in prose or code fences — extract the object.
  const text = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
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
  const valid = [
    'POST',
    'STORY',
    'REEL',
    'CAPTION',
    'AD_COPY',
    'AD_HEADLINE',
    'AD_DESCRIPTION',
    'IMAGE_PROMPT',
    'VIDEO_PROMPT',
  ]
  return valid.includes(up) ? up : 'POST'
}
