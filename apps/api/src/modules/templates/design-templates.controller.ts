import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'

import {
  ASPECT_RATIOS,
  BUILT_IN_TEMPLATES,
  findTemplate,
  renderCreative,
  type AspectRatio,
  type CreativeData,
} from '@marketing-os/creative-engine'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'

/**
 * The design-template gallery.
 *
 * Read-only, and platform-wide rather than tenant-scoped: these templates ship
 * as code, so they are identical in every environment and cannot drift.
 * Organisation-authored templates will be a different, database-backed resource
 * alongside this one — a different lifecycle, not a reason to move these.
 *
 * `/preview` renders a template against a fixed sample so the gallery shows what
 * each one actually produces. Real data would make the tiles incomparable: the
 * point of the gallery is to judge layouts, not products.
 */

const previewQuerySchema = z.object({
  ratio: z.enum(ASPECT_RATIOS).default('1:1'),
})

/**
 * The sample every gallery tile renders with.
 *
 * Deliberately complete — long product name, both prices, coupon, disclaimer —
 * because a template that only looks good on sparse data is a template that
 * breaks on the first real catalogue. No image: the tile should show the
 * layout, and a stand-in product photo would just be a stand-in.
 */
const SAMPLE: CreativeData = {
  product: {
    name: 'Niacinamide 10% + Zinc 1% Serum',
    brand: 'Sample Brand',
    mrpMinor: 220_000,
    salePriceMinor: 187_000,
    currency: 'INR',
  },
  campaign: {
    name: 'Festive Sale',
    primaryOffer: 'Up to 40% off',
    secondaryOffer: 'Additional ₹2000 off',
    couponCode: 'SAMPLE',
    cta: 'Shop now',
  },
  brand: { displayName: 'Your Brand', disclaimer: 'Offer valid while stocks last. T&C apply.' },
}

@ApiTags('Design Templates')
@Controller('design-templates')
export class DesignTemplatesController {
  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'The template gallery' })
  list(): { data: unknown[] } {
    return {
      data: BUILT_IN_TEMPLATES.map((t) => ({
        slug: t.slug,
        name: t.document.name,
        description: t.description,
        ratios: t.document.ratios,
        background: t.document.background,
        // The palette lets the gallery tint a placeholder before the preview
        // image has loaded, so the grid does not flash white.
        palette: t.document.palette,
      })),
    }
  }

  @Get(':slug/preview')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Render this template against sample data (PNG)' })
  async preview(
    @Param('slug') slug: string,
    @Query() q: Record<string, string>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const parsed = previewQuerySchema.safeParse(q)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)

    const template = findTemplate(slug)
    if (!template) throw new BadRequestException(`Unknown template "${slug}"`)

    const result = await renderCreative(template.document, SAMPLE, parsed.data.ratio as AspectRatio)

    void reply
      .header('content-type', 'image/png')
      .header('etag', `"${result.hash}"`)
      // Sample data and a code-shipped template: this image only changes when
      // the deploy does, so it can be cached hard.
      .header('cache-control', 'public, max-age=86400, immutable')
      .send(result.png)
  }
}
