import { randomUUID } from 'node:crypto'

import type { Job } from 'bullmq'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import type { WorkerEnv } from '../config.js'

/**
 * Knowledge-base document indexer.
 *
 * Turns a stored document's text into a searchable RAG index: split into chunks,
 * embed each with OpenAI, and store the vectors in `knowledge_chunk` (pgvector).
 * The document's `status` reflects real progress — QUEUED → PROCESSING → READY /
 * FAILED — so the UI shows the truth, never a fake "processing" spinner.
 *
 * Vectors are written with raw SQL because Prisma cannot express the `vector`
 * type; every statement runs inside `withTenantTransaction`, so the org id is set
 * and row-level security applies to the chunk inserts.
 */
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_CHUNK_CHARS = 1200
const CHUNK_OVERLAP = 150
const EMBED_BATCH = 64

interface IndexJobData {
  organizationId: string
  knowledgeBaseId: string
  documentId: string
}

export function createEmbeddingsHandler(env: WorkerEnv) {
  return async function handle(job: Job, db: DatabaseClient, logger: AppLogger): Promise<void> {
    const { organizationId, knowledgeBaseId, documentId } = job.data as IndexJobData
    if (!documentId || !knowledgeBaseId) {
      logger.warn({ jobId: job.id }, 'embeddings job missing document/kb id; skipping')
      return
    }

    // Load the document + mark it processing.
    const doc = await withTenantTransaction(db, async (tx) => {
      const found = await tx.knowledgeDocument.findFirst({
        where: { id: documentId, deletedAt: null },
        select: { id: true, content: true },
      })
      if (!found) return null
      await tx.knowledgeDocument.updateMany({ where: { id: documentId }, data: { status: 'PROCESSING' } })
      return found
    })
    if (!doc) {
      logger.warn({ documentId }, 'document not found (deleted?); skipping index')
      return
    }

    const fail = async (reason: string): Promise<void> => {
      await withTenantTransaction(db, (tx) =>
        tx.knowledgeDocument.updateMany({
          where: { id: documentId },
          data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
        }),
      ).catch(() => undefined)
    }

    if (!env.OPENAI_API_KEY) {
      await fail('AI indexing is not available — no embedding provider is configured.')
      logger.error({ documentId }, 'OPENAI_API_KEY unset; cannot embed document')
      return
    }

    const chunks = chunkText(doc.content ?? '')
    if (chunks.length === 0) {
      // Nothing to index, but that is a valid "ready" state (empty document).
      await withTenantTransaction(db, (tx) =>
        tx.knowledgeDocument.updateMany({
          where: { id: documentId },
          data: { status: 'READY', chunkCount: 0, indexedAt: new Date(), failureReason: null },
        }),
      )
      return
    }

    try {
      // Embed in batches, then persist each chunk with its vector.
      const vectors: number[][] = []
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH)
        vectors.push(...(await embed(env.OPENAI_API_KEY, batch)))
      }
      if (vectors.length !== chunks.length) throw new Error('embedding count mismatch')

      await withTenantTransaction(db, async (tx) => {
        // Replace any prior chunks (reprocess-safe).
        await tx.knowledgeChunk.deleteMany({ where: { documentId } })
        for (let i = 0; i < chunks.length; i++) {
          const literal = `[${vectors[i]!.join(',')}]`
          await tx.$executeRawUnsafe(
            `INSERT INTO knowledge_chunk
               (id, organization_id, knowledge_base_id, document_id, position, content, token_count, embedding, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, now())`,
            randomUUID(),
            organizationId,
            knowledgeBaseId,
            documentId,
            i,
            chunks[i],
            Math.ceil(chunks[i]!.length / 4),
            literal,
          )
        }
        await tx.knowledgeDocument.updateMany({
          where: { id: documentId },
          data: { status: 'READY', chunkCount: chunks.length, indexedAt: new Date(), failureReason: null },
        })
        // Recompute the KB chunk total from its documents so counts stay honest.
        const agg = await tx.knowledgeDocument.aggregate({
          where: { knowledgeBaseId, deletedAt: null },
          _sum: { chunkCount: true },
        })
        await tx.knowledgeBase.updateMany({
          where: { id: knowledgeBaseId },
          data: { chunkCount: agg._sum.chunkCount ?? chunks.length },
        })
      })

      logger.info({ documentId, chunks: chunks.length }, 'indexed knowledge document')
    } catch (err) {
      await fail(err instanceof Error ? err.message : 'indexing failed')
      logger.error({ err, documentId }, 'failed to index knowledge document')
    }
  }
}

/** Splits text into overlapping chunks on paragraph/sentence boundaries. */
function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  const chunks: string[] = []
  let current = ''
  const push = (): void => {
    const t = current.trim()
    if (t) chunks.push(t)
    current = ''
  }

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_CHARS) {
      // Long paragraph: split on sentences, packing up to the chunk size.
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const s of sentences) {
        if (current.length + s.length + 1 > MAX_CHUNK_CHARS) push()
        current += (current ? ' ' : '') + s
      }
      push()
    } else if (current.length + para.length + 2 > MAX_CHUNK_CHARS) {
      push()
      current = para
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }
  push()

  // Add a little overlap so context isn't lost at chunk boundaries.
  if (CHUNK_OVERLAP > 0 && chunks.length > 1) {
    return chunks.map((c, i) => (i === 0 ? c : `${chunks[i - 1]!.slice(-CHUNK_OVERLAP)} ${c}`))
  }
  return chunks
}

async function embed(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`embeddings request failed (${String(res.status)}): ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as { data?: { embedding: number[] }[] }
  return (data.data ?? []).map((d) => d.embedding)
}
