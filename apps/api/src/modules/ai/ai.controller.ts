import { Body, Controller, Get, Inject, Post, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { LOGGER } from '../../infrastructure/database.module.js'

import { getLlmAdapter, type AdapterMessage } from './adapters/llm.js'
import { generateImage, synthesizeSpeech } from './adapters/openai-media.js'
import { AiService } from './ai.service.js'

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
@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  @Post('chat')
  @RequiresFeature('ai.chat')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Chat with the org\'s configured LLM' })
  async chat(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ role: 'assistant'; content: string }> {
    const input = zodBody(chatSchema, body)
    const content = await this.complete(principal, input.messages, input.model, 'chat')
    return { role: 'assistant', content }
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
  async image(@Body() body: unknown): Promise<{ image?: string; url?: string }> {
    const input = zodBody(imageSchema, body)
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
  @ApiOperation({ summary: 'Generate a video (requires a video provider)' })
  async video(@Body() body: unknown): Promise<never> {
    zodBody(mediaSchema, body)
    throw aiUnavailable()
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
      // A provider-side failure (bad key, quota, outage) is a generic 503 — never
      // the provider's error text.
      throw aiUnavailable()
    }
  }
}
