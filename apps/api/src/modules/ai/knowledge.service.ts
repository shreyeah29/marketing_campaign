import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

import { Inject, Injectable } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import { loadEnv } from '../../config/env.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'

import { EMBEDDING_MODEL, embedTexts, toVectorLiteral } from './adapters/embeddings.js'

/** A retrieved chunk with its cosine similarity (1 = identical, 0 = orthogonal). */
export interface RetrievedChunk {
  id: string
  documentId: string
  documentTitle: string
  content: string
  score: number
}

/**
 * The knowledge (RAG) control plane on the API side.
 *
 *   · Enqueues document indexing onto the shared `embeddings` queue — the worker
 *     chunks, embeds and stores the vectors out of process.
 *   · Runs similarity search at query time: it embeds the query with the same
 *     model and does a pgvector nearest-neighbour scan (`<=>` cosine distance)
 *     inside a tenant transaction, so RLS confines the scan to the caller's org.
 *
 * The OpenAI key is the platform-managed one from the environment — never the DB,
 * never the user — exactly like the chat/image/voice surfaces.
 */
@Injectable()
export class KnowledgeService {
  private readonly queue: Queue
  private readonly connection: Redis

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {
    const env = loadEnv()
    this.connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    // Same queue name the worker consumes (QUEUES.EMBEDDINGS = 'embeddings').
    this.queue = new Queue('embeddings', { connection: this.connection })
  }

  /** Whether the platform embeddings key is configured (search/index need it). */
  hasEmbeddingKey(): boolean {
    return Boolean(loadEnv().OPENAI_API_KEY)
  }

  /** Enqueue (re)indexing of one document. The job carries its tenant. */
  async enqueueIndex(
    organizationId: string,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<void> {
    await this.queue.add('index-document', { organizationId, knowledgeBaseId, documentId })
  }

  /**
   * Semantic search within a knowledge base. Returns the top-k most similar
   * chunks. Runs in a tenant transaction so the pgvector scan only ever sees the
   * caller's rows.
   */
  async search(
    organizationId: string,
    knowledgeBaseId: string,
    query: string,
    k = 8,
  ): Promise<RetrievedChunk[]> {
    const key = loadEnv().OPENAI_API_KEY
    if (!key || !query.trim()) return []

    const { embeddings } = await embedTexts(key, [query], EMBEDDING_MODEL)
    const vector = embeddings[0]
    if (!vector) return []
    const literal = toVectorLiteral(vector)

    return withTenantTransaction(
      this.db,
      (tx) =>
        tx.$queryRawUnsafe<RetrievedChunk[]>(
          `SELECT c.id,
                  c.document_id       AS "documentId",
                  d.title             AS "documentTitle",
                  c.content,
                  1 - (c.embedding <=> $1::vector) AS score
             FROM knowledge_chunk c
             JOIN knowledge_document d ON d.id = c.document_id
            WHERE c.knowledge_base_id = $2
              AND c.embedding IS NOT NULL
            ORDER BY c.embedding <=> $1::vector
            LIMIT $3`,
          literal,
          knowledgeBaseId,
          k,
        ),
      { organizationId },
    )
  }

  /**
   * Retrieval for RAG: the most relevant chunks across ALL of an organisation's
   * knowledge bases, for injecting into a chat/LLM prompt. Best-effort — any
   * failure (no key, no vectors) returns an empty list so chat still works.
   */
  async retrieveForOrg(organizationId: string, query: string, k = 6): Promise<RetrievedChunk[]> {
    const key = loadEnv().OPENAI_API_KEY
    if (!key || !query.trim()) return []
    try {
      const { embeddings } = await embedTexts(key, [query], EMBEDDING_MODEL)
      const vector = embeddings[0]
      if (!vector) return []
      const literal = toVectorLiteral(vector)
      return await withTenantTransaction(
        this.db,
        (tx) =>
          tx.$queryRawUnsafe<RetrievedChunk[]>(
            `SELECT c.id,
                    c.document_id AS "documentId",
                    d.title       AS "documentTitle",
                    c.content,
                    1 - (c.embedding <=> $1::vector) AS score
               FROM knowledge_chunk c
               JOIN knowledge_document d ON d.id = c.document_id
              WHERE c.embedding IS NOT NULL
                AND d.deleted_at IS NULL
              ORDER BY c.embedding <=> $1::vector
              LIMIT $2`,
            literal,
            k,
          ),
        { organizationId },
      )
    } catch (err) {
      this.logger.warn(
        { err, organizationId },
        'knowledge retrieval failed; continuing without context',
      )
      return []
    }
  }

  async disconnect(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}
