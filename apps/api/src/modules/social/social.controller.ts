import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { z } from 'zod'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Social — connections and scheduling.
 *
 * This controller only ever writes rows. A separate worker process polls for
 * `SCHEDULED` posts whose `scheduledAt <= now` and performs the actual publishing;
 * nothing here calls a social platform. That split keeps the request path fast and
 * the publishing path retryable.
 *
 * Follows the contacts vertical slice: no `organizationId` from the request (the
 * tenant comes from the session and the Prisma extension applies it), every access
 * inside `withTenantTransaction`, permissions declared per handler.
 */

// The set of platforms we model. Kept in sync with the Prisma `ChannelType` enum;
// only the ones that make sense as a social destination are offered for connect.
const SOCIAL_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE'] as const

const connectAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(200).optional(),
})

const listPostsSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DELETED']).optional(),
})

const createPostSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  hashtags: z.array(z.string().trim().min(1)).optional(),
  accountIds: z.array(z.string().min(1)).min(1),
  scheduledAt: z.string().datetime().optional(),
})

@ApiTags('Marketing')
@RequiresFeature('marketing.social')
@Controller('social')
export class SocialController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  // ── Connections ───────────────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List connected social accounts' })
  async listAccounts(): Promise<SocialAccountResponse[]> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.socialAccount.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    )
    return rows.map(toAccountResponse)
  }

  @Post('accounts/connect')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Manually connect a social account' })
  async connectAccount(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<SocialAccountResponse> {
    const parsed = connectAccountSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    // Manual connect path. Real OAuth to Instagram/Facebook/LinkedIn/X requires
    // the operator's own approved developer apps and platform review, which are
    // not available yet — so an operator connects an account by hand and the
    // whole scheduling → publishing pipeline is testable now. `externalId` is a
    // stable, deterministic value derived from the handle so reconnecting the
    // same handle upserts rather than duplicating.
    const externalId = `manual:${input.platform}:${input.handle.toLowerCase()}`

    return withTenantTransaction(this.db, async (tx) => {
      // Upsert by hand rather than tx.socialAccount.upsert: the compound unique
      // (organizationId, platform, externalId) includes the tenant column the
      // extension injects, which a unique-where lookup cannot carry.
      const existing = await tx.socialAccount.findFirst({
        where: { platform: input.platform, externalId },
      })

      const account = existing
        ? await tx.socialAccount.update({
            where: { id: existing.id },
            data: {
              status: 'CONNECTED',
              handle: input.handle,
              displayName: input.displayName ?? null,
              deletedAt: null,
            },
          })
        : await tx.socialAccount.create({
            data: {
              organizationId: principal.organizationId,
              platform: input.platform,
              status: 'CONNECTED',
              externalId,
              handle: input.handle,
              displayName: input.displayName ?? null,
              followerCount: null,
            },
          })

      return toAccountResponse(account)
    })
  }

  @Delete('accounts/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Disconnect a social account' })
  async disconnectAccount(@Param('id') id: string): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.socialAccount.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException(`No social account with id ${id}`)

      await tx.socialAccount.update({
        where: { id },
        data: { status: 'DISCONNECTED', deletedAt: new Date() },
      })
      return { ok: true } as const
    })
  }

  // ── Posts ─────────────────────────────────────────────────────────────────

  @Get('posts')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List social posts, newest first' })
  async listPosts(@Query() rawQuery: unknown): Promise<SocialPostResponse[]> {
    const query = listPostsSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.socialPost.findMany({
        where: {
          deletedAt: null,
          ...(query.data.status === undefined ? {} : { status: query.data.status }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          targets: { include: { socialAccount: true } },
        },
      }),
    )
    return rows.map(toPostResponse)
  }

  @Post('posts')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Create and schedule a social post' })
  async createPost(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<SocialPostResponse> {
    const parsed = createPostSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    // "Now" if no time is given. Always SCHEDULED so the worker picks it up on
    // its next tick — a post whose scheduledAt is already in the past is simply
    // due immediately.
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date()

    return withTenantTransaction(this.db, async (tx) => {
      // The accountIds must belong to this org. The tenant extension scopes the
      // query, so a foreign id simply will not be found and the count mismatches.
      const accounts = await tx.socialAccount.findMany({
        where: { id: { in: input.accountIds }, deletedAt: null },
        select: { id: true },
      })
      if (accounts.length !== input.accountIds.length) {
        throw new BadRequestException('One or more accountIds are unknown or disconnected')
      }

      const post = await tx.socialPost.create({
        data: {
          organizationId: principal.organizationId,
          status: 'SCHEDULED',
          body: input.body,
          hashtags: input.hashtags ?? [],
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

      const full = await tx.socialPost.findFirst({
        where: { id: post.id },
        include: { targets: { include: { socialAccount: true } } },
      })
      if (!full) throw new NotFoundException(`No social post with id ${post.id}`)
      return toPostResponse(full)
    })
  }

  @Post('posts/:id/publish-now')
  @RequirePermissions(PERMISSIONS.SOCIAL_PUBLISH)
  @ApiOperation({ summary: 'Bring a scheduled post due immediately' })
  async publishNow(@Param('id') id: string): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.socialPost.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException(`No social post with id ${id}`)

      const now = new Date()
      // Set it due now and (re)mark SCHEDULED so the worker publishes it on its
      // next poll. Targets are reset to SCHEDULED too so a previously failed
      // target is retried.
      await tx.socialPost.update({
        where: { id },
        data: { status: 'SCHEDULED', scheduledAt: now },
      })
      await tx.socialPostTarget.updateMany({
        where: { postId: id },
        data: { status: 'SCHEDULED' },
      })
      return { ok: true } as const
    })
  }

  @Delete('posts/:id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Delete a social post' })
  async removePost(@Param('id') id: string): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.socialPost.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException(`No social post with id ${id}`)

      await tx.socialPost.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: new Date() },
      })
      return { ok: true } as const
    })
  }
}

// ── Wire shapes ───────────────────────────────────────────────────────────────

interface SocialAccountResponse {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
  followerCount: number | null
  avatarUrl: string | null
}

interface SocialPostTargetResponse {
  id: string
  socialAccountId: string
  handle: string | null
  platform: string
  status: string
  permalink: string | null
  failureReason: string | null
  publishedAt: string | null
}

interface SocialPostResponse {
  id: string
  status: string
  body: string
  hashtags: string[]
  scheduledAt: string | null
  publishedAt: string | null
  createdAt: string
  targets: SocialPostTargetResponse[]
}

interface AccountRow {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
  followerCount: number | null
  avatarUrl: string | null
}

function toAccountResponse(row: AccountRow): SocialAccountResponse {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.displayName,
    status: row.status,
    followerCount: row.followerCount,
    avatarUrl: row.avatarUrl,
  }
}

interface TargetRow {
  id: string
  socialAccountId: string
  status: string
  permalink: string | null
  failureReason: string | null
  publishedAt: Date | null
  socialAccount: { handle: string | null; platform: string }
}

interface PostRow {
  id: string
  status: string
  body: string
  hashtags: string[]
  scheduledAt: Date | null
  publishedAt: Date | null
  createdAt: Date
  targets: TargetRow[]
}

function toPostResponse(row: PostRow): SocialPostResponse {
  return {
    id: row.id,
    status: row.status,
    body: row.body,
    hashtags: row.hashtags,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    targets: row.targets.map((t) => ({
      id: t.id,
      socialAccountId: t.socialAccountId,
      handle: t.socialAccount.handle,
      platform: t.socialAccount.platform,
      status: t.status,
      permalink: t.permalink,
      failureReason: t.failureReason,
      publishedAt: t.publishedAt?.toISOString() ?? null,
    })),
  }
}
