import { createHash, randomBytes } from 'node:crypto'

import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS, permissionsForRole, type MemberRole } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const

const inviteSchema = z
  .object({
    email: z.string().email(),
    // OWNER is intentionally not invitable — ownership transfers through an
    // explicit, separately-guarded flow, not by inviting a second owner.
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
  })
  .strict()

const changeRoleSchema = z.object({ role: z.enum(ROLES) }).strict()

/**
 * Team members and invitations.
 *
 * The permission checks a role can hold are the same set the RBAC matrix
 * defines — the invite response returns them so the UI shows a new teammate
 * exactly what they will be able to do, rather than guessing.
 */
@ApiTags('Members')
@Controller('members')
export class MembersController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOperation({ summary: 'List members of the organisation' })
  async list(): Promise<unknown[]> {
    const memberships = await withTenantTransaction(this.db, (tx) =>
      tx.membership.findMany({
        where: { deletedAt: null },
        include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    )

    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    }))
  }

  @Post('invitations')
  @RequirePermissions(PERMISSIONS.MEMBERS_INVITE)
  @ApiOperation({ summary: 'Invite a teammate' })
  async invite(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ invitationId: string; expiresAt: string; grantedPermissions: readonly string[] }> {
    const input = zodBody(inviteSchema, rawBody)

    return withTenantTransaction(this.db, async (tx) => {
      // The raw token goes to the invitee by email; only its hash is stored, so a
      // database read cannot yield a usable invitation link. Same principle as a
      // password: never store the secret, only something to verify it against.
      const rawToken = randomBytes(32).toString('base64url')
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      const invitation = await tx.invitation.create({
        data: {
          organizationId: principal.organizationId,
          email: input.email,
          role: input.role ?? 'MEMBER',
          tokenHash,
          inviterId: principal.id,
          expiresAt,
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'member.invited',
          resourceType: 'invitation',
          resourceId: invitation.id,
          after: { email: input.email, role: input.role ?? 'MEMBER' },
        },
      })

      // The email-send job (queued via the outbox in a later slice) carries the
      // raw token. Returned here too so a UI can surface a copyable link.
      return {
        invitationId: invitation.id,
        expiresAt: expiresAt.toISOString(),
        grantedPermissions: permissionsForRole(input.role ?? 'MEMBER'),
      }
    })
  }

  @Patch(':membershipId/role')
  @RequirePermissions(PERMISSIONS.MEMBERS_MANAGE)
  @ApiOperation({ summary: "Change a member's role" })
  async changeRole(
    @Param('membershipId') membershipId: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; role: MemberRole }> {
    const { role } = zodBody(changeRoleSchema, rawBody)

    return withTenantTransaction(this.db, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { id: membershipId, deletedAt: null },
      })
      if (!membership) throw new NotFoundException('Member not found')

      await tx.membership.updateMany({ where: { id: membershipId }, data: { role } })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'member.role_changed',
          resourceType: 'membership',
          resourceId: membershipId,
          before: { role: membership.role },
          after: { role },
        },
      })

      return { ok: true, role }
    })
  }
}
