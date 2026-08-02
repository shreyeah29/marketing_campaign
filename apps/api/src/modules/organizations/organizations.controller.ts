import { Body, Controller, Get, Inject, NotFoundException, Patch } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import type { Principal } from '../../common/auth/principal.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { zodBody } from '../../common/http/validate.js'

const updateSettingsSchema = z
  .object({
    tagline: z.string().max(200).nullish(),
    brandVoice: z.string().max(1000).nullish(),
    targetAudience: z.string().max(1000).nullish(),
    // The AI spend cap. Persisted as a decimal string so it never becomes a
    // float — this value gates real money.
    monthlyAiBudgetUsd: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Budget must be a decimal amount')
      .nullish(),
    hardStopOnBudget: z.boolean().optional(),
    // 0 = every AI action needs approval; higher = more autonomy. Bounded so a
    // client cannot set an out-of-range level the orchestrator does not handle.
    autonomyLevel: z.number().int().min(0).max(3).optional(),
    requireContentApproval: z.boolean().optional(),
    // Monthly performance report emailed to the client. When no recipient is
    // set the report goes to the organisation owner's email.
    monthlyReportEnabled: z.boolean().optional(),
    reportRecipientEmail: z.string().email().max(320).nullish(),
  })
  .strict()

/**
 * The authenticated user's own organisation.
 *
 * There is no `:id` route and no way to name another organisation: the tenant is
 * the session's, always. "Get my org" and "update my org's settings" are the only
 * operations, which is the entire surface a single-tenant-per-session model needs.
 */
@ApiTags('Organization')
@Controller('organization')
export class OrganizationsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: "Retrieve the caller's organisation and settings" })
  async getOrganization(): Promise<unknown> {
    const org = await withTenantTransaction(this.db, (tx) =>
      tx.organization.findFirst({
        where: { deletedAt: null },
        include: { settings: true, subscription: true },
      }),
    )
    if (!org) throw new NotFoundException('Organisation not found')

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      industry: org.industry,
      website: org.website,
      timezone: org.timezone,
      plan: org.subscription?.tier ?? 'FREE',
      settings: org.settings && {
        tagline: org.settings.tagline,
        brandVoice: org.settings.brandVoice,
        targetAudience: org.settings.targetAudience,
        autonomyLevel: org.settings.autonomyLevel,
        requireContentApproval: org.settings.requireContentApproval,
        monthlyAiBudgetUsd: org.settings.monthlyAiBudgetUsd?.toString() ?? null,
        hardStopOnBudget: org.settings.hardStopOnBudget,
        monthlyReportEnabled: org.settings.monthlyReportEnabled,
        reportRecipientEmail: org.settings.reportRecipientEmail,
      },
    }
  }

  @Patch('settings')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Update organisation settings' })
  async updateSettings(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const input = zodBody(updateSettingsSchema, rawBody)

    await withTenantTransaction(this.db, async (tx) => {
      const settings = await tx.organizationSettings.findFirst({ select: { id: true } })
      if (!settings) throw new NotFoundException('Organisation settings not found')

      await tx.organizationSettings.updateMany({
        where: { id: settings.id },
        data: {
          ...(input.tagline === undefined ? {} : { tagline: input.tagline }),
          ...(input.brandVoice === undefined ? {} : { brandVoice: input.brandVoice }),
          ...(input.targetAudience === undefined ? {} : { targetAudience: input.targetAudience }),
          ...(input.monthlyAiBudgetUsd === undefined
            ? {}
            : { monthlyAiBudgetUsd: input.monthlyAiBudgetUsd }),
          ...(input.hardStopOnBudget === undefined
            ? {}
            : { hardStopOnBudget: input.hardStopOnBudget }),
          ...(input.autonomyLevel === undefined ? {} : { autonomyLevel: input.autonomyLevel }),
          ...(input.requireContentApproval === undefined
            ? {}
            : { requireContentApproval: input.requireContentApproval }),
          ...(input.monthlyReportEnabled === undefined
            ? {}
            : { monthlyReportEnabled: input.monthlyReportEnabled }),
          ...(input.reportRecipientEmail === undefined
            ? {}
            : { reportRecipientEmail: input.reportRecipientEmail }),
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'organization.settings_updated',
          resourceType: 'organization_settings',
          resourceId: settings.id,
          after: input as never,
        },
      })
    })

    return { ok: true }
  }
}
