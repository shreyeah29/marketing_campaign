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

import { cursorPaginationSchema, type Paginated } from '@vsp/contracts'
import { type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

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

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
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
}
