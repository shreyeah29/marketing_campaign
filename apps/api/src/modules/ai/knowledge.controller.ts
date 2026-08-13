import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { createHash } from 'node:crypto'

import { cursorPaginationSchema, type Paginated } from '@marketing-os/contracts'
import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

import { KnowledgeService } from './knowledge.service.js'

const MODEL = 'knowledgeBase'
const ACTION = 'knowledge_base'
const SEARCH_FIELDS = ['name', 'description'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  embeddingModel: z.string().max(120).optional(),
})

const updateSchema = createSchema.partial()

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

// Documents are uploaded as extracted text (the client reads text-based files and
// sends their content) — no multipart, no blob store: the text itself is what RAG
// needs, and it is stored on the document row and chunked/embedded by the worker.
const createDocSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(500_000),
  mimeType: z.string().max(160).optional(),
  sourceType: z.enum(['UPLOAD', 'TEXT', 'URL']).optional(),
})
const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(20).optional(),
})

interface KnowledgeBaseRow {
  id: string
  createdAt?: Date
}

/** Knowledge bases — the RAG corpora an organisation indexes for its agents. */
@ApiTags('AI')
@RequiresFeature('ai.knowledge_base')
@Controller('knowledge-bases')
export class KnowledgeController {
  private readonly crud: CrudService

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService,
  ) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_READ)
  @ApiOperation({ summary: 'List knowledge bases' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<KnowledgeBaseRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<KnowledgeBaseRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_READ)
  @ApiOperation({ summary: 'Retrieve one knowledge base' })
  async get(@Param('id') id: string): Promise<KnowledgeBaseRow> {
    return this.crud.get<KnowledgeBaseRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Create a knowledge base' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<KnowledgeBaseRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.create<KnowledgeBaseRow>(MODEL, principal, parsed.data, ACTION)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Update a knowledge base' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<KnowledgeBaseRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.update<KnowledgeBaseRow>(MODEL, principal, id, parsed.data, ACTION)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Soft-delete a knowledge base' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete knowledge bases' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }

  // ── Documents ────────────────────────────────────────────────────────────────

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_READ)
  @ApiOperation({ summary: 'List documents in a knowledge base' })
  async listDocuments(@Param('id') id: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const kb = await tx.knowledgeBase.findFirst({ where: { id, deletedAt: null } })
      if (!kb) throw new BadRequestException('Knowledge base not found')
      const docs = await tx.knowledgeDocument.findMany({
        where: { knowledgeBaseId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          mimeType: true,
          sourceType: true,
          chunkCount: true,
          failureReason: true,
          indexedAt: true,
          createdAt: true,
          metadata: true,
        },
      })
      return { data: docs, indexingAvailable: this.knowledge.hasEmbeddingKey() }
    })
  }

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Add a document (extracted text) and index it' })
  async addDocument(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    const parsed = createDocSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const { title, content, mimeType, sourceType } = parsed.data
    const contentHash = createHash('sha256').update(content).digest('hex')
    const sizeBytes = Buffer.byteLength(content, 'utf8')

    const doc = await withTenantTransaction(this.db, async (tx) => {
      const kb = await tx.knowledgeBase.findFirst({ where: { id, deletedAt: null } })
      if (!kb) throw new BadRequestException('Knowledge base not found')

      const dupe = await tx.knowledgeDocument.findFirst({
        where: { knowledgeBaseId: id, contentHash, deletedAt: null },
        select: { id: true },
      })
      if (dupe)
        throw new BadRequestException('This document has already been added to the knowledge base')

      const created = await tx.knowledgeDocument.create({
        data: {
          organizationId: principal.organizationId,
          knowledgeBaseId: id,
          title,
          sourceType: (sourceType ?? 'UPLOAD') as never,
          mimeType: mimeType ?? 'text/plain',
          content,
          contentHash,
          status: 'QUEUED',
          metadata: { sizeBytes } as never,
        },
        select: { id: true, title: true, status: true, chunkCount: true, createdAt: true },
      })
      await tx.knowledgeBase.update({ where: { id }, data: { documentCount: { increment: 1 } } })
      return created
    })

    // Kick off out-of-process chunking + embedding.
    await this.knowledge.enqueueIndex(principal.organizationId, id, doc.id)
    return doc
  }

  @Post(':id/documents/:docId/reprocess')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Re-chunk and re-embed a document' })
  async reprocessDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    await withTenantTransaction(this.db, async (tx) => {
      const doc = await tx.knowledgeDocument.findFirst({
        where: { id: docId, knowledgeBaseId: id, deletedAt: null },
      })
      if (!doc) throw new BadRequestException('Document not found')
      const removed = await tx.knowledgeChunk.deleteMany({ where: { documentId: docId } })
      await tx.knowledgeDocument.update({
        where: { id: docId },
        data: { status: 'QUEUED', chunkCount: 0, failureReason: null, indexedAt: null },
      })
      if (removed.count > 0) {
        await tx.knowledgeBase.update({
          where: { id },
          data: { chunkCount: { decrement: removed.count } },
        })
      }
    })
    await this.knowledge.enqueueIndex(principal.organizationId, id, docId)
    return { ok: true }
  }

  @Delete(':id/documents/:docId')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_WRITE)
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
  ): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const doc = await tx.knowledgeDocument.findFirst({
        where: { id: docId, knowledgeBaseId: id, deletedAt: null },
      })
      if (!doc) throw new BadRequestException('Document not found')
      const removed = await tx.knowledgeChunk.deleteMany({ where: { documentId: docId } })
      await tx.knowledgeDocument.update({ where: { id: docId }, data: { deletedAt: new Date() } })
      await tx.knowledgeBase.update({
        where: { id },
        data: {
          documentCount: { decrement: 1 },
          ...(removed.count > 0 ? { chunkCount: { decrement: removed.count } } : {}),
        },
      })
    })
    return { ok: true }
  }

  @Post(':id/search')
  @RequirePermissions(PERMISSIONS.KNOWLEDGE_READ)
  @ApiOperation({ summary: 'Semantic search within a knowledge base' })
  async search(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    const parsed = searchSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const results = await this.knowledge.search(
      principal.organizationId,
      id,
      parsed.data.query,
      parsed.data.k ?? 8,
    )
    return { results }
  }
}
