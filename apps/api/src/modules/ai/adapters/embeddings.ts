/**
 * Text embeddings via OpenAI, using the platform-managed key (env only, never the
 * database, never the user) — the same built-in-AI contract as the chat adapters.
 *
 * Used on the query side (semantic search, RAG retrieval in the API) and the
 * indexing side (the worker embeds document chunks). One tiny fetch wrapper keeps
 * the request shape identical on both sides.
 */
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

/** Must match the pgvector column dimension (vector(1536)) and the KB default. */
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

export interface EmbeddingResult {
  readonly embeddings: number[][]
  readonly model: string
  readonly totalTokens: number
}

export async function embedTexts(
  apiKey: string,
  texts: readonly string[],
  model: string = EMBEDDING_MODEL,
): Promise<EmbeddingResult> {
  if (texts.length === 0) return { embeddings: [], model, totalTokens: 0 }

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: texts }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`embeddings request failed (${String(res.status)}): ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    data?: { embedding: number[] }[]
    model?: string
    usage?: { total_tokens?: number }
  }
  return {
    embeddings: (data.data ?? []).map((d) => d.embedding),
    model: data.model ?? model,
    totalTokens: data.usage?.total_tokens ?? 0,
  }
}

/** Formats a vector for a pgvector literal / parameter: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`
}
