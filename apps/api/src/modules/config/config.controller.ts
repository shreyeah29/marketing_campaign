import { Body, Controller, Get, Inject, NotFoundException, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import {
  AGENT_MANIFESTS,
  isAgentId,
} from '@vsp/ai-core'
import {
  findProvider,
  PROVIDER_CAPABILITIES,
  providersFor,
  validateProviderCredential,
  type ProviderCapability,
} from '@vsp/contracts'
import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { EncryptionService } from '../../common/crypto/encryption.service.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { DATABASE } from '../../infrastructure/database.module.js'

const CAPABILITY_MAP: Record<ProviderCapability, string> = {
  llm: 'LLM',
  image: 'IMAGE',
  video: 'VIDEO',
  voice: 'VOICE',
  transcription: 'TRANSCRIPTION',
  embedding: 'EMBEDDING',
  telephony: 'TELEPHONY',
  email: 'EMAIL',
  social: 'SOCIAL',
  storage: 'STORAGE',
  payment: 'PAYMENT',
}

const setProviderSchema = z.object({
  capability: z.enum(PROVIDER_CAPABILITIES as unknown as readonly [ProviderCapability, ...ProviderCapability[]]),
  provider: z.string().min(1),
  // The credential fields, e.g. { apiKey: '...' } or { accountSid, authToken }.
  // Sealed before it ever reaches a row; the plaintext leaves memory immediately.
  credential: z.record(z.string()),
})

const setAgentSchema = z.object({
  agentKey: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).optional(),
})

const brandingSchema = z
  .object({
    displayName: z.string().max(200).nullish(),
    logoUrl: z.string().url().nullish(),
    faviconUrl: z.string().url().nullish(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
    headingFont: z.string().max(100).nullish(),
    bodyFont: z.string().max(100).nullish(),
    aiPersonality: z.string().max(2000).nullish(),
    loginTagline: z.string().max(200).nullish(),
    emailFromName: z.string().max(100).nullish(),
    emailFooter: z.string().max(1000).nullish(),
  })
  .strict()

/**
 * Per-organisation configuration — providers, agents and branding.
 *
 * Tenant self-service for an org admin: choose which provider fills each AI
 * capability (and store its credential, envelope-encrypted), enable or disable
 * agents and define custom ones, and set white-label branding. These are the
 * knobs that make two organisations on the same codebase behave completely
 * differently, owned by the customer rather than the platform operator.
 *
 * Every route requires an org-management permission — configuration is an admin
 * concern, not something a member changes. Credential writes require the dedicated
 * api-keys permission.
 */
@ApiTags('Configuration')
@Controller('config')
export class ConfigController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
  ) {}

  // ── Providers ────────────────────────────────────────────────────────────────

  @Get('providers')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Available providers per capability, and current selection' })
  async providers(): Promise<unknown> {
    const configured = await withTenantTransaction(this.db, (tx) =>
      tx.providerConfiguration.findMany({
        select: { capability: true, provider: true, isActive: true, credentialId: true },
      }),
    )
    const byCapability = new Map<string, (typeof configured)[number]>(configured.map((c) => [String(c.capability), c]))

    return PROVIDER_CAPABILITIES.map((capability) => {
      const current = byCapability.get(CAPABILITY_MAP[capability])
      return {
        capability,
        // The full option list, so the UI renders a picker without a second call.
        options: providersFor(capability).map((provider) => ({
          id: provider.id,
          name: provider.name,
          recommended: provider.recommended ?? false,
          credentialFields: provider.credentialFields,
        })),
        selected: current?.provider ?? null,
        credentialConfigured: current?.credentialId != null,
      }
    })
  }

  @Put('providers')
  // Storing a credential is the most sensitive config action; gate it on the
  // dedicated api-keys permission, not general org management.
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: 'Select a provider for a capability and store its credential' })
  async setProvider(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true; provider: string; maskedHint: string }> {
    const input = zodBody(setProviderSchema, body)

    const valid = validateProviderCredential(input.provider, input.capability, input.credential)
    if (!valid.ok) throw new NotFoundException(valid.reason)

    const provider = findProvider(input.provider)
    if (!provider) throw new NotFoundException(`Unknown provider: ${input.provider}`)

    // Seal the whole credential object. The plaintext exists only here, in memory.
    const sealed = this.encryption.seal(input.credential)
    // A hint from the primary field for the UI, never the secret itself.
    const primaryValue = String(
      input.credential[provider.credentialFields[0] ?? 'apiKey'] ?? '',
    )
    const maskedHint = this.encryption.maskHint(primaryValue)
    const dbCapability = CAPABILITY_MAP[input.capability]

    await withTenantTransaction(this.db, async (tx) => {
      // Store the encrypted credential.
      const credential = await tx.providerCredential.create({
        data: {
          organizationId: principal.organizationId,
          kind: dbCapability as never,
          provider: input.provider,
          ciphertext: new Uint8Array(sealed.ciphertext),
          iv: new Uint8Array(sealed.iv),
          authTag: new Uint8Array(sealed.authTag),
          wrappedKey: new Uint8Array(sealed.wrappedKey),
          keyVersion: sealed.keyVersion,
          maskedHint,
        },
      })

      // Point the capability at this provider + credential, replacing any prior
      // selection for the same capability+provider.
      await tx.providerConfiguration.upsert({
        where: {
          organizationId_capability_provider: {
            organizationId: principal.organizationId,
            capability: dbCapability as never,
            provider: input.provider,
          },
        },
        create: {
          organizationId: principal.organizationId,
          capability: dbCapability as never,
          provider: input.provider,
          credentialId: credential.id,
          isActive: true,
        },
        update: { credentialId: credential.id, isActive: true },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'provider.configured',
          resourceType: 'provider_configuration',
          resourceId: credential.id,
          // The hint, never the secret, in the audit trail.
          after: { capability: input.capability, provider: input.provider, hint: maskedHint },
        },
      })
    })

    return { ok: true, provider: input.provider, maskedHint }
  }

  // ── Agents ───────────────────────────────────────────────────────────────────

  @Get('agents')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Built-in agents and this org\'s enablement' })
  async agents(): Promise<unknown> {
    const assignments = await withTenantTransaction(this.db, (tx) =>
      tx.agentAssignment.findMany({
        select: { agentKey: true, enabled: true },
      }),
    )
    const enabledMap = new Map(assignments.map((a) => [a.agentKey, a.enabled]))

    return AGENT_MANIFESTS.map((manifest) => ({
      id: manifest.id,
      role: manifest.role,
      purpose: manifest.purpose,
      // An agent with no assignment row is off by default — an org enables the
      // agents it wants, the roster is not a fixed set everyone gets.
      enabled: enabledMap.get(manifest.id) ?? false,
    }))
  }

  @Put('agents')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Enable or disable an agent for this organisation' })
  async setAgent(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const input = zodBody(setAgentSchema, body)
    if (!isAgentId(input.agentKey)) {
      throw new NotFoundException(`Unknown agent: ${input.agentKey}`)
    }

    await withTenantTransaction(this.db, async (tx) => {
      await tx.agentAssignment.upsert({
        where: {
          organizationId_agentKey: {
            organizationId: principal.organizationId,
            agentKey: input.agentKey,
          },
        },
        create: {
          organizationId: principal.organizationId,
          agentKey: input.agentKey,
          enabled: input.enabled,
          ...(input.config === undefined ? {} : { config: input.config as never }),
        },
        update: {
          enabled: input.enabled,
          ...(input.config === undefined ? {} : { config: input.config as never }),
        },
      })
    })

    return { ok: true }
  }

  // ── Branding (white-label) ───────────────────────────────────────────────────

  @Get('branding')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'This organisation\'s branding' })
  async getBranding(): Promise<unknown> {
    const branding = await withTenantTransaction(this.db, (tx) => tx.branding.findFirst())
    return branding ?? {}
  }

  @Put('branding')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Update white-label branding' })
  async setBranding(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const input = zodBody(brandingSchema, body)

    await withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.branding.findFirst({ select: { id: true } })
      if (existing) {
        await tx.branding.updateMany({ where: { id: existing.id }, data: input as never })
      } else {
        await tx.branding.create({
          data: { organizationId: principal.organizationId, ...input } as never,
        })
      }

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'branding.updated',
          resourceType: 'branding',
          resourceId: existing?.id ?? 'new',
        },
      })
    })

    return { ok: true }
  }
}
