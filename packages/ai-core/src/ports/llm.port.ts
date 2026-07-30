/**
 * The LLM port.
 *
 * This file contains no vendor SDK, no vendor type, and no model name. That is
 * the entire point: `ai-core` describes what the platform needs from a language
 * model, and `packages/providers` supplies adapters. Business logic depends on
 * this interface, so swapping OpenAI for Anthropic is a DI change, not a rewrite.
 *
 * ESLint enforces the boundary — importing `openai` or `@anthropic-ai/sdk`
 * anywhere outside `packages/providers` fails the build.
 */

/** Roles in a model conversation. Deliberately minimal and provider-neutral. */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface TextPart {
  readonly type: 'text'
  readonly text: string
}

export interface ImagePart {
  readonly type: 'image'
  /** Either a URL the provider can fetch, or base64 with its media type. */
  readonly url?: string
  readonly base64?: string
  readonly mediaType?: string
}

export interface ToolCallPart {
  readonly type: 'tool_call'
  readonly id: string
  readonly name: string
  readonly arguments: Record<string, unknown>
}

export interface ToolResultPart {
  readonly type: 'tool_result'
  readonly toolCallId: string
  readonly content: string
  readonly isError?: boolean
}

export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart

export interface LlmMessage {
  readonly role: MessageRole
  readonly content: readonly ContentPart[]
}

/**
 * A tool as the model sees it.
 *
 * The schema is JSON Schema rather than Zod, because that is what every provider
 * accepts on the wire. `packages/ai-core/agents` derives these from Zod schemas,
 * so authors keep type inference and validation while the port stays neutral.
 */
export interface LlmToolSchema {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

/**
 * Capabilities a request needs, expressed as requirements rather than a model name.
 *
 * The router resolves these to a concrete model. Asking for a capability instead
 * of `"gpt-4o"` or `"claude-opus-5"` is what lets a provider be swapped, a model
 * be deprecated, or a cheaper model be substituted for a simple task without
 * touching the agent that made the request.
 */
export interface ModelRequirements {
  /** Minimum reasoning depth. `deep` selects a frontier reasoning model. */
  readonly reasoning?: 'basic' | 'standard' | 'deep'
  /** Set when the prompt includes images. */
  readonly vision?: boolean
  /** Set when the model must be able to call tools. */
  readonly tools?: boolean
  /** Set when the caller needs a schema-constrained response. */
  readonly structuredOutput?: boolean
  /** Minimum usable context window, in tokens. */
  readonly minContextTokens?: number
  /**
   * Optimisation target when several models qualify. Defaults to `balanced`.
   * `cost` matters for high-volume work like lead scoring; `quality` for the
   * strategy documents a customer will actually read.
   */
  readonly optimiseFor?: 'cost' | 'latency' | 'quality' | 'balanced'
}

export interface CompletionRequest {
  readonly messages: readonly LlmMessage[]
  readonly system?: string
  readonly tools?: readonly LlmToolSchema[]
  readonly maxOutputTokens?: number
  /**
   * Response schema, when the caller needs structured output. Providers that
   * support native schema enforcement use it; others fall back to prompt-level
   * instruction plus validation, which the adapter is responsible for.
   */
  readonly responseSchema?: Record<string, unknown>
  /**
   * Reasoning effort, where the provider exposes it. Normalised across
   * providers by the adapter rather than passed through raw.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'max'
  /** Explicit model override. Escape hatch — prefer `requirements`. */
  readonly model?: string
  readonly requirements?: ModelRequirements
  /**
   * Deduplicates a retried request at the provider where supported, and in the
   * usage ledger regardless — so a network retry cannot be billed twice.
   */
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
}

/** Token accounting for one call, as reported by the provider. */
export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  /** Tokens served from the provider's prompt cache, billed at a lower rate. */
  readonly cachedInputTokens?: number
  /** Tokens written to the provider's prompt cache, billed at a premium. */
  readonly cacheWriteTokens?: number
}

export interface CompletionResponse {
  readonly text: string
  readonly toolCalls: readonly ToolCallPart[]
  /** Why generation stopped. `refusal` and `length` need distinct handling. */
  readonly stopReason: 'stop' | 'tool_calls' | 'length' | 'refusal' | 'error'
  readonly usage: TokenUsage
  /** Concrete model that served the request, for the audit trail. */
  readonly model: string
  readonly provider: string
  readonly latencyMs: number
  /** Parsed structured output, when `responseSchema` was supplied. */
  readonly parsed?: unknown
}

/** One chunk of a streamed response. */
export type CompletionChunk =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_call'; readonly toolCall: ToolCallPart }
  | { readonly type: 'done'; readonly response: CompletionResponse }

/**
 * What every LLM adapter implements.
 *
 * Narrow on purpose. A port that grows to cover every provider's every feature
 * stops being swappable, because each adapter then has to fake the parts it
 * lacks. Provider-specific behaviour belongs behind the adapter, expressed
 * through capabilities rather than leaked through this interface.
 */
export interface LlmPort {
  readonly provider: string

  complete(request: CompletionRequest): Promise<CompletionResponse>

  /**
   * Streams a completion. Required rather than optional: agent runs are
   * long-lived, and a UI that shows nothing for 90 seconds reads as broken.
   * Adapters for providers without streaming emit a single terminal chunk.
   */
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>

  /**
   * Counts tokens for a request without executing it.
   *
   * Used to enforce budgets *before* spending, and to reject a prompt that
   * cannot fit rather than discovering it from a truncated answer.
   */
  countTokens(request: CompletionRequest): Promise<number>
}
