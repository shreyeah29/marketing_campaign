import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { Public, RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'

import { CurrentIdentity } from './current-identity.decorator.js'
import { IdentityService } from './identity.service.js'
import type { RequestIdentity } from './request-identity.js'

const switchOrgSchema = z.object({ organizationId: z.string().min(1) }).strict()
const leaveOrgSchema = z.object({ organizationId: z.string().min(1) }).strict()
const transferSchema = z.object({ toUserId: z.string().min(1) }).strict()

/**
 * The org-awareness layer on top of Better Auth.
 *
 * Better Auth answers "who is this user"; these routes answer "which organisation
 * are they acting in, and which others could they act in". They are **identity**
 * routes, not org routes — a user with no organisation, or one choosing between
 * several, must be able to call them. So they are `@Public()` (which only skips
 * the org-permission guard) and authenticate through `@CurrentIdentity()`, which
 * rejects an anonymous caller.
 *
 * The one exception is ownership transfer, which is inherently an act *within* an
 * organisation by its owner — it takes the full `Principal` and the owner-only
 * billing permission.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Public()
  @Get('session')
  @ApiOperation({ summary: 'The current identity and the organisations it can act in' })
  async session(@CurrentIdentity() identity: RequestIdentity): Promise<unknown> {
    const organizations = await this.identity.listOrganizations(identity.userId)
    const activeOrganizationId = await this.identity.readActiveOrganizationId(identity.sessionId)

    return {
      user: {
        id: identity.userId,
        email: identity.email,
        name: identity.name,
        emailVerified: identity.emailVerified,
      },
      organizations,
      activeOrganizationId:
        activeOrganizationId ?? organizations.find((o) => o.isActive)?.organizationId ?? null,
      // A user with at least one live membership can enter the app; one with none
      // is authenticated but has nowhere to go until invited or provisioned.
      needsOrganization: organizations.every((o) => !o.isActive),
    }
  }

  @Public()
  @Get('organizations')
  @ApiOperation({ summary: 'Organisations the current user belongs to' })
  organizations(@CurrentIdentity() identity: RequestIdentity): Promise<unknown> {
    return this.identity.listOrganizations(identity.userId)
  }

  @Public()
  @Post('switch-organization')
  @ApiOperation({ summary: 'Set the active organisation for this session' })
  async switchOrganization(
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity,
  ): Promise<{ ok: true; organization: unknown }> {
    const { organizationId } = zodBody(switchOrgSchema, body)

    const organization = await this.identity.setActiveOrganization(
      identity.userId,
      identity.sessionId,
      organizationId,
    )
    // Not a member (or the org is deleted): a forbidden action, not a 500.
    if (!organization) {
      throw new ForbiddenException('You are not a member of that organisation')
    }

    return { ok: true, organization }
  }

  @Public()
  @Post('leave-organization')
  @ApiOperation({ summary: 'Leave an organisation' })
  async leaveOrganization(
    @Body() body: unknown,
    @CurrentIdentity() identity: RequestIdentity,
  ): Promise<{ ok: true }> {
    const { organizationId } = zodBody(leaveOrgSchema, body)

    const result = await this.identity.leaveOrganization(identity.userId, organizationId)
    if ('error' in result) {
      throw new ForbiddenException(
        result.error === 'sole_owner'
          ? 'Transfer ownership before leaving — an organisation cannot be left without an owner'
          : 'You are not a member of that organisation',
      )
    }

    return { ok: true }
  }

  @Post('transfer-ownership')
  // Owner-only: billing-manage is the permission only OWNER holds, so it doubles
  // as the "is the owner" check without a separate role test.
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  @ApiOperation({ summary: 'Transfer ownership of the active organisation to another member' })
  async transferOwnership(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const { toUserId } = zodBody(transferSchema, body)

    const result = await this.identity.transferOwnership(
      principal.organizationId,
      principal.id,
      toUserId,
    )
    if ('error' in result) {
      throw new ForbiddenException(
        result.error === 'target_not_member'
          ? 'The new owner must already be a member of this organisation'
          : 'Only the current owner can transfer ownership',
      )
    }

    return { ok: true }
  }
}
