import { createHash } from 'node:crypto'
import { Body, Controller, Get, Inject, Post, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { AppLogger } from '@marketing-os/observability'
import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'

import { getLlmAdapter, type AdapterMessage } from './adapters/llm.js'
import { generateImage, synthesizeSpeech } from './adapters/openai-media.js'
import { generateRunwayImage, generateRunwayVideo } from './adapters/runway.js'
import { AiService } from './ai.service.js'
import { StorageService } from '../../infrastructure/storage.js'
import { KnowledgeService } from './knowledge.service.js'
import {
  buildCoachAnswerPrompt,
  buildCoachPrompt,
  parseCoachResult,
  scrubCoachResult,
  scrubMoney,
  type CoachGrounding,
  type CoachResult,
} from './brief-coach.prompt.js'
import {
  buildRecommendPrompt,
  fallbackRecommendations,
  parseRecommendations,
  type Recommendation,
} from './direction-recommender.js'

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1),
})

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1),
  model: z.string().min(1).optional(),
})

const generateSchema = z.object({
  prompt: z.string().min(1),
  tone: z.string().max(60).optional(),
  format: z.string().max(60).optional(),
  model: z.string().min(1).optional(),
})

const coachSchema = z.object({
  brief: z.string().min(1).max(8000),
  /** Set once a visual direction exists elsewhere. Not a coverage dimension. */
  lookChosen: z.boolean().optional(),
})

const recommendSchema = z.object({ brief: z.string().min(4).max(4000) })

const coachAskSchema = z.object({
  brief: z.string().max(8000).optional(),
  question: z.string().min(1).max(500),
})

const mediaSchema = z.object({
  prompt: z.string().min(1),
})

const imageSchema = z.object({
  prompt: z.string().min(1),
  size: z.string().min(1).optional(),
})

const voiceSchema = z.object({
  // Accept either `text` or `prompt` for the copy to speak.
  text: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
})

/**
 * AI is a built-in platform service. A failure is a generic 503 that never mentions
 * OpenAI, a provider, or an API key — users are unaware any of that exists.
 */
const AI_UNAVAILABLE = 'AI is temporarily unavailable. Please try again in a moment.'
function aiUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(AI_UNAVAILABLE)
}

/**
 * AI surfaces — chat, copywriting, and the image/video/voice endpoints.
 *
 * LLM (chat, copywriter) uses the platform-managed key from the environment and
 * works for every organisation with zero setup. Image/video/voice are not yet part
 * of the built-in service and return a generic unavailable response — never a
 * provider/key prompt.
 */
/**
 * A short, stable key for a prompt. These two endpoints persist nothing to the
 * database — the file in the bucket is the whole record — so the key comes from
 * the request. Asking for the same picture twice replaces it rather than
 * accumulating near-identical files nothing references.
 */
function promptKey(prompt: string): string {
  return createHash('sha256').update(prompt.trim()).digest('hex').slice(0, 24)
}

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService,
    @Inject(LOGGER) private readonly logger: AppLogger,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(DATABASE) private readonly db: DatabaseClient,
  ) {}

  @Post('chat')
  @RequiresFeature('ai.chat')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: "Chat with the org's configured LLM" })
  async chat(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ role: 'assistant'; content: string }> {
    const input = zodBody(chatSchema, body)

    // RAG: ground the answer in the org's uploaded knowledge. Best-effort — if
    // there is no knowledge (or no embedding key), retrieval returns nothing and
    // the chat proceeds normally.
    const messages = await this.withKnowledgeContext(principal, input.messages)
    const content = await this.complete(principal, messages, input.model, 'chat')
    return { role: 'assistant', content }
  }

  /**
   * Prepends a system message with the most relevant knowledge-base passages for
   * the latest user turn, so the assistant can cite the organisation's own
   * documents. Returns the messages unchanged when nothing relevant is found.
   */
  private async withKnowledgeContext(
    principal: Principal,
    messages: readonly AdapterMessage[],
  ): Promise<AdapterMessage[]> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    // Retrieval searches on text. A multi-part message carries an image, and
    // there is nothing in it to search a knowledge base with — so it is left
    // alone rather than stringified into a query of "[object Object]".
    const query = typeof lastUser?.content === 'string' ? lastUser.content : ''
    if (!query) return [...messages]

    const chunks = await this.knowledge.retrieveForOrg(principal.organizationId, query, 6)
    if (chunks.length === 0) return [...messages]

    const context = chunks
      .map((c, i) => `[${String(i + 1)}] (from "${c.documentTitle}")\n${c.content}`)
      .join('\n\n')
    const system: AdapterMessage = {
      role: 'system',
      content:
        "Use the following context from the organisation's knowledge base to answer when relevant. " +
        'If the answer is not in the context, say so and answer from general knowledge.\n\n' +
        context,
    }
    return [system, ...messages]
  }

  @Post('generate')
  @RequiresFeature('ai.copywriter')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate copy from a prompt, tone and format' })
  async generate(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ content: string }> {
    const input = zodBody(generateSchema, body)

    const directives: string[] = []
    if (input.tone) directives.push(`Tone: ${input.tone}.`)
    if (input.format) directives.push(`Format: ${input.format}.`)
    const system =
      'You are an expert marketing copywriter. Produce polished, ready-to-use copy. ' +
      (directives.length > 0 ? directives.join(' ') : '')

    const messages: AdapterMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: input.prompt },
    ]
    const content = await this.complete(principal, messages, input.model, 'copywriter')
    return { content }
  }

  @Get('history')
  @RequiresFeature('ai.chat')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Recent AI usage for this organisation' })
  async history(): Promise<{ data: unknown[] }> {
    const data = await this.ai.recentUsage(50)
    return { data }
  }

  @Post('image')
  @RequiresFeature('ai.image')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate an image from a text prompt' })
  async image(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ image?: string; url?: string }> {
    const input = zodBody(imageSchema, body)

    // Prefer Runway when the operator has configured it (env-only, never a tenant
    // setting); otherwise fall back to the platform OpenAI image model. Either way
    // the user just gets an image — they never learn which provider served it.
    const runway = this.ai.platformRunwayKey()
    if (runway) {
      try {
        const result = await generateRunwayImage({
          apiKey: runway.apiKey,
          prompt: input.prompt,
          ...(runway.imageModel ? { model: runway.imageModel } : {}),
          persist: (url, key) => this.storage.persistDurable(url, key),
          // Keyed by the prompt rather than the clock: this endpoint stores no
          // row, so the file is all there is, and asking twice for the same
          // picture should not fill the bucket with copies of it.
          storageKey: `${p.organizationId}/ad-hoc/${promptKey(input.prompt)}`,
        })
        return { url: result.url }
      } catch (err) {
        this.logger.error(
          { err, operation: 'image', provider: 'runway' },
          'AI image generation failed',
        )
        throw aiUnavailable()
      }
    }

    const key = this.ai.platformImageKey()
    if (!key) throw aiUnavailable()

    try {
      const result = await generateImage({
        apiKey: key.apiKey,
        prompt: input.prompt,
        ...(input.size ? { size: input.size } : {}),
      })
      if (result.b64) return { image: `data:image/png;base64,${result.b64}` }
      if (result.url) return { url: result.url }
      throw aiUnavailable()
    } catch (err) {
      // Log the real cause server-side (operators need it — bad key, quota, model)
      // but never surface it to the user.
      this.logger.error({ err, operation: 'image' }, 'AI image generation failed')
      throw aiUnavailable()
    }
  }

  @Post('video')
  @RequiresFeature('ai.video')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate a video from a text prompt (Runway)' })
  async video(@Body() body: unknown, @CurrentPrincipal() p: Principal): Promise<{ url: string }> {
    const input = zodBody(mediaSchema, body)

    // Video is operator-level Runway only, resolved from the environment. No key,
    // no video — surfaced as the same generic 503 as any other AI outage.
    const runway = this.ai.platformRunwayKey()
    if (!runway) throw aiUnavailable()

    try {
      const result = await generateRunwayVideo({
        apiKey: runway.apiKey,
        prompt: input.prompt,
        ...(runway.videoModel ? { model: runway.videoModel } : {}),
        ...(runway.imageModel ? { imageModel: runway.imageModel } : {}),
        persist: (url, key) => this.storage.persistDurable(url, key),
        storageKey: `${p.organizationId}/ad-hoc/${promptKey(input.prompt)}`,
      })
      return { url: result.url }
    } catch (err) {
      this.logger.error(
        { err, operation: 'video', provider: 'runway' },
        'AI video generation failed',
      )
      throw aiUnavailable()
    }
  }

  @Post('voice')
  @RequiresFeature('ai.voice_calling')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Synthesise natural-sounding speech from text' })
  async voice(@Body() body: unknown): Promise<{ audio: string }> {
    const input = zodBody(voiceSchema, body)
    const text = input.text ?? input.prompt
    if (!text) throw aiUnavailable()

    const key = this.ai.platformVoiceKey()
    if (!key) throw aiUnavailable()

    try {
      const result = await synthesizeSpeech({
        apiKey: key.apiKey,
        text,
        ...(input.voice ? { voice: input.voice } : {}),
      })
      // Return a base64 data-URL so the browser can play it via <audio src> with no
      // streaming complexity.
      return { audio: `data:${result.contentType};base64,${result.audio.toString('base64')}` }
    } catch (err) {
      this.logger.error({ err, operation: 'voice' }, 'AI voice synthesis failed')
      throw aiUnavailable()
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────────

  /**
   * Read a brief and report what it is missing, in one call.
   *
   * Coverage, the priority gap, the scaffolds, the rewrite and its highlight
   * spans all come back together — the card needs them at the same moment, and
   * two calls would mean the chips and the rewrite could disagree about the same
   * brief.
   *
   * The grounding is gathered here rather than sent by the browser. It keeps
   * three round-trips off the client, and more importantly it is where product
   * prices are dropped: the catalogue has them, the model must not, and a client
   * that assembled its own context could put them back.
   */
  // No @RequiresFeature. The coach is part of writing a brief, not a module
  // sold on top of it: every client who can reach this screen gets it. The
  // permission stays because it is about the person's role rather than the
  // plan — AGENTS_RUN is granted from Member upward, which is everyone who can
  // write a brief in the first place.
  @Post('brief-coach')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Coverage, scaffolds and a sharpened rewrite for a campaign brief' })
  async briefCoach(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<CoachResult> {
    const input = zodBody(coachSchema, body)
    const grounding = await this.coachGrounding()

    const content = await this.complete(
      principal,
      [
        {
          role: 'system',
          content: buildCoachPrompt({ ...grounding, lookChosen: input.lookChosen === true }),
        },
        { role: 'user', content: `BRIEF:\n${input.brief.trim()}` },
      ],
      undefined,
      'brief-coach',
    )

    const parsed = parseCoachResult(content)
    if (!parsed) {
      // The card treats this as "coach unavailable" and keeps its last good
      // state. A partly-parsed result would render as confident advice built
      // from whatever survived, which is worse than nothing.
      this.logger.warn({ operation: 'brief-coach' }, 'coach returned unparseable JSON')
      throw new ServiceUnavailableException('The coach could not read that brief.')
    }
    return scrubCoachResult(parsed)
  }

  /**
   * Which three directions suit this brief.
   *
   * Thirty-eight cards is a better problem than the one before it, but a person
   * who typed "Raksha Bandhan campaign for my café, 1+1 offer" should not then
   * have to learn what thirty-eight things mean. They described the campaign and
   * the system knows its own catalogue; matching them is the system's job.
   *
   * Never fails. The recommendation is a convenience and the whole shelf is on
   * screen underneath it, so no model, a failed call and an unreadable reply all
   * fall back to a keyword pass rather than an error — something sensible at the
   * top beats an empty row and an apology.
   */
  // Ungated for the same reason as the coach: this is part of writing a brief.
  @Post('recommend-directions')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Rank the creative directions against a brief' })
  async recommendDirections(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ picks: Recommendation[]; source: 'model' | 'keywords' }> {
    const input = zodBody(recommendSchema, body)
    const brief = input.brief.trim()

    try {
      const content = await this.complete(
        principal,
        [
          { role: 'system', content: buildRecommendPrompt(brief) },
          { role: 'user', content: 'Return the JSON described. Nothing else.' },
        ],
        undefined,
        'recommend-directions',
      )
      const picks = parseRecommendations(content)
      // A reply that survived parsing but named nothing real is the same
      // outcome as no reply, and the keyword pass is better than one card.
      if (picks.length > 0) return { picks, source: 'model' }
      this.logger.warn({ operation: 'recommend-directions' }, 'no usable direction ids in reply')
    } catch (err) {
      this.logger.warn(
        {
          operation: 'recommend-directions',
          detail: err instanceof Error ? err.message : String(err),
        },
        'direction recommendation fell back to keywords',
      )
    }
    return { picks: fallbackRecommendations(brief), source: 'keywords' }
  }

  /**
   * Answer one typed question about the brief.
   *
   * Short by instruction and scrubbed by default. "How much should I spend?" is
   * a direct request to break the cost boundary, and a model asked directly will
   * usually oblige — so the answer is filtered on the way out rather than
   * trusted on the way in.
   */
  // Ungated for the same reason as the coach itself — see above.
  @Post('brief-coach/ask')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Answer a question about the brief, in a sentence or three' })
  async briefCoachAsk(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ answer: string }> {
    const input = zodBody(coachAskSchema, body)
    const grounding = await this.coachGrounding()

    const context = [
      grounding.products.length > 0 ? `PRODUCTS:\n${grounding.products.join('\n')}` : null,
      grounding.brand.length > 0 ? `BRAND:\n${grounding.brand.join('\n')}` : null,
      grounding.campaigns.length > 0
        ? `RECENT CAMPAIGNS:\n${grounding.campaigns.join('\n')}`
        : null,
      `BRIEF:\n${(input.brief ?? '').trim() || '(empty so far)'}`,
    ]
      .filter((c): c is string => c !== null)
      .join('\n\n')

    const content = await this.complete(
      principal,
      [
        { role: 'system', content: buildCoachAnswerPrompt() },
        { role: 'user', content: `${context}\n\nQUESTION: ${input.question.trim()}` },
      ],
      undefined,
      'brief-coach-ask',
    )

    const { text, changed } = scrubMoney(content.trim())
    if (changed) {
      // Worth knowing about: it means the instruction was not enough, and the
      // only reason nothing leaked is the filter.
      this.logger.warn({ operation: 'brief-coach-ask' }, 'coach answer contained money; scrubbed')
    }
    return { answer: text || 'No answer came back.' }
  }

  /**
   * What the coach is allowed to know.
   *
   * Product **names**, not prices. The distinction is the whole cost boundary in
   * one line: a price the user typed into their own brief survives because it is
   * their text, and a price we hand the model becomes a figure the coach added.
   */
  private async coachGrounding(): Promise<CoachGrounding> {
    try {
      return await withTenantTransaction(this.db, async (tx) => {
        const [products, org, settings, campaigns] = await Promise.all([
          tx.product.findMany({
            where: { deletedAt: null },
            select: { name: true, brand: true },
            take: 20,
            orderBy: { createdAt: 'desc' },
          }),
          tx.organization.findFirst({ select: { name: true, industry: true } }),
          tx.organizationSettings.findFirst({
            select: { tagline: true, brandVoice: true, targetAudience: true },
          }),
          tx.campaign.findMany({
            where: { deletedAt: null },
            select: { name: true, objective: true },
            take: 3,
            orderBy: { createdAt: 'desc' },
          }),
        ])

        return {
          products: products.map((p) => `- ${p.brand ? `${p.brand} ` : ''}${p.name}`),
          brand: [
            org?.name ? `- Business: ${org.name}` : null,
            org?.industry ? `- Industry: ${org.industry}` : null,
            settings?.tagline ? `- Tagline: ${settings.tagline}` : null,
            settings?.brandVoice ? `- Voice: ${settings.brandVoice}` : null,
            settings?.targetAudience ? `- Audience: ${settings.targetAudience}` : null,
          ].filter((b): b is string => b !== null),
          campaigns: campaigns.map(
            (c) => `- ${c.name}${c.objective ? ` (objective: ${c.objective})` : ''}`,
          ),
        }
      })
    } catch {
      // Grounding is enrichment. Without it the coach asks for specifics instead
      // of drawing on the workspace, which is a worse answer and not a failure.
      return { products: [], brand: [], campaigns: [] }
    }
  }

  private async complete(
    principal: Principal,
    messages: readonly AdapterMessage[],
    model: string | undefined,
    operation: string,
  ): Promise<string> {
    const resolved = await this.ai.resolve('LLM')
    const adapter = resolved ? getLlmAdapter(resolved.providerId) : undefined
    if (!resolved || !adapter) throw aiUnavailable()

    const chosenModel = model ?? resolved.model ?? adapter.defaultModel
    const startedAt = Date.now()
    try {
      const result = await adapter.chat({
        apiKey: resolved.apiKey,
        model: chosenModel,
        messages,
      })
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model: result.model,
        operation,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      })
      return result.content
    } catch (err) {
      await this.ai.recordUsage(principal, {
        capability: 'LLM',
        providerId: resolved.providerId,
        model: chosenModel,
        operation,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: 'provider_error',
      })
      // The usage row records *that* it failed; only the log records why. An
      // operator debugging "AI is down" needs to tell a bad key from a quota
      // from an outage, and this handler was discarding that distinction
      // entirely — matching what the image and video handlers already do.
      this.logger.error(
        { err, operation, provider: resolved.providerId, model: chosenModel },
        'AI completion failed',
      )
      // A provider-side failure (bad key, quota, outage) is a generic 503 — never
      // the provider's error text.
      throw aiUnavailable()
    }
  }
}
