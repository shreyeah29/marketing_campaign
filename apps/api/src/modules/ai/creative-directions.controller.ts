import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'

import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CREATIVE_DIRECTIONS } from './creative-directions.js'
import { hasDirectionSample, readDirectionSample } from './direction-samples.js'

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
  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Every way this system can make a picture' })
  async list(): Promise<{ data: unknown[] }> {
    // Which directions have a committed sample. Cached after the first read, so
    // this is a map lookup rather than a stat per card per render.
    const withSample = new Set(
      (
        await Promise.all(
          CREATIVE_DIRECTIONS.map(async (d) => ((await hasDirectionSample(d.id)) ? d.id : null)),
        )
      ).filter((id): id is string => id !== null),
    )
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
         * Whether a committed sample exists for this direction.
         *
         * A boolean rather than a URL: the picture is served from a route the
         * client already knows how to build, and shipping the same address in
         * every row would be weight for nothing. False means the card shows a
         * placeholder — deliberately, because stock artwork on a card is a
         * promise about output nobody has seen.
         */
        hasSample: withSample.has(d.id),
      })),
    }
  }

  /**
   * The sample picture for one direction.
   *
   * A committed file, so it can be cached hard: it only changes when the deploy
   * does. Served from here rather than the web app's public folder because the
   * generator needs the same bytes off disk, and one copy cannot drift from
   * itself.
   */
  @Get(':id/sample')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'The example picture for a creative direction' })
  async sample(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const sample = await readDirectionSample(id)
    if (!sample) throw new NotFoundException('No sample for that direction')
    void reply
      .header('content-type', sample.contentType)
      .header('cache-control', 'public, max-age=86400, immutable')
      .send(sample.bytes)
  }
}
