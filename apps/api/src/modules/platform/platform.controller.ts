import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
  resolveDependencies,
  validateFeatureConfig,
} from '@marketing-os/contracts'
import { createAdminClient, type PrismaClient } from '@marketing-os/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { EntitlementService } from '../../common/entitlements/entitlement.service.js'
import { zodBody } from '../../common/http/validate.js'
import { loadEnv } from '../../config/env.js'

import { DirectionPreviewsService } from './direction-previews.service.js'
import { GenerationSelfTestService } from './generation-selftest.service.js'
import { PlatformActor } from './platform-actor.decorator.js'
import { PlatformAdminGuard } from './platform-admin.guard.js'
import { PlatformAuthService, type PlatformPrincipal } from './platform-auth.service.js'
import { ViewAsService } from './view-as.service.js'
import { ProvisioningService } from './provisioning.service.js'
import {
  changePlanSchema,
  provisionOrganizationSchema,
  setFeaturesSchema,
  updateOrganizationStatusSchema,
} from './provision.contracts.js'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

/**
 * `draw` opts into the expensive half of the self-test: one real image, billed,
 * and one real upload. Everything before it is free, so it stays off by default.
 */
const generationTestSchema = z.object({ draw: z.boolean().optional() }).strict()

/** `force` redraws directions that already have a preview. Off by default. */
const previewsSchema = z.object({ force: z.boolean().optional() }).strict()

/**
 * Categories the operator can no longer assign. The feature code stays (existing
 * orgs keep working); they are simply absent from the catalog the wizard renders
 * and from any new provisioning UI.
 */
const HIDDEN_CATEGORIES = new Set(['Commerce', 'Support', 'Communication', 'Automation'])

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
    @Inject(ViewAsService) private readonly viewAs: ViewAsService,
    @Inject(GenerationSelfTestService) private readonly selfTest: GenerationSelfTestService,
    @Inject(DirectionPreviewsService) private readonly previews: DirectionPreviewsService,
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

  // ── Diagnostics ──────────────────────────────────────────────────────────────

  /**
   * What this process can actually reach, as booleans.
   *
   * Written after a deploy failed on a missing Runway key, a second failed on a
   * stale build, and a third on a revoked grant — each diagnosed by reading env
   * panels and boot logs by eye. This answers "is the key resolving in the
   * running process" in one authenticated request, which is the question every
   * one of those incidents started with.
   *
   * Booleans, never values. A diagnostics endpoint that echoes a key is a
   * credential-exfiltration endpoint with a helpful name, and it would be reached
   * by the same token that reads every organisation's margin. The only non-boolean
   * fields are the commit, which is the point, and two counts that cannot identify
   * anything.
   *
   * Operator plane only, so `CostRedactionInterceptor` leaves it alone — otherwise
   * `monthlyFee`-shaped keys here would be stripped and the answer would lie.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('diagnostics')
  @ApiOperation({ summary: 'Whether each dependency resolves in this process' })
  async diagnostics(): Promise<unknown> {
    const env = loadEnv()

    /**
     * Reported as `lastInsightSyncAt`, and precisely: the newest `updatedAt` on
     * any AdInsight row. That is when the sync last *wrote* something, not when
     * it last ran — a poller that runs every fifteen minutes against an
     * organisation with no live ads writes nothing and leaves this null forever.
     *
     * `insightRows` is here so those two cases are distinguishable. Null with
     * zero rows means nothing has ever synced; null with rows would mean
     * something has gone strange. Without the count the field would be a
     * question rather than an answer.
     */
    const [newest, insightRows, adAccounts] = await Promise.all([
      this.owner.adInsight.aggregate({ _max: { updatedAt: true } }),
      this.owner.adInsight.count(),
      this.owner.metaConnection.count({ where: { status: 'CONNECTED' } }),
    ])

    return {
      // The build actually running. Compared against the frontend's own build
      // commit by the operator console, because a current UI talking to a stale
      // API has been the root cause more often than anything else here.
      commit: env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'unknown',
      environment: env.NODE_ENV,

      providers: {
        // Poster and video generation. The one whose absence produced a 503 that
        // read as an outage.
        runway: Boolean(env.RUNWAY_API_KEY),
        runwayImageModelOverride: Boolean(env.RUNWAY_IMAGE_MODEL),
        runwayVideoModelOverride: Boolean(env.RUNWAY_VIDEO_MODEL),
        openai: Boolean(env.OPENAI_API_KEY),
        // Alert email. False here means allowance alerts would log and not send
        // even with the per-organisation flag on.
        resend: Boolean(env.RESEND_API_KEY),
        metaApp: Boolean(env.META_APP_ID && env.META_APP_SECRET),
      },

      storage: {
        // False means generated media is stored as the provider's own URL, which
        // expires within days. Worth seeing before a client asks why last
        // month's posters are dead links.
        supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY),
      },

      infrastructure: {
        redis: Boolean(env.REDIS_URL),
        // The owner connection the allowance and the platform plane read through.
        directDatabaseUrl: Boolean(env.DIRECT_DATABASE_URL),
      },

      worker: {
        lastInsightSyncAt: newest._max.updatedAt?.toISOString() ?? null,
        insightRows,
        connectedAdAccounts: adAccounts,
      },
    }
  }

  /**
   * Walk the real generation path and report every step.
   *
   * The endpoint next door answers "is the key set". This answers "does making a
   * picture work", which is the question that actually gets asked, and it has
   * only ever been answerable by building a whole campaign, watching it fail and
   * reading the deployment logs.
   *
   * POST rather than GET because it does real work — it calls two providers, and
   * with `draw` it bills the account for one image and writes one object. That is
   * also why `draw` defaults to false: most failures are found before it, and a
   * rejected key would only fail again more slowly.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Post('diagnostics/generation-test')
  @ApiOperation({ summary: 'Run the generation path end to end and report each step' })
  async generationTest(@Body() body: unknown): Promise<unknown> {
    const { draw } = zodBody(generationTestSchema, body ?? {})
    return this.selfTest.run(draw ?? false)
  }

  /**
   * Draw one real example of each AI direction, once, for every workspace.
   *
   * Template directions already show a true render of their own layout, free
   * and exact. AI directions had nothing to show, so those cards were blank —
   * the alternative being stock artwork, which promises output nobody has seen.
   *
   * Operator-run rather than automatic: it bills for one image per direction.
   * Safe to press twice — it skips what already exists unless `force` says so.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Post('direction-previews')
  @ApiOperation({ summary: 'Generate the example picture for each AI direction' })
  async generatePreviews(@Body() body: unknown): Promise<unknown> {
    const { force } = zodBody(previewsSchema, body ?? {})
    return this.previews.generate(force ?? false)
  }

  /**
   * Where each stored sample lives, so the authoring script can fetch them.
   *
   * Operator-only and read-only. Its whole audience is
   * `scripts/fetch-direction-previews.mjs`, which downloads the set into the
   * repo — after which nothing generates them again.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('direction-preview-urls')
  @ApiOperation({ summary: 'Stored direction sample URLs, for the authoring script' })
  async directionPreviewUrls(): Promise<{ data: { directionId: string; url: string }[] }> {
    const previews = await this.previews.all()
    return {
      data: Object.entries(previews).map(([directionId, url]) => ({ directionId, url })),
    }
  }

  // ── Registry browsing (the wizard's source data) ─────────────────────────────

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('catalog')
  @ApiOperation({ summary: 'Curated feature categories for the wizard' })
  catalog(): unknown {
    const categories = FEATURE_CATEGORIES.filter((c) => !HIDDEN_CATEGORIES.has(c))
    return {
      categories,
      // Grouped by category so the wizard renders expandable sections, not a flat list.
      features: categories.map((category) => ({
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
      message: `Provisioned "${input.company.name}" with ${String(
        result.enabledFeatures.length,
      )} modules.`,
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
        branding: { select: { logoUrl: true } },
        _count: { select: { memberships: true, featureAssignments: { where: { enabled: true } } } },
      },
    })
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      industry: org.industry,
      logoUrl: org.branding?.logoUrl ?? null,
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
        branding: true,
        settings: { select: { brandVoice: true, targetAudience: true, tagline: true } },
        metaConnection: { select: { id: true } },
        featureAssignments: {
          where: { enabled: true },
          select: { featureKey: true, source: true },
        },
        organizationLimits: true,
        _count: {
          select: {
            memberships: true,
            contacts: true,
            leads: true,
            campaigns: true,
            campaignAssets: true,
            agentRuns: true,
            socialAccounts: true,
          },
        },
      },
    })
    if (!org) throw new NotFoundException('Organisation not found')

    const aiUsage = await this.owner.aiUsage.aggregate({
      where: { organizationId: id },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    })

    const metadata = (org.metadata ?? {}) as Record<string, unknown>

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      industry: org.industry,
      website: org.website,
      registeredYear:
        typeof metadata['registeredYear'] === 'number' ? metadata['registeredYear'] : null,
      description: typeof metadata['description'] === 'string' ? metadata['description'] : null,
      monthlyFeeUsd:
        typeof metadata['monthlyFeeUsd'] === 'number' ? metadata['monthlyFeeUsd'] : null,
      profile: org.settings && {
        vision: org.settings.brandVoice,
        targetAudience: org.settings.targetAudience,
        tagline: org.settings.tagline,
      },
      features: org.featureAssignments.map((f) => ({ key: f.featureKey, source: f.source })),
      limits: org.organizationLimits.map((l) => ({ metric: l.metric, limit: l.limitValue })),
      branding: org.branding && {
        displayName: org.branding.displayName,
        primaryColor: org.branding.primaryColor,
        logoUrl: org.branding.logoUrl,
      },
      usage: {
        members: org._count.memberships,
        contacts: org._count.contacts,
        leads: org._count.leads,
        campaigns: org._count.campaigns,
        assets: org._count.campaignAssets,
        agentRuns: org._count.agentRuns,
        aiCostUsd: aiUsage._sum.costUsd?.toString() ?? '0',
        aiCalls: aiUsage._count,
      },
      // Activation checklist — how far this client is from fully onboarded.
      setup: {
        brandProfile: Boolean(org.branding?.logoUrl && org.settings?.brandVoice),
        metaConnected: org.metaConnection !== null,
        socialConnected: org._count.socialAccounts > 0,
        firstCampaign: org._count.campaigns > 0,
        firstLead: org._count.leads > 0,
      },
    }
  }

  /**
   * The operator's private monthly fee note for a client — stored on
   * Organization.metadata, never exposed to any tenant surface. Powers the
   * cost & margin view.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Patch('organizations/:id/fee')
  @ApiOperation({ summary: 'Set the private monthly service fee note for an organisation' })
  async setFee(
    @Param('id') id: string,
    @Body() body: unknown,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<{ ok: true }> {
    const { monthlyFeeUsd } = zodBody(
      z.object({ monthlyFeeUsd: z.number().min(0).max(1_000_000).nullable() }),
      body,
    )
    const org = await this.owner.organization.findFirst({
      where: { id },
      select: { metadata: true },
    })
    if (!org) throw new NotFoundException('Organisation not found')
    const metadata = { ...((org.metadata ?? {}) as Record<string, unknown>) }
    if (monthlyFeeUsd === null) delete metadata['monthlyFeeUsd']
    else metadata['monthlyFeeUsd'] = monthlyFeeUsd
    await this.owner.organization.update({ where: { id }, data: { metadata: metadata as never } })
    await this.owner.platformAuditLog.create({
      data: {
        platformAdminId: actor.id,
        action: 'organization.fee_set',
        targetOrganizationId: id,
        resourceType: 'organization',
        resourceId: id,
        after: { monthlyFeeUsd },
      },
    })
    return { ok: true }
  }

  /**
   * View as client — exchanges the operator's platform session for a
   * short-lived, read-only VIEWER token inside one organisation. The platform
   * token itself never crosses into the tenant realm; this is the only bridge.
   * Both sides get an audit trail: the platform log records who started a view
   * session, and the tenant's own append-only audit log records that their
   * workspace was viewed.
   */
  @Public()
  @UseGuards(PlatformAdminGuard)
  @Post('organizations/:id/view-session')
  @ApiOperation({ summary: 'Start a read-only view-as-client session for an organisation' })
  async startViewSession(
    @Param('id') id: string,
    @PlatformActor() actor: PlatformPrincipal,
  ): Promise<{ token: string; expiresAt: string; organization: { id: string; name: string } }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the super admin can view client workspaces')
    }

    const org = await this.owner.organization.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!org) throw new NotFoundException('Organisation not found')

    const { token, expiresAt } = this.viewAs.issue({
      platformAdminId: actor.id,
      organizationId: org.id,
      email: actor.email,
    })

    await this.owner.platformAuditLog.create({
      data: {
        platformAdminId: actor.id,
        action: 'organization.view_session_started',
        targetOrganizationId: org.id,
        resourceType: 'organization',
        resourceId: org.id,
        after: { expiresAt: expiresAt.toISOString() },
      },
    })
    // The client's own trail: their append-only audit log shows the visit.
    await this.owner.auditLog
      .create({
        data: {
          organizationId: org.id,
          actorType: 'SYSTEM',
          action: 'organization.viewed_by_operator',
          resourceType: 'organization',
          resourceId: org.id,
          after: { readOnly: true, expiresAt: expiresAt.toISOString() },
        },
      })
      .catch(() => undefined)

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      organization: { id: org.id, name: org.name },
    }
  }

  // ── Portfolio analytics ──────────────────────────────────────────────────────

  @Public()
  @UseGuards(PlatformAdminGuard)
  @Get('analytics')
  @ApiOperation({ summary: 'Cross-client portfolio analytics for the operator' })
  async portfolioAnalytics(): Promise<unknown> {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [orgs, aiByOrg, revenueByOrg, leads30dByOrg, lastActivityByOrg] = await Promise.all([
      this.owner.organization.findMany({
        where: { status: { not: 'DELETED' } },
        orderBy: { createdAt: 'desc' },
        include: {
          branding: { select: { logoUrl: true, displayName: true } },
          featureAssignments: { where: { enabled: true }, select: { featureKey: true } },
          _count: {
            select: {
              memberships: true,
              leads: true,
              campaigns: true,
              campaignAssets: true,
            },
          },
        },
      }),
      this.owner.aiUsage.groupBy({
        by: ['organizationId'],
        _sum: { costUsd: true },
        _count: true,
      }),
      // Campaign-attributed revenue = deals actually WON, per client.
      this.owner.deal.groupBy({
        by: ['organizationId'],
        where: { status: 'WON' },
        _sum: { value: true },
      }),
      this.owner.lead.groupBy({
        by: ['organizationId'],
        where: { createdAt: { gte: since30d } },
        _count: true,
      }),
      this.owner.auditLog.groupBy({
        by: ['organizationId'],
        _max: { createdAt: true },
      }),
    ])

    const ai = new Map(aiByOrg.map((r) => [r.organizationId, r]))
    const revenue = new Map(revenueByOrg.map((r) => [r.organizationId, r._sum.value]))
    const leads30d = new Map(leads30dByOrg.map((r) => [r.organizationId, r._count]))
    const lastActivity = new Map(lastActivityByOrg.map((r) => [r.organizationId, r._max.createdAt]))

    const organizations = orgs.map((org) => {
      const meta = (org.metadata ?? {}) as Record<string, unknown>
      const fee = typeof meta['monthlyFeeUsd'] === 'number' ? meta['monthlyFeeUsd'] : null
      const aiCost = Number(ai.get(org.id)?._sum.costUsd ?? 0)
      return {
        id: org.id,
        name: org.branding?.displayName ?? org.name,
        slug: org.slug,
        status: org.status,
        logoUrl: org.branding?.logoUrl ?? null,
        createdAt: org.createdAt.toISOString(),
        members: org._count.memberships,
        modules: org.featureAssignments.map((f) => f.featureKey),
        leadsTotal: org._count.leads,
        leads30d: leads30d.get(org.id) ?? 0,
        campaigns: org._count.campaigns,
        assetsGenerated: org._count.campaignAssets,
        aiCostUsd: aiCost.toFixed(2),
        aiCalls: ai.get(org.id)?._count ?? 0,
        revenueWonUsd: revenue.get(org.id)?.toString() ?? '0',
        lastActivityAt: lastActivity.get(org.id)?.toISOString() ?? null,
        // Private to the operator: what you charge vs what the AI costs you.
        monthlyFeeUsd: fee,
        marginUsd: fee !== null ? (fee - aiCost).toFixed(2) : null,
      }
    })

    return {
      totals: {
        organizations: organizations.length,
        active: organizations.filter((o) => o.status === 'ACTIVE').length,
        members: organizations.reduce((s, o) => s + o.members, 0),
        leads30d: organizations.reduce((s, o) => s + o.leads30d, 0),
        campaigns: organizations.reduce((s, o) => s + o.campaigns, 0),
        assetsGenerated: organizations.reduce((s, o) => s + o.assetsGenerated, 0),
        aiCostUsd: aiByOrg.reduce((s, r) => s + Number(r._sum.costUsd ?? 0), 0).toFixed(2),
        revenueWonUsd: revenueByOrg.reduce((s, r) => s + Number(r._sum.value ?? 0), 0).toFixed(2),
      },
      organizations,
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
