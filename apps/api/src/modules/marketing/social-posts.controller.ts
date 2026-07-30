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

const MODEL = 'socialPost'
const ACTION = 'social_post'
const SEARCH_FIELDS = ['body'] as const

const listSchema = cursorPaginationSchema.extend({ search: z.string().optional() })

const createSchema = z.object({
  // `body` is the real column; the UI labels it "Content".
  body: z.string().min(1),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.coerce.date().optional(),
})

const updateSchema = createSchema.partial()

const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(500) })

interface SocialPostRow {
  id: string
  createdAt?: Date
}

/** Social posts across connected accounts. */
@ApiTags('Marketing')
@RequiresFeature('marketing.social')
@Controller('social-posts')
export class SocialPostsController {
  private readonly crud: CrudService

  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List social posts' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<SocialPostRow>> {
    const query = listSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)
    return this.crud.list<SocialPostRow>(MODEL, {
      search: query.data.search,
      searchFields: SEARCH_FIELDS,
      cursor: query.data.cursor,
      limit: query.data.limit,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Retrieve one social post' })
  async get(@Param('id') id: string): Promise<SocialPostRow> {
    return this.crud.get<SocialPostRow>(MODEL, id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Create a social post' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<SocialPostRow> {
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.create<SocialPostRow>(MODEL, principal, parsed.data, ACTION)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Update a social post' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<SocialPostRow> {
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.update<SocialPostRow>(MODEL, principal, id, parsed.data, ACTION)
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Soft-delete a social post' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return this.crud.remove(MODEL, principal, id, ACTION)
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Bulk soft-delete social posts' })
  async bulkRemove(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; count: number }> {
    const parsed = idsSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    return this.crud.bulkRemove(MODEL, principal, parsed.data.ids, ACTION)
  }
}
