import { createHash, randomBytes } from 'node:crypto'

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import {
  withTenantTransaction,
  type DatabaseClient,
  type TenantTransactionClient,
} from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  permissionsForRole,
  type MemberRole,
} from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { EMAIL_PORT, type EmailPort } from '../auth/email.port.js'

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const inviteSchema = z
  .object({
    email: z.string().email(),
    // OWNER is intentionally not invitable — ownership transfers through an
    // explicit, separately-guarded flow, not by inviting a second owner.
    role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
  })
  .strict()

const changeRoleSchema = z.object({ role: z.enum(ROLES) }).strict()

const setPermissionsSchema = z
  .object({
    // Additive grants on top of the role. Validated against the catalog so a typo
    // is a 400, not a silently-ignored permission that looks granted.
    permissions: z.array(z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]])),
  })
  .strict()

/**
 * Team members, roles and invitations.
 *
 * Roles are the templates a customer administers (`GET /members/roles` returns
 * them with their permissions); per-member grants layer extra capabilities on top
 * without inventing a new role. Invitations are the join path: an invite carries a
 * single-use token by email, and the invitee accepts it through the identity realm
 * (`POST /v1/auth/invitations/accept`), which is where a brand-new user with no org
 * yet can act.
 */
@ApiTags('Members')
@Controller('members')
export class MembersController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
  ) {}

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
      permissions: m.permissions,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    }))
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOperation({ summary: 'The role templates and the permissions each grants' })
  roles(): unknown {
    return ROLES.map((role) => ({
      role,
      permissions: permissionsForRole(role),
      // OWNER is assigned only through provisioning or ownership transfer.
      assignable: role !== 'OWNER',
    }))
  }

  // ── Invitations ────────────────────────────────────────────────────────────

  @Get('invitations')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiOperation({ summary: 'Pending invitations' })
  async invitations(): Promise<unknown[]> {
    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.invitation.findMany({
        where: { status: 'PENDING' },
        include: { inviter: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    )

    const now = Date.now()
    return rows.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedBy: i.inviter.name,
      expiresAt: i.expiresAt.toISOString(),
      expired: i.expiresAt.getTime() < now,
      createdAt: i.createdAt.toISOString(),
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
    const role = input.role ?? 'MEMBER'

    const { invitation, rawToken } = await withTenantTransaction(this.db, async (tx) => {
      // The raw token goes to the invitee by email; only its hash is stored, so a
      // database read cannot yield a usable invitation link. Same principle as a
      // password: never store the secret, only something to verify it against.
      const token = randomBytes(32).toString('base64url')
      const tokenHash = createHash('sha256').update(token).digest('hex')
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

      // Re-inviting the same address refreshes the pending invite rather than
      // colliding on the (org, email, status) uniqueness.
      const created = await tx.invitation.upsert({
        where: {
          organizationId_email_status: {
            organizationId: principal.organizationId,
            email: input.email,
            status: 'PENDING',
          },
        },
        create: {
          organizationId: principal.organizationId,
          email: input.email,
          role,
          tokenHash,
          inviterId: principal.id,
          expiresAt,
        },
        update: { role, tokenHash, expiresAt, inviterId: principal.id },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'member.invited',
          resourceType: 'invitation',
          resourceId: created.id,
          after: { email: input.email, role },
        },
      })

      return { invitation: created, rawToken: token }
    })

    await this.sendInviteEmail(input.email, rawToken)

    return {
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      grantedPermissions: permissionsForRole(role),
    }
  }

  @Post('invitations/:id/resend')
  @RequirePermissions(PERMISSIONS.MEMBERS_INVITE)
  @ApiOperation({ summary: 'Reissue a pending invitation with a fresh token and expiry' })
  async resendInvitation(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; expiresAt: string }> {
    const { email, expiresAt, rawToken } = await withTenantTransaction(this.db, async (tx) => {
      const invitation = await tx.invitation.findFirst({ where: { id, status: 'PENDING' } })
      if (!invitation) throw new NotFoundException('No pending invitation with that id')

      const token = randomBytes(32).toString('base64url')
      const tokenHash = createHash('sha256').update(token).digest('hex')
      const newExpiry = new Date(Date.now() + INVITE_TTL_MS)

      await tx.invitation.updateMany({
        where: { id },
        data: { tokenHash, expiresAt: newExpiry },
      })
      await this.audit(tx, principal, 'member.invitation_resent', 'invitation', id)

      return { email: invitation.email, expiresAt: newExpiry, rawToken: token }
    })

    await this.sendInviteEmail(email, rawToken)
    return { ok: true, expiresAt: expiresAt.toISOString() }
  }

  @Delete('invitations/:id')
  @RequirePermissions(PERMISSIONS.MEMBERS_INVITE)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revokeInvitation(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const invitation = await tx.invitation.findFirst({ where: { id, status: 'PENDING' } })
      if (!invitation) throw new NotFoundException('No pending invitation with that id')

      // Revoking frees the (org, email, status) slot by moving it out of PENDING.
      await tx.invitation.updateMany({ where: { id }, data: { status: 'REVOKED' } })
      await this.audit(tx, principal, 'member.invitation_revoked', 'invitation', id)
      return { ok: true }
    })
  }

  // ── Roles & permissions ──────────────────────────────────────────────────────

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

      // Never demote the last owner — an org without an owner is unadministrable.
      if (membership.role === 'OWNER' && role !== 'OWNER') {
        const otherOwners = await tx.membership.count({
          where: { role: 'OWNER', deletedAt: null, id: { not: membershipId } },
        })
        if (otherOwners === 0) {
          throw new ForbiddenException('Transfer ownership before removing the last owner')
        }
      }

      await tx.membership.updateMany({ where: { id: membershipId }, data: { role } })
      await this.audit(tx, principal, 'member.role_changed', 'membership', membershipId, {
        before: membership.role,
        after: role,
      })

      return { ok: true, role }
    })
  }

  @Patch(':membershipId/permissions')
  @RequirePermissions(PERMISSIONS.MEMBERS_MANAGE)
  @ApiOperation({ summary: "Set a member's additional permission grants (custom role)" })
  async setPermissions(
    @Param('membershipId') membershipId: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; permissions: string[] }> {
    const { permissions } = zodBody(setPermissionsSchema, rawBody)
    // De-duplicate; the effective set is the role's permissions unioned with these.
    const grants = [...new Set(permissions)]

    return withTenantTransaction(this.db, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { id: membershipId, deletedAt: null },
      })
      if (!membership) throw new NotFoundException('Member not found')

      await tx.membership.updateMany({ where: { id: membershipId }, data: { permissions: grants } })
      await this.audit(tx, principal, 'member.permissions_changed', 'membership', membershipId, {
        before: membership.permissions,
        after: grants,
      })

      return { ok: true, permissions: grants }
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async sendInviteEmail(to: string, rawToken: string): Promise<void> {
    const actionUrl = `${loadEnv().APP_URL}/accept-invitation?token=${rawToken}`
    await this.email.send({
      to,
      subject: "You've been invited to a workspace",
      heading: 'Join the workspace',
      body: 'You have been invited to collaborate. This invitation expires in 7 days.',
      actionUrl,
      actionLabel: 'Accept invitation',
    })
  }

  private async audit(
    tx: TenantTransactionClient,
    principal: Principal,
    action: string,
    resourceType: string,
    resourceId: string,
    change?: { before?: unknown; after?: unknown },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: principal.organizationId,
        actorType: 'USER',
        userId: principal.id,
        action,
        resourceType,
        resourceId,
        ...(change?.before === undefined ? {} : { before: change.before as never }),
        ...(change?.after === undefined ? {} : { after: change.after as never }),
      },
    })
  }
}
