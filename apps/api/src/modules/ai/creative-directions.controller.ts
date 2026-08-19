import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DirectionPreviewsService } from '../platform/direction-previews.service.js'
import { CREATIVE_DIRECTIONS } from './creative-directions.js'

/**
 * The creative-direction shelf.
 *
 * Read-only and platform-wide, exactly like the design-template gallery next to
 * it: directions ship as code, so they are identical in every environment and
 * cannot drift.
 *
 * Served rather than duplicated in the web app because the look text has to
 * reach the prompt builder, which lives here. Two copies of this list would
 * drift silently — the UI would offer a direction the API had never heard of,
 * and generation would simply proceed without it, producing an ordinary picture
 * and no error.
 *
 * `look` is deliberately **not** in the response. It is prompt direction, the
 * client has no use for it, and shipping paragraphs of prompt text to every
 * gallery render is weight for nothing. What the client needs is what to draw on
 * a card and where the card should send them.
 */
@ApiTags('Creative Directions')
@Controller('creative-directions')
export class CreativeDirectionsController {
  constructor(
    @Inject(DirectionPreviewsService) private readonly previews: DirectionPreviewsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Every way this system can make a picture' })
  async list(): Promise<{ data: unknown[] }> {
    // Platform-wide and identical for every workspace, so one read serves the
    // whole shelf. Absent previews are the state this shipped in — the cards
    // fall back to a placeholder rather than showing artwork nobody generated.
    const previews = await this.previews.all()
    return {
      data: CREATIVE_DIRECTIONS.map((d) => ({
        id: d.id,
        name: d.name,
        blurb: d.blurb,
        group: d.group,
        kind: d.kind,
        needs: d.needs,
        industries: d.industries,
        settings: d.settings,
        /**
         * Where a real preview comes from, or null.
         *
         * A template direction has one today, free and exact: the design-template
         * endpoint renders the actual layout against sample data. An AI direction
         * has none until a genuine example has been generated and stored, and
         * null is the honest answer in the meantime — a stock photograph on that
         * card would be a promise about output nobody has seen.
         */
        previewTemplateSlug: d.templateSlug ?? null,
        /**
         * A generated example, for the directions no layout can render.
         *
         * Null until an operator has generated the set. Deliberately null rather
         * than a stand-in: artwork on a card nobody produced is a promise about
         * output that has never been seen.
         */
        previewUrl: previews[d.id] ?? null,
      })),
    }
  }
}
