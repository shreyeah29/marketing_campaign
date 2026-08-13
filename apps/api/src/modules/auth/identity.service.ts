import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import type { PrismaClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { effectivePermissions, type MemberRole } from '../../common/rbac/permissions.js'

import { AuthService } from './auth.service.js'

export interface OrganizationMembershipSummary {
  organizationId: string
  name: string
  slug: string
  status: string
  role: MemberRole
  isActive: boolean
}

/**
 * Resolves *who a user is within an organisation* — the bridge between Better
 * Auth's global identity and the tenant realm's role/permission model.
 *
 * A session tells us the user; it does not tell us which organisation they are
 * acting in or what they may do there. That lives in `Membership`, which is
 * tenant-scoped and RLS-protected — so resolving it before a tenant context
 * exists (which is exactly when the request pipeline needs it) requires the owner
 * connection. This is the one service permitted to read memberships across the
 * tenant boundary, for the same reason the platform plane is: identity spans
 * tenants.
 */
@Injectable()
export class IdentityService {
  private readonly owner: PrismaClient

  constructor(@Inject(AuthService) auth: AuthService) {
    // Reuse Better Auth's owner client — one owner connection for the whole
    // identity layer rather than a second pool.
    this.owner = auth.owner
  }

  /** Every organisation the user belongs to, for the switcher and the session view. */
  async listOrganizations(userId: string): Promise<OrganizationMembershipSummary[]> {
    const memberships = await this.owner.membership.findMany({
      where: { userId, deletedAt: null, organization: { deletedAt: null } },
      include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return memberships.map((m) => ({
      organizationId: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      status: m.organization.status,
      role: m.role as MemberRole,
      // An org the platform has deleted stays visible but cannot be entered.
      isActive: m.organization.status !== 'DELETED',
    }))
  }

  /**
   * The organisation a session defaults to when none is chosen — the user's first
   * non-deleted membership. Skips deleted organisations so a user is never
   * dropped into a dead tenant.
   */
  async pickDefaultOrganizationId(userId: string): Promise<string | null> {
    const membership = await this.owner.membership.findFirst({
      where: {
        userId,
        deletedAt: null,
        organization: { deletedAt: null, status: { not: 'DELETED' } },
      },
      orderBy: { createdAt: 'asc' },
      select: { organizationId: true },
    })
    return membership?.organizationId ?? null
  }

  /** The user's membership in a specific organisation, or null if they are not a member. */
  async resolveActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<{ role: MemberRole; permissions: string[] } | null> {
    const membership = await this.owner.membership.findFirst({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        organization: { deletedAt: null },
      },
      select: { role: true, permissions: true },
    })
    if (!membership) return null
    return { role: membership.role as MemberRole, permissions: membership.permissions }
  }

  /**
   * The active organisation recorded on a session.
   *
   * Read directly from the row rather than trusted from Better Auth's session
   * object: `activeOrganizationId` is our column, not one Better Auth models, so
   * the database is the authority for it.
   */
  async readActiveOrganizationId(sessionId: string): Promise<string | null> {
    const row = await this.owner.session.findUnique({
      where: { id: sessionId },
      select: { activeOrganizationId: true },
    })
    return row?.activeOrganizationId ?? null
  }

  /** Persists the active organisation onto the session row (source of truth). */
  async persistActiveOrganization(sessionId: string, organizationId: string): Promise<void> {
    await this.owner.session.update({
      where: { id: sessionId },
      data: { activeOrganizationId: organizationId },
    })
  }

  /**
   * Builds the request principal from a resolved membership.
   *
   * Permissions are computed once here — the role's permissions from the RBAC
   * matrix, unioned with any per-member grants — and never re-derived downstream.
   */
  buildPrincipal(
    user: { id: string; email: string; name: string },
    organizationId: string,
    membership: { role: MemberRole; permissions: string[] },
    sessionId: string,
  ): Principal {
    return {
      type: 'user',
      id: user.id,
      organizationId,
      role: membership.role,
      permissions: effectivePermissions(membership.role, membership.permissions),
      sessionId,
      email: user.email,
      displayName: user.name,
    }
  }

  /**
   * Removes a user from an organisation.
   *
   * Refuses to let the last remaining OWNER leave — an organisation without an
   * owner is unadministrable, and the correct path is to transfer ownership first.
   * The membership is soft-deleted so history and audit references survive.
   */
  async leaveOrganization(
    userId: string,
    organizationId: string,
  ): Promise<{ ok: true } | { error: 'not_a_member' | 'sole_owner' }> {
    const membership = await this.owner.membership.findFirst({
      where: { userId, organizationId, deletedAt: null },
      select: { id: true, role: true },
    })
    if (!membership) return { error: 'not_a_member' }

    if (membership.role === 'OWNER') {
      const otherOwners = await this.owner.membership.count({
        where: { organizationId, role: 'OWNER', deletedAt: null, userId: { not: userId } },
      })
      if (otherOwners === 0) return { error: 'sole_owner' }
    }

    await this.owner.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: membership.id }, data: { deletedAt: new Date() } })
      // Any session pinned to this org is unpinned, so the next request re-defaults.
      await tx.session.updateMany({
        where: { userId, activeOrganizationId: organizationId },
        data: { activeOrganizationId: null },
      })
      await this.writeAudit(
        tx,
        organizationId,
        userId,
        'member.left',
        'membership',
        membership.id,
        {
          role: membership.role,
        },
      )
    })

    return { ok: true }
  }

  /**
   * Transfers ownership of an organisation from one member to another.
   *
   * The new owner becomes OWNER; the previous owner is demoted to ADMIN rather
   * than removed, so they keep working without the billing-and-deletion authority
   * that ownership carries. Both must already be members. Atomic: the org is never
   * left with two owners or none.
   */
  async transferOwnership(
    organizationId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<{ ok: true } | { error: 'not_owner' | 'target_not_member' }> {
    const current = await this.owner.membership.findFirst({
      where: { userId: fromUserId, organizationId, deletedAt: null },
      select: { id: true, role: true },
    })
    if (!current || current.role !== 'OWNER') return { error: 'not_owner' }

    const target = await this.owner.membership.findFirst({
      where: { userId: toUserId, organizationId, deletedAt: null },
      select: { id: true, role: true },
    })
    if (!target) return { error: 'target_not_member' }

    await this.owner.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: target.id }, data: { role: 'OWNER' } })
      await tx.membership.update({ where: { id: current.id }, data: { role: 'ADMIN' } })
      await this.writeAudit(
        tx,
        organizationId,
        fromUserId,
        'organization.ownership_transferred',
        'organization',
        organizationId,
        { toUserId, previousOwnerNewRole: 'ADMIN' },
      )
    })

    return { ok: true }
  }

  /**
   * Accepts an invitation on behalf of the signed-in user.
   *
   * Lives in the identity layer because the invitee is, by definition, a user who
   * may not yet belong to the inviting organisation — often a brand-new account
   * with no org at all. It runs on the owner connection for exactly that reason:
   * the invitation and the target org are outside any tenant context the invitee
   * currently has.
   *
   * The invitation is bound to a specific email address; accepting it requires the
   * signed-in user's email to match, so a leaked token cannot be redeemed by
   * someone else. Idempotent for an existing member.
   */
  async acceptInvitation(
    userId: string,
    userEmail: string,
    rawToken: string,
  ): Promise<
    | { ok: true; organizationId: string; role: MemberRole }
    | { error: 'not_found' | 'not_pending' | 'expired' | 'email_mismatch' | 'org_unavailable' }
  > {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const invitation = await this.owner.invitation.findFirst({
      where: { tokenHash },
      include: { organization: { select: { status: true, deletedAt: true } } },
    })
    if (!invitation) return { error: 'not_found' }
    if (invitation.status !== 'PENDING') return { error: 'not_pending' }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.owner.invitation.updateMany({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      return { error: 'expired' }
    }
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase())
      return { error: 'email_mismatch' }
    if (
      invitation.organization.deletedAt !== null ||
      invitation.organization.status === 'DELETED'
    ) {
      return { error: 'org_unavailable' }
    }

    const role = invitation.role as MemberRole

    await this.owner.$transaction(async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { organizationId: invitation.organizationId, userId },
        select: { id: true, deletedAt: true },
      })
      if (existing) {
        // Re-activate a previously-removed membership rather than duplicating it.
        await tx.membership.update({
          where: { id: existing.id },
          data: { deletedAt: null, role },
        })
      } else {
        await tx.membership.create({
          data: { organizationId: invitation.organizationId, userId, role },
        })
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      })

      await this.writeAudit(
        tx,
        invitation.organizationId,
        userId,
        'member.invitation_accepted',
        'invitation',
        invitation.id,
        { role },
      )
    })

    return { ok: true, organizationId: invitation.organizationId, role }
  }

  /**
   * Writes a tenant audit entry from the identity layer.
   *
   * Uses the owner connection (RLS-exempt) with an explicit organisationId — the
   * identity layer operates across the tenant boundary by design, so it stamps the
   * organisation rather than relying on an ambient context that does not exist here.
   */
  private async writeAudit(
    tx: Pick<PrismaClient, 'auditLog'>,
    organizationId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    after?: Record<string, unknown>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: 'USER',
        userId,
        action,
        resourceType,
        resourceId,
        ...(after ? { after: after as never } : {}),
      },
    })
  }

  /**
   * Switches the active organisation for a session, verifying membership first.
   *
   * Returns the organisation summary so the caller can confirm the switch. Throws
   * nothing on a non-member — returns null — so the controller decides the status
   * code (a 403, not a 500).
   */
  async setActiveOrganization(
    userId: string,
    sessionId: string,
    organizationId: string,
  ): Promise<OrganizationMembershipSummary | null> {
    const membership = await this.owner.membership.findFirst({
      where: { userId, organizationId, deletedAt: null, organization: { deletedAt: null } },
      include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
    })
    if (!membership || membership.organization.status === 'DELETED') return null

    await this.owner.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: sessionId },
        data: { activeOrganizationId: organizationId },
      })
      await this.writeAudit(
        tx,
        organizationId,
        userId,
        'session.organization_switched',
        'session',
        sessionId,
      )
    })

    return {
      organizationId: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      role: membership.role as MemberRole,
      isActive: true,
    }
  }
}
