/**
 * LLM provider adapters.
 *
 * Each adapter turns the platform-neutral `{ apiKey, model, messages }` request
 * into a real HTTP call to a concrete provider's chat endpoint and returns the
 * assistant's text plus token accounting. The set mirrors the LLM providers in
 * `@vsp/contracts` (`packages/contracts/src/providers.ts`).
 *
 * These deliberately live under the API app rather than in `@vsp/providers`, so
 * no workspace packaging is required — the registry is a plain lookup the AI
 * module consumes directly. Business code still depends on the neutral shape
 * below, so swapping a provider stays a configuration change.
 *
 * Nothing here reads an environment variable or a stored credential: the API key
 * is passed in by the caller, already decrypted. An adapter that cannot reach its
 * provider throws — it never returns a fabricated answer.
 */

export type AdapterRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AdapterMessage {
  readonly role: AdapterRole
  readonly content: string
}

export interface AdapterChatInput {
  readonly apiKey: string
  readonly model?: string
  readonly messages: readonly AdapterMessage[]
  readonly maxTokens?: number
  readonly temperature?: number
  readonly signal?: AbortSignal
}

export interface AdapterTokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface AdapterChatResult {
  readonly content: string
  /** The concrete model that served the request, for the usage ledger. */
  readonly model: string
  readonly usage: AdapterTokenUsage
}

export interface LlmAdapter {
  readonly providerId: string
  /** Used when the caller supplies no model — every call must resolve to one. */
  readonly defaultModel: string
  chat(input: AdapterChatInput): Promise<AdapterChatResult>
}

/** Raised when a provider call fails. The controller maps this to a 503, never a crash. */
export class AdapterError extends Error {
  constructor(
    override readonly message: string,
    readonly providerId: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AdapterError'
  }
}

// A cap, not a charge — you pay only for tokens actually produced. Kept generous
// so reasoning-era models (which spend hidden reasoning tokens against this cap)
// don't truncate normal chat/copywriter replies.
const DEFAULT_MAX_TOKENS = 4096

async function readError(res: Response, providerId: string): Promise<AdapterError> {
  let detail = `${providerId} request failed (${String(res.status)})`
  try {
    const body = (await res.json()) as { error?: { message?: string }; message?: string }
    const msg = body?.error?.message ?? body?.message
    if (typeof msg === 'string' && msg.length > 0) detail = msg
  } catch {
    // Body was not JSON; keep the generic detail.
  }
  return new AdapterError(detail, providerId, res.status)
}

// ── OpenAI-compatible providers ─────────────────────────────────────────────────
// OpenAI, OpenRouter, DeepSeek and Mistral all speak the same /chat/completions
// contract, so one implementation serves all four — only base URL, default model
// and id differ.

interface OpenAiCompatConfig {
  readonly providerId: string
  readonly defaultModel: string
  readonly baseUrl: string
  readonly extraHeaders?: Record<string, string>
}

function openAiCompatAdapter(cfg: OpenAiCompatConfig): LlmAdapter {
  return {
    providerId: cfg.providerId,
    defaultModel: cfg.defaultModel,
    async chat(input: AdapterChatInput): Promise<AdapterChatResult> {
      const model = input.model ?? cfg.defaultModel

      // Newer OpenAI models (the reasoning generation — gpt-5.x, o-series) speak a
      // slightly different Chat Completions dialect than gpt-4-era models: they use
      // `max_completion_tokens` instead of `max_tokens` and reject any `temperature`
      // other than the default (1). Older models want the opposite. Rather than
      // branch on an ever-changing model list, we start with the classic parameters
      // and, if the provider rejects one, drop/rename it and retry. Self-healing and
      // forward-compatible with models that don't exist yet.
      const body: Record<string, unknown> = {
        model,
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      }

      // At most three attempts: initial + one fix for tokens + one fix for temperature.
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(cfg.baseUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${input.apiKey}`,
            ...(cfg.extraHeaders ?? {}),
          },
          body: JSON.stringify(body),
          ...(input.signal ? { signal: input.signal } : {}),
        })

        if (res.ok) {
          const data = (await res.json()) as {
            model?: string
            choices?: { message?: { content?: string } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          const content = data.choices?.[0]?.message?.content ?? ''
          return {
            content,
            model: data.model ?? model,
            usage: {
              inputTokens: data.usage?.prompt_tokens ?? 0,
              outputTokens: data.usage?.completion_tokens ?? 0,
            },
          }
        }

        const err = await readError(res, cfg.providerId)
        const lower = err.message.toLowerCase()
        const isParamError = res.status === 400 || res.status === 422
        // `max_tokens` unsupported → the model wants `max_completion_tokens`.
        if (isParamError && lower.includes('max_tokens') && 'max_tokens' in body) {
          body.max_completion_tokens = body.max_tokens
          delete body.max_tokens
          continue
        }
        // `temperature` unsupported → drop it and let the model use its default.
        if (isParamError && lower.includes('temperature') && 'temperature' in body) {
          delete body.temperature
          continue
        }
        throw err
      }
      // Exhausted retries without a rejection we know how to fix.
      throw new AdapterError(`${cfg.providerId} rejected the request parameters`, cfg.providerId, 400)
    },
  }
}

// ── Anthropic ────────────────────────────────────────────────────────────────────
// The Messages API takes `system` separately and only user/assistant turns.

function anthropicAdapter(): LlmAdapter {
  const defaultModel = 'claude-3-5-sonnet-latest'
  return {
    providerId: 'anthropic',
    defaultModel,
    async chat(input: AdapterChatInput): Promise<AdapterChatResult> {
      const model = input.model ?? defaultModel
      const system = input.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
      const turns = input.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(system.length > 0 ? { system } : {}),
          messages: turns,
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        }),
        ...(input.signal ? { signal: input.signal } : {}),
      })
      if (!res.ok) throw await readError(res, 'anthropic')

      const data = (await res.json()) as {
        model?: string
        content?: { type?: string; text?: string }[]
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      const content = (data.content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('')
      return {
        content,
        model: data.model ?? model,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      }
    },
  }
}

// ── Google Gemini ──────────────────────────────────────────────────────────────
// generateContent: roles are user/model, system is a separate systemInstruction,
// and the key travels as a query param.

function googleAdapter(): LlmAdapter {
  const defaultModel = 'gemini-1.5-flash'
  return {
    providerId: 'google',
    defaultModel,
    async chat(input: AdapterChatInput): Promise<AdapterChatResult> {
      const model = input.model ?? defaultModel
      const system = input.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
      const contents = input.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }))

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
        `?key=${encodeURIComponent(input.apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(system.length > 0 ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS },
        }),
        ...(input.signal ? { signal: input.signal } : {}),
      })
      if (!res.ok) throw await readError(res, 'google')

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      }
      const content = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
      return {
        content,
        model,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      }
    },
  }
}

const ADAPTERS: ReadonlyMap<string, LlmAdapter> = new Map(
  [
    openAiCompatAdapter({
      providerId: 'openai',
      defaultModel: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
    }),
    openAiCompatAdapter({
      providerId: 'openrouter',
      defaultModel: 'openai/gpt-4o-mini',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    }),
    openAiCompatAdapter({
      providerId: 'deepseek',
      defaultModel: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/chat/completions',
    }),
    openAiCompatAdapter({
      providerId: 'mistral',
      defaultModel: 'mistral-small-latest',
      baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    }),
    anthropicAdapter(),
    googleAdapter(),
  ].map((adapter) => [adapter.providerId, adapter]),
)

/**
 * Resolves the adapter for a provider id, or `undefined` when the platform has no
 * adapter for it. The caller treats `undefined` as "not configured" and responds
 * gracefully — it must never throw here.
 */
export function getLlmAdapter(providerId: string): LlmAdapter | undefined {
  return ADAPTERS.get(providerId)
}
