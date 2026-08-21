import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'
import type { CreativeData } from '@marketing-os/creative-engine'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Approval and publishing for rendered creatives.
 *
 * The lifecycle is the one the brief asks for — generated → reviewed → approved
 * → scheduled → published — and it deliberately reuses the machinery that
 * already publishes social posts. `SocialPost` plus `SocialPostTarget` is what
 * the worker's platform adapters consume; a second publishing path would be a
 * second set of retry semantics, a second double-post risk, and a second thing
 * to keep correct.
 *
 * Approving does not publish. They are separate calls because they are separate
 * decisions: "these words are right" and "send this to twelve thousand people"
 * should not share a button.
 */

const rejectSchema = z.object({ reason: z.string().max(1000).optional() }).strict()

const publishSchema = z
  .object({
    accountIds: z.array(z.string().min(1)).min(1),
    /** Omitted means now — the worker picks it up on its next tick. */
    scheduledAt: z.string().datetime().optional(),
  })
  .strict()

const bulkSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    ids: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict()

/** Statuses from which approval is a legal move. */
const APPROVABLE = new Set(['READY', 'DRAFT', 'REJECTED'])

@ApiTags('Creatives')
@Controller('creatives')
export class CreativeReviewController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  @ApiOperation({ summary: 'Approve a creative for publishing' })
  async approve(@Param('id') id: string, @CurrentPrincipal() p: Principal): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')
      if (!APPROVABLE.has(row.status)) {
        throw new BadRequestException(`A ${row.status.toLowerCase()} creative cannot be approved`)
      }
      // Approving something with no artwork would mean approving a description
      // of a poster rather than the poster.
      if (!row.renderedUrl) {
        throw new BadRequestException('This creative has not finished rendering yet')
      }

      return tx.creative.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: p.type === 'user' ? p.id : null,
          failureReason: null,
        },
      })
    })
  }

  /**
   * Remove a creative from the workspace.
   *
   * Distinct from reject, and the review queue needed both. Rejecting is a
   * decision that stays on the record — the reason feeds what gets generated
   * next, and a rejected creative can be reopened. Deleting is for the ones that
   * should not be there at all: a duplicate, a test, a run nobody wanted. Only
   * reject existed, so clearing those out meant a queue full of rejections that
   * each looked like a judgement about the work.
   *
   * Soft, like every other delete here: the row keeps its history and leaves
   * every list, because `deletedAt: null` is on every query that reads it.
   *
   * Published creatives are refused. The post is live on someone's feed and
   * deleting our record of it does not remove it — it removes the only thing
   * that knows it exists.
   */
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Remove a creative' })
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')
      if (row.status === 'PUBLISHED') {
        throw new BadRequestException(
          'This one is already published. Deleting it here would not remove the post — it would only remove the record of it.',
        )
      }
      await tx.creative.update({ where: { id }, data: { deletedAt: new Date() } })
    })
    return { ok: true }
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() _p: Principal,
  ): Promise<unknown> {
    const { reason } = zodBody(rejectSchema, body ?? {})
    return withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')
      if (row.status === 'PUBLISHED') {
        throw new BadRequestException('This creative has already been published')
      }
      return tx.creative.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedAt: null,
          approvedById: null,
          ...(reason ? { failureReason: reason } : {}),
        },
      })
    })
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  @ApiOperation({ summary: 'Approve or reject many creatives at once' })
  async bulk(
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<{ updated: number }> {
    const { action, ids } = zodBody(bulkSchema, body)

    return withTenantTransaction(this.db, async (tx) => {
      if (action === 'reject') {
        const result = await tx.creative.updateMany({
          where: { id: { in: ids }, deletedAt: null, status: { not: 'PUBLISHED' } },
          data: { status: 'REJECTED', approvedAt: null, approvedById: null },
        })
        return { updated: result.count }
      }

      // Approving in bulk still refuses anything unrendered. Fifty posters
      // approved at once is exactly when nobody checks each one individually,
      // so the guard matters more here, not less.
      const result = await tx.creative.updateMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          renderedUrl: { not: null },
          status: { in: ['READY', 'DRAFT', 'REJECTED'] },
        },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: p.type === 'user' ? p.id : null,
        },
      })
      return { updated: result.count }
    })
  }

  /**
   * Hand an approved creative to the publisher.
   *
   * Produces a `SocialPost` with targets, which is what the worker's platform
   * adapters already consume. The caption is composed from the same frozen
   * snapshot the poster was rendered from, so the words under the image are the
   * words that were approved with it.
   */
  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CONTENT_APPROVE)
  @ApiOperation({ summary: 'Schedule an approved creative for publishing' })
  async publish(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() p: Principal,
  ): Promise<unknown> {
    const input = zodBody(publishSchema, body)
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date()

    return withTenantTransaction(this.db, async (tx) => {
      const row = await tx.creative.findFirst({ where: { id, deletedAt: null } })
      if (!row) throw new NotFoundException('Creative not found')
      if (row.status !== 'APPROVED') {
        throw new BadRequestException('Only approved creatives can be published')
      }
      if (!row.renderedUrl) {
        throw new BadRequestException('This creative has no artwork to publish')
      }
      if (row.socialPostId) {
        // Publishing twice is not idempotent at the platform — it is two posts.
        throw new BadRequestException('This creative has already been scheduled')
      }

      const accounts = await tx.socialAccount.findMany({
        where: { id: { in: input.accountIds }, deletedAt: null },
        select: { id: true },
      })
      if (accounts.length !== input.accountIds.length) {
        throw new BadRequestException('One or more accounts are unknown or disconnected')
      }

      // The poster is registered in the media library so the publisher can
      // resolve it the same way it resolves every other attachment.
      const media = await tx.mediaAsset.create({
        data: {
          organizationId: p.organizationId,
          type: 'IMAGE',
          storageKey: row.renderHash
            ? `creatives/${row.id}/${row.renderHash}`
            : `creatives/${row.id}`,
          url: row.renderedUrl,
          generationParams: { kind: 'creative', creativeId: row.id },
        },
        select: { id: true },
      })

      const post = await tx.socialPost.create({
        data: {
          organizationId: p.organizationId,
          campaignId: row.campaignId,
          status: 'SCHEDULED',
          body: caption(row.content as CreativeData),
          mediaIds: [media.id],
          scheduledAt,
        },
      })
      await tx.socialPostTarget.createMany({
        data: accounts.map((a) => ({
          postId: post.id,
          socialAccountId: a.id,
          status: 'SCHEDULED' as const,
        })),
      })

      return tx.creative.update({
        where: { id },
        data: { status: 'SCHEDULED', socialPostId: post.id },
      })
    })
  }
}

/**
 * The caption that travels with the poster.
 *
 * Built from the creative's own snapshot rather than from the product row, so
 * the words published under an image are the words that were approved with it.
 */
function caption(content: CreativeData): string {
  const lines = [
    content.product?.name,
    content.campaign?.primaryOffer,
    content.campaign?.couponCode ? `Use code ${content.campaign.couponCode}` : null,
    content.campaign?.cta,
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line && line.length > 0))

  return lines.join('\n')
}
