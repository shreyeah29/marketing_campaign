import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import type { PrismaClient } from '@marketing-os/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { SYSTEM_DB } from '../../infrastructure/database.module.js'

/**
 * The public, unauthenticated landing-page hosting surface.
 *
 * A page is addressed by slug by an anonymous visitor, so it must be resolved
 * BEFORE any tenant context exists. That is the one thing the tenant-scoped client
 * cannot do, so this controller uses the RLS-exempt `SYSTEM_DB` client, scoped to
 * only published, non-deleted pages. The projection is public-safe: it never leaks
 * `organizationId` or any other internal column.
 */
interface PublicPageResponse {
  name: string
  title: string | null
  blocks: unknown
  theme: unknown
  seoTitle: string | null
  seoDescription: string | null
  ogImageUrl: string | null
}

@ApiTags('Marketing')
@Controller('public/pages')
export class PublicPagesController {
  constructor(@Inject(SYSTEM_DB) private readonly system: PrismaClient) {}

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Fetch a published landing page by slug' })
  async getPage(@Param('slug') slug: string): Promise<PublicPageResponse> {
    const page = await this.system.landingPage.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
    })
    if (!page) throw new NotFoundException()

    // Fire-and-forget visit count. A failed increment must never fail the render.
    void this.system.landingPage
      .update({ where: { id: page.id }, data: { visitCount: { increment: 1 } } })
      .catch(() => {})

    // Public-safe projection only — never leak organizationId.
    return {
      name: page.name,
      title: page.title,
      blocks: page.blocks,
      theme: page.theme,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      ogImageUrl: page.ogImageUrl,
    }
  }
}
