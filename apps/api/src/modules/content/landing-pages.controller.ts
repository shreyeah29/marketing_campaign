import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { Prisma, withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Landing pages — the authenticated builder + management surface.
 *
 * Every handler is tenant-scoped through `withTenantTransaction`; `organizationId`
 * is never read from the wire. The public, unauthenticated hosting path lives in
 * `PublicPagesController` and resolves a page by slug across tenants with the
 * RLS-exempt system client.
 */

// A content block is an ordered `{ type, ...props }` object. The builder owns the
// exact prop shapes; the API validates only that each entry is a typed object and
// stores the array verbatim as Json.
const blockSchema = z.object({ type: z.string().min(1) }).passthrough()
const blocksSchema = z.array(blockSchema)

const createPageSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  blocks: blocksSchema.optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  formId: z.string().optional(),
})

const updatePageSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  blocks: blocksSchema.optional(),
  theme: z.record(z.string(), z.unknown()).nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  ogImageUrl: z.string().nullable().optional(),
  formId: z.string().nullable().optional(),
})

/** Lowercase, hyphenate, strip anything that is not a URL-safe word character. */
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.length > 0 ? base : 'page'
}

// Explicit return shapes so the inferred Prisma payload types are named through the
// re-exported `Prisma` namespace rather than a non-portable generated-client path.
type LandingPageRecord = Prisma.LandingPageGetPayload<Record<string, never>>
type LandingPageListItem = Prisma.LandingPageGetPayload<{
  select: { id: true; name: true; slug: true; status: true; visitCount: true; updatedAt: true }
}>

@ApiTags('Marketing')
@RequiresFeature('marketing.landing_pages')
@Controller('landing-pages')
export class LandingPagesController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List landing pages, newest first' })
  async list(): Promise<LandingPageListItem[]> {
    return withTenantTransaction(this.db, (tx) =>
      tx.landingPage.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          visitCount: true,
          updatedAt: true,
        },
      }),
    )
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Create a landing page' })
  async create(@Body() rawBody: unknown, @CurrentPrincipal() principal: Principal): Promise<LandingPageRecord> {
    const parsed = createPageSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const base = slugify(input.name)
      // Unique per (organizationId, slug). On collision append a short suffix so a
      // second "Summer sale" page still gets a distinct public URL.
      const clash = await tx.landingPage.findFirst({ where: { slug: base }, select: { id: true } })
      const slug = clash ? `${base}-${Math.random().toString(36).slice(2, 7)}` : base

      return tx.landingPage.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name,
          slug,
          status: 'DRAFT',
          title: input.title ?? null,
          blocks: (input.blocks ?? []) as never,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          formId: input.formId ?? null,
        },
      })
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Retrieve one landing page' })
  async findOne(@Param('id') id: string): Promise<LandingPageRecord> {
    const page = await withTenantTransaction(this.db, (tx) =>
      tx.landingPage.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!page) throw new NotFoundException(`No landing page with id ${id}`)
    return page
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Update a landing page' })
  async update(@Param('id') id: string, @Body() rawBody: unknown): Promise<LandingPageRecord> {
    const parsed = updatePageSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.landingPage.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No landing page with id ${id}`)

      return tx.landingPage.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.blocks === undefined ? {} : { blocks: input.blocks as never }),
          ...(input.theme === undefined ? {} : { theme: input.theme as never }),
          ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle }),
          ...(input.seoDescription === undefined ? {} : { seoDescription: input.seoDescription }),
          ...(input.ogImageUrl === undefined ? {} : { ogImageUrl: input.ogImageUrl }),
          ...(input.formId === undefined ? {} : { formId: input.formId }),
        },
      })
    })
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  @ApiOperation({ summary: 'Publish a landing page' })
  async publish(@Param('id') id: string): Promise<LandingPageRecord> {
    return withTenantTransaction(this.db, async (tx) => {
      const page = await tx.landingPage.findFirst({ where: { id, deletedAt: null } })
      if (!page) throw new NotFoundException(`No landing page with id ${id}`)
      return tx.landingPage.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      })
    })
  }

  @Post(':id/unpublish')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  @ApiOperation({ summary: 'Unpublish a landing page' })
  async unpublish(@Param('id') id: string): Promise<LandingPageRecord> {
    return withTenantTransaction(this.db, async (tx) => {
      const page = await tx.landingPage.findFirst({ where: { id, deletedAt: null } })
      if (!page) throw new NotFoundException(`No landing page with id ${id}`)
      return tx.landingPage.update({ where: { id }, data: { status: 'DRAFT' } })
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Soft-delete a landing page' })
  async remove(@Param('id') id: string): Promise<{ ok: boolean }> {
    return withTenantTransaction(this.db, async (tx) => {
      const page = await tx.landingPage.findFirst({ where: { id, deletedAt: null } })
      if (!page) throw new NotFoundException(`No landing page with id ${id}`)
      await tx.landingPage.update({ where: { id }, data: { deletedAt: new Date() } })
      return { ok: true }
    })
  }
}
