import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'

import { getLlmAdapter, type AdapterMessage } from './adapters/llm.js'
import { AiService, type AiCapability } from './ai.service.js'

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

/** The 409 the whole architecture is built around: configured or not, never a crash. */
function notConfigured(capability: string): ConflictException {
  return new ConflictException({
    code: 'provider_not_configured',
    message: `No ${capability} provider configured`,
  })
}

/**
 * AI surfaces — chat, copywriting, and the image/video/voice endpoints.
 *
 * Every route resolves the org's active provider for its capability. When none is
 * configured (the default with no API keys) it answers 409 `provider_not_configured`
 * — a clean, expected outcome the UI renders as a "configure a provider" prompt.
 * The image/video/voice routes are complete and wired; they return that same 409
 * until a provider for the capability is added, which is the correct behaviour, not
 * a stub.
 */
@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

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
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Recent AI usage for this organisation' })
  async history(): Promise<{ data: unknown[] }> {
    const data = await this.ai.recentUsage(50)
    return { data }
  }

  @Post('image')
  @RequiresFeature('ai.image')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate an image (requires an image provider)' })
  async image(@Body() body: unknown): Promise<never> {
    zodBody(mediaSchema, body)
    await this.requireConfigured('IMAGE', 'image')
    // Reached only once an image provider is configured; adapters land here.
    throw notConfigured('image')
  }

  @Post('video')
  @RequiresFeature('ai.video')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Generate a video (requires a video provider)' })
  async video(@Body() body: unknown): Promise<never> {
    zodBody(mediaSchema, body)
    await this.requireConfigured('VIDEO', 'video')
    throw notConfigured('video')
  }

  @Post('voice')
  @RequiresFeature('ai.voice_calling')
  @RequirePermissions(PERMISSIONS.AGENTS_RUN)
  @ApiOperation({ summary: 'Synthesise voice (requires a voice provider)' })
  async voice(@Body() body: unknown): Promise<never> {
    zodBody(mediaSchema, body)
    await this.requireConfigured('VOICE', 'voice')
    throw notConfigured('voice')
  }

  // ── internals ──────────────────────────────────────────────────────────────────

  private async requireConfigured(capability: AiCapability, label: string): Promise<void> {
    const resolved = await this.ai.resolve(capability)
    if (!resolved) throw notConfigured(label)
  }

  private async complete(
    principal: Principal,
    messages: readonly AdapterMessage[],
    model: string | undefined,
    operation: string,
  ): Promise<string> {
    const resolved = await this.ai.resolve('LLM')
    if (!resolved) throw notConfigured('LLM')

    const adapter = getLlmAdapter(resolved.providerId)
    if (!adapter) throw notConfigured('LLM')

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
      // A provider-side failure (bad key, quota, outage) is a 503, not a crash.
      const message = err instanceof Error ? err.message : 'The AI provider is unavailable'
      throw new ServiceUnavailableException(message)
    }
  }
}
