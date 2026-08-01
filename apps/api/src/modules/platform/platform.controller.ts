import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import {
  FEATURES,
  FEATURE_CATEGORIES,
  findPlan,
  PLANS,
  PRESETS,
  resolveDependencies,
  validateFeatureConfig,
} from '@vsp/contracts'
import { createAdminClient, type PrismaClient } from '@vsp/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { EntitlementService } from '../../common/entitlements/entitlement.service.js'
import { zodBody } from '../../common/http/validate.js'
import { loadEnv } from '../../config/env.js'

import { PlatformActor } from './platform-actor.decorator.js'
import { PlatformAdminGuard } from './platform-admin.guard.js'
import { PlatformAuthService, type PlatformPrincipal } from './platform-auth.service.js'
import { ProvisioningService } from './provisioning.service.js'
import {
  changePlanSchema,
  provisionOrganizationSchema,
  setFeaturesSchema,
  updateOrganizationStatusSchema,
} from './provision.contracts.js'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

/**
 * The platform-owner portal API.
 *
 * Every route here is `@Public()` — which skips the *tenant* guards, not
 * security — and guarded by `PlatformAdminGuard`, so it lives in the platform
 * realm, not the tenant realm. This is the "onboard a client without code"
 * surface: create, configure and manage organisations; browse the registries the
 * wizard is built from; run the lifecycle operations.
 *
 * The auth route is the one exception with no platform guard: you cannot present a
 * token before you have one.
 */
@ApiTags('Platform')
@Controller('platform')
export class PlatformController {
  private readonly owner: PrismaClient

  constructor(
    @Inject(PlatformAuthService) private readonly auth: PlatformAuthService,
    @Inject(ProvisioningService) private readonly provisioning: ProvisioningService,
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
  ) {
    this.owner = createAdminClient(loadEnv().DIRECT_DATABASE_URL ?? loadEnv().DATABASE_URL)
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Platform admin login' })
  async login(@Body() body: unknown): Promise<{ token: string; admin: PlatformPrincipal }> {
    const { email, password } = zodBody(loginSchema, body)
    const { token, principal } = await this.auth.login(email, password)
    return { token, admin: principal }
  }

  // ── Registry browsing (the wizard's source data) ─────────────────────────────

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('catalog')
  @ApiOperation({ summary: 'Features, categories, plans and presets for the wizard' })
  catalog(): unknown {
    return {
      categories: FEATURE_CATEGORIES,
      // Grouped by category so the wizard renders expandable sections, not a flat list.
      features: FEATURE_CATEGORIES.map((category) => ({
        category,
        features: FEATURES.filter((f) => f.category === category).map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          dependencies: f.dependencies,
          billingCategory: f.billingCategory,
          defaultEnabled: f.defaultEnabled,
        })),
      })),
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        featureCount: p.featureIds.length,
        // The wizard pre-checks these when a plan is chosen — the enabled set is
        // seeded from the plan, then the operator tweaks it.
        featureIds: p.featureIds,
        monthlyPriceUsd: p.monthlyPriceUsd,
        customPricing: p.customPricing,
      })),
      presets: PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        industry: p.industry,
        description: p.description,
        recommendedPlan: p.recommendedPlan,
        featureCount: p.featureIds.length,
        // Industry template's feature set, so choosing it pre-checks exactly those.
        featureIds: p.featureIds,
      })),
    }
  }

  // ── Organisation lifecycle ───────────────────────────────────────────────────

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Post('organizations')
  @ApiOperation({ summary: 'Provision a fully-configured organisation (the wizard)' })
  async provision(
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<unknown> {
    const input = zodBody(provisionOrganizationSchema, body)
    const result = await this.provisioning.provision(input as never, actor.id)
    return {
      ...result,
      message: `Provisioned "${input.company.name}" on the ${input.plan} plan with ${String(
        result.enabledFeatures.length,
      )} features.`,
    }
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('organizations')
  @ApiOperation({ summary: 'List all organisations' })
  async listOrganizations(): Promise<unknown[]> {
    const orgs = await this.owner.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: { select: { plan: { select: { key: true, name: true } }, status: true } },
        _count: { select: { memberships: true, featureAssignments: { where: { enabled: true } } } },
      },
    })
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      plan: org.subscription?.plan?.key ?? null,
      members: org._count.memberships,
      enabledFeatures: org._count.featureAssignments,
      createdAt: org.createdAt.toISOString(),
    }))
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('organizations/:id')
  @ApiOperation({ summary: 'Organisation detail with usage and configuration' })
  async organizationDetail(@Param('id') id: string): Promise<unknown> {
    const org = await this.owner.organization.findFirst({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        branding: true,
        featureAssignments: {
          where: { enabled: true },
          select: { featureKey: true, source: true },
        },
        organizationLimits: true,
        _count: { select: { memberships: true, contacts: true, campaigns: true, agentRuns: true } },
      },
    })
    if (!org) throw new NotFoundException('Organisation not found')

    const aiUsage = await this.owner.aiUsage.aggregate({
      where: { organizationId: id },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    })

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      industry: org.industry,
      plan: org.subscription?.plan && {
        key: org.subscription.plan.key,
        name: org.subscription.plan.name,
      },
      features: org.featureAssignments.map((f) => ({ key: f.featureKey, source: f.source })),
      limits: org.organizationLimits.map((l) => ({ metric: l.metric, limit: l.limitValue })),
      branding: org.branding && {
        displayName: org.branding.displayName,
        primaryColor: org.branding.primaryColor,
      },
      usage: {
        members: org._count.memberships,
        contacts: org._count.contacts,
        campaigns: org._count.campaigns,
        agentRuns: org._count.agentRuns,
        aiCostUsd: aiUsage._sum.costUsd?.toString() ?? '0',
        aiCalls: aiUsage._count,
      },
    }
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Patch('organizations/:id/status')
  @ApiOperation({ summary: 'Suspend, activate, or delete an organisation' })
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<{ ok: true; status: string }> {
    const { status, reason } = zodBody(updateOrganizationStatusSchema, body)

    const org = await this.owner.organization.findFirst({ where: { id }, select: { status: true } })
    if (!org) throw new NotFoundException('Organisation not found')

    await this.owner.$transaction(async (tx) => {
      await tx.organization.updateMany({ where: { id }, data: { status } })
      await tx.platformAuditLog.create({
        data: {
          platformAdminId: actor.id,
          action: `organization.${status.toLowerCase()}`,
          targetOrganizationId: id,
          resourceType: 'organization',
          resourceId: id,
          before: { status: org.status },
          after: { status, reason: reason ?? null },
        },
      })
    })

    // Invalidate the entitlement cache so the suspension takes effect immediately,
    // not after the 60s TTL — a suspended org must be locked out now.
    await this.entitlements.invalidate(id)

    return { ok: true, status }
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Patch('organizations/:id/plan')
  @ApiOperation({ summary: 'Change an organisation plan' })
  async changePlan(
    @Param('id') id: string,
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<{ ok: true }> {
    const { plan } = zodBody(changePlanSchema, body)
    const planDef = findPlan(plan)
    if (!planDef) throw new BadRequestException(`Unknown plan: ${plan}`)

    await this.owner.$transaction(async (tx) => {
      const org = await tx.organization.findFirst({
        where: { id },
        include: { subscription: true },
      })
      if (!org) throw new NotFoundException('Organisation not found')

      const planRow = await tx.plan.findFirstOrThrow({ where: { key: plan } })
      await tx.subscription.updateMany({
        where: { organizationId: id },
        data: { planId: planRow.id },
      })

      // Re-sync the plan's features as PLAN-sourced assignments. Grants and custom
      // assignments are untouched; only the plan-derived set is replaced.
      await tx.featureAssignment.deleteMany({ where: { organizationId: id, source: 'PLAN' } })
      const { resolved } = resolveDependencies(planDef.featureIds)
      await tx.featureAssignment.createMany({
        data: resolved.map((featureKey) => ({
          organizationId: id,
          featureKey,
          enabled: true,
          source: 'PLAN' as const,
        })),
        skipDuplicates: true,
      })

      await tx.platformAuditLog.create({
        data: {
          platformAdminId: actor.id,
          action: 'organization.plan_changed',
          targetOrganizationId: id,
          resourceType: 'subscription',
          resourceId: id,
          before: { plan: org.subscription?.planId ?? null },
          after: { plan },
        },
      })
    })

    await this.entitlements.invalidate(id)
    return { ok: true }
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Put('organizations/:id/features')
  @ApiOperation({ summary: 'Set the enabled feature set for an organisation' })
  async setFeatures(
    @Param('id') id: string,
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<{ ok: true; enabled: number }> {
    const input = zodBody(setFeaturesSchema, body)

    const { resolved, unknown } = resolveDependencies(input.features)
    if (unknown.length > 0) throw new BadRequestException(`Unknown features: ${unknown.join(', ')}`)

    for (const [featureId, config] of Object.entries(input.featureConfig ?? {})) {
      const result = validateFeatureConfig(featureId, config)
      if (!result.ok)
        throw new BadRequestException(
          `Invalid config for ${featureId}: ${result.issues.join(', ')}`,
        )
    }

    await this.owner.$transaction(async (tx) => {
      const org = await tx.organization.findFirst({ where: { id }, select: { id: true } })
      if (!org) throw new NotFoundException('Organisation not found')

      const desired = new Set(resolved)
      const current = await tx.featureAssignment.findMany({
        where: { organizationId: id },
        select: { featureKey: true },
      })
      const currentSet = new Set(current.map((c) => c.featureKey))

      // Disable what is no longer wanted; upsert what is.
      const toDisable = [...currentSet].filter((k) => !desired.has(k))
      if (toDisable.length > 0) {
        await tx.featureAssignment.updateMany({
          where: { organizationId: id, featureKey: { in: toDisable } },
          data: { enabled: false },
        })
      }

      for (const featureKey of resolved) {
        const config = input.featureConfig?.[featureKey]
        await tx.featureAssignment.upsert({
          where: { organizationId_featureKey: { organizationId: id, featureKey } },
          create: {
            organizationId: id,
            featureKey,
            enabled: true,
            source: 'GRANT',
            ...(config === undefined ? {} : { config: config as never }),
          },
          update: { enabled: true, ...(config === undefined ? {} : { config: config as never }) },
        })
      }

      await tx.platformAuditLog.create({
        data: {
          platformAdminId: actor.id,
          action: 'organization.features_set',
          targetOrganizationId: id,
          resourceType: 'feature_assignment',
          resourceId: id,
          after: { enabled: resolved.length },
        },
      })
    })

    await this.entitlements.invalidate(id)
    return { ok: true, enabled: resolved.length }
  }

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/clone')
  @ApiOperation({ summary: 'Clone an organisation feature+config bundle to a new org' })
  async clone(
    @Param('id') sourceId: string,
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<unknown> {
    const cloneSchema = z.object({
      company: provisionOrganizationSchema.shape.company,
      admin: provisionOrganizationSchema.shape.admin,
    })
    const input = zodBody(cloneSchema, body)

    const source = await this.owner.organization.findFirst({
      where: { id: sourceId },
      include: {
        subscription: { include: { plan: true } },
        featureAssignments: { where: { enabled: true } },
      },
    })
    if (!source) throw new NotFoundException('Source organisation not found')

    // Reuse the provisioning path with the source's plan and features, so a clone
    // is provisioned through exactly the same validated transaction as a fresh org.
    return this.provisioning.provision(
      {
        company: { ...input.company, timezone: input.company.timezone ?? 'UTC' },
        admin: input.admin,
        plan: (source.subscription?.plan?.key ?? 'starter') as never,
        status: 'TRIAL',
        features: source.featureAssignments.map((f) => f.featureKey),
        featureConfig: Object.fromEntries(
          source.featureAssignments
            .filter((f) => f.config !== null)
            .map((f) => [f.featureKey, f.config as Record<string, unknown>]),
        ),
      },
      actor.id,
    )
  }
}
