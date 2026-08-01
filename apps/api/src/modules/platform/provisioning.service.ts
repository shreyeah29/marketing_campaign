import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'

import {
  defaultFeatureConfig,
  findPlan,
  resolveDependencies,
  resolvePreset,
  validateFeatureConfig,
} from '@vsp/contracts'
import { createAdminClient, type PrismaClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import { loadEnv } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'
import { hashPassword } from '../auth/password.js'

import type { ProvisionOrganizationInput } from './provision.contracts.js'

/**
 * Provisioning — the code-free onboarding engine.
 *
 * `provision` is the whole "create organisation" wizard as one atomic
 * transaction: company, owner, subscription, feature assignments (with per-feature
 * config), limits and branding. Either it all commits or none of it does — a
 * half-provisioned organisation (an org with no owner, or features with no plan)
 * is worse than a clean failure the operator can retry.
 *
 * It runs on the **owner** connection, not the tenant-scoped client. Provisioning
 * is a platform operation that creates a tenant from outside; there is no tenant
 * context to scope to yet, and the platform plane is the one place the owner
 * connection is used deliberately and audited.
 *
 * The owner account it creates is a real, usable login: the password is hashed
 * with the same scheme Better Auth uses (see `../auth/password`), so the owner can
 * sign in immediately after provisioning — no separate activation step.
 */
@Injectable()
export class ProvisioningService {
  private readonly owner: PrismaClient

  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {
    const env = loadEnv()
    // Provisioning needs to create rows across the tenant boundary, which the
    // application role cannot. This is the audited, owner-only platform path.
    this.owner = createAdminClient(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)
  }

  /**
   * Provisions a complete organisation in one transaction.
   *
   * Returns the created ids and a summary of what was enabled, so the wizard can
   * confirm exactly what the operator created.
   */
  async provision(
    input: ProvisionOrganizationInput,
    platformAdminId: string,
  ): Promise<{
    organizationId: string
    ownerUserId: string
    plan: string
    enabledFeatures: readonly string[]
  }> {
    // Resolve the feature set and its config *before* the transaction, so an
    // invalid preset or config is a fast 400 rather than a rolled-back write.
    const plan = findPlan(input.plan)
    if (!plan) throw new BadRequestException(`Unknown plan: ${input.plan}`)

    const { features, featureConfig } = this.resolveFeatureSet(input)

    // Validate every feature config up front. A bad config must not reach the
    // database, where it would break the feature at runtime.
    for (const [featureId, config] of Object.entries(featureConfig)) {
      const result = validateFeatureConfig(featureId, config)
      if (!result.ok) {
        throw new BadRequestException(
          `Invalid config for ${featureId}: ${result.issues.join(', ')}`,
        )
      }
    }

    const limits = { ...plan.limits, ...(input.limits ?? {}) }

    // Hash before opening the transaction — scrypt is deliberately slow, and it
    // has no reason to hold a transaction (and its connection) open while it runs.
    const passwordHash = await hashPassword(input.admin.password)

    try {
      return await this.owner.$transaction(async (tx) => {
        // Guard uniqueness inside the transaction so a concurrent provision of the
        // same slug or email loses cleanly rather than creating a duplicate.
        const slugTaken = await tx.organization.findFirst({
          where: { slug: input.company.slug },
          select: { id: true },
        })
        if (slugTaken) throw new ConflictException(`Slug "${input.company.slug}" is taken`)

        const emailTaken = await tx.user.findFirst({
          where: { email: input.admin.email },
          select: { id: true },
        })
        if (emailTaken) throw new ConflictException(`A user with email ${input.admin.email} exists`)

        const org = await tx.organization.create({
          data: {
            name: input.company.name,
            slug: input.company.slug,
            industry: input.company.industry ?? null,
            website: input.company.website ?? null,
            timezone: input.company.timezone,
            status: input.status,
            // Company basics captured at onboarding — no dedicated columns needed.
            metadata: {
              ...(input.company.registeredYear !== undefined
                ? { registeredYear: input.company.registeredYear }
                : {}),
              ...(input.company.description !== undefined
                ? { description: input.company.description }
                : {}),
            },
          },
        })

        // Brand profile — the voice every content-producing agent reads. Created
        // here so generation is on-brand from the first campaign.
        if (input.profile) {
          await tx.organizationSettings.create({
            data: {
              organizationId: org.id,
              brandVoice: input.profile.vision ?? null,
              targetAudience: input.profile.targetAudience ?? null,
              tagline: input.profile.tagline ?? null,
            },
          })
        }

        // The plan row (synced from the registry) the subscription references.
        const planRow = await tx.plan.findFirstOrThrow({ where: { key: input.plan } })

        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: planRow.id,
            status: input.status === 'ACTIVE' ? 'ACTIVE' : 'TRIALING',
          },
        })

        const owner = await tx.user.create({
          data: {
            name: input.admin.name,
            email: input.admin.email,
            emailVerified: false,
          },
        })

        // Credential account, in the exact shape Better Auth's email/password
        // provider expects: providerId 'credential' and accountId = the user id.
        // Better Auth looks the credential up by (providerId, accountId) on login,
        // so matching this convention is what lets a provisioned owner sign in.
        await tx.account.create({
          data: {
            userId: owner.id,
            accountId: owner.id,
            providerId: 'credential',
            password: passwordHash,
          },
        })

        await tx.membership.create({
          data: { organizationId: org.id, userId: owner.id, role: 'OWNER' },
        })

        // Feature assignments, each with its resolved config. Source PLAN for the
        // plan's own features, GRANT for anything added beyond it.
        const planFeatureSet = new Set(plan.featureIds)
        await tx.featureAssignment.createMany({
          data: features.map((featureId) => ({
            organizationId: org.id,
            featureKey: featureId,
            enabled: true,
            source: planFeatureSet.has(featureId) ? ('PLAN' as const) : ('GRANT' as const),
            config: (featureConfig[featureId] ?? {}) as never,
          })),
        })

        // Per-org limits, seeded from the resolved (plan + override) values.
        await tx.organizationLimit.createMany({
          data: Object.entries(limits).map(([metric, limitValue]) => ({
            organizationId: org.id,
            metric,
            limitValue,
          })),
        })

        if (input.branding) {
          await tx.branding.create({
            data: {
              organizationId: org.id,
              displayName: input.branding.displayName ?? input.company.name,
              logoUrl: input.branding.logoUrl ?? null,
              faviconUrl: input.branding.faviconUrl ?? null,
              primaryColor: input.branding.primaryColor ?? null,
              accentColor: input.branding.accentColor ?? null,
              aiPersonality: input.branding.aiPersonality ?? null,
              loginTagline: input.branding.loginTagline ?? null,
              customDomain: input.branding.customDomain ?? null,
            },
          })
        }

        // Platform audit — a separate trail from the tenant audit log. Records
        // which platform admin created which org and with what.
        await tx.platformAuditLog.create({
          data: {
            platformAdminId,
            action: 'organization.provisioned',
            targetOrganizationId: org.id,
            resourceType: 'organization',
            resourceId: org.id,
            after: {
              slug: org.slug,
              plan: input.plan,
              features: features.length,
              preset: input.preset ?? null,
            },
          },
        })

        this.logger.info(
          { organizationId: org.id, plan: input.plan, features: features.length, platformAdminId },
          'organisation provisioned',
        )

        return {
          organizationId: org.id,
          ownerUserId: owner.id,
          plan: input.plan,
          enabledFeatures: features,
        }
      })
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error
      this.logger.error({ err: error, slug: input.company.slug }, 'provisioning failed')
      throw error
    }
  }

  /**
   * Resolves the effective feature set and config from a preset and/or an
   * explicit list, with dependencies closed.
   *
   * Precedence: preset → explicit features → explicit config overrides. A feature
   * ends up with its defaults, then the preset's overrides, then the caller's.
   */
  private resolveFeatureSet(input: ProvisionOrganizationInput): {
    features: readonly string[]
    featureConfig: Record<string, Record<string, unknown>>
  } {
    const featureSet = new Set<string>()
    const config: Record<string, Record<string, unknown>> = {}

    if (input.preset !== undefined) {
      const resolved = resolvePreset(input.preset)
      for (const id of resolved.features) featureSet.add(id)
      for (const [id, cfg] of Object.entries(resolved.featureConfig)) config[id] = { ...cfg }
    }

    for (const id of input.features ?? []) featureSet.add(id)

    // Close the dependency graph — enabling Deals must include Pipelines.
    const { resolved, unknown } = resolveDependencies([...featureSet])
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown features: ${unknown.join(', ')}`)
    }

    // Fill config: default for every feature that has one, then preset overrides
    // (already in `config`), then the caller's explicit overrides last.
    for (const id of resolved) {
      const defaults = defaultFeatureConfig(id)
      if (Object.keys(defaults).length > 0 || config[id]) {
        config[id] = { ...defaults, ...(config[id] ?? {}) }
      }
    }
    for (const [id, override] of Object.entries(input.featureConfig ?? {})) {
      if (resolved.includes(id)) config[id] = { ...(config[id] ?? {}), ...override }
    }

    return { features: resolved, featureConfig: config }
  }

  async disconnect(): Promise<void> {
    await this.owner.$disconnect()
  }
}
