import { z } from 'zod'

import { FEATURE_CATEGORIES } from '@vsp/contracts'

/**
 * Provisioning contracts — the shape of the "create organisation" wizard.
 *
 * One request creates a fully-configured client: company, admin, plan, features
 * (with per-feature config), limits and branding. Everything the platform owner
 * fills in the wizard maps to a field here, and `provisionOrganization` turns it
 * into an atomic transaction. The goal is that onboarding is this one call.
 */

const slug = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9-]+$/, 'Slug may contain only lowercase letters, numbers and hyphens')

export const provisionOrganizationSchema = z.object({
  // ── Company ────────────────────────────────────────────────────────────────
  company: z.object({
    name: z.string().min(1).max(200),
    slug,
    industry: z.string().max(100).optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional(),
    phone: z.string().max(30).optional(),
    country: z.string().length(2).optional(),
    timezone: z.string().max(64).default('UTC'),
  }),

  // ── First admin (becomes OWNER) ──────────────────────────────────────────────
  admin: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    // Never stored in plaintext; hashed before persistence. Provisioning may also
    // omit this and send an invitation instead — but for owner-driven onboarding
    // a set password is the fast path.
    password: z.string().min(8).max(200),
  }),

  // ── Subscription ─────────────────────────────────────────────────────────────
  plan: z.enum(['starter', 'growth', 'business', 'enterprise', 'custom']),
  status: z.enum(['TRIAL', 'ACTIVE']).default('TRIAL'),

  // ── Modules ──────────────────────────────────────────────────────────────────
  // Either derive features from a preset, or list them explicitly, or both (the
  // explicit set is layered on top of the preset). Dependencies are resolved
  // server-side, so the caller never has to send a closed set.
  preset: z.string().optional(),
  features: z.array(z.string()).optional(),
  // Per-feature config overrides, keyed by feature id. Merged over the preset's
  // config and the feature defaults.
  featureConfig: z.record(z.record(z.unknown())).optional(),

  // ── Limits ───────────────────────────────────────────────────────────────────
  // Overrides on top of the plan's defaults, by metric id.
  limits: z.record(z.number().int()).optional(),

  // ── Branding ─────────────────────────────────────────────────────────────────
  branding: z
    .object({
      displayName: z.string().max(200).optional(),
      logoUrl: z.string().url().optional(),
      faviconUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      aiPersonality: z.string().max(2000).optional(),
      loginTagline: z.string().max(200).optional(),
      customDomain: z.string().max(253).optional(),
    })
    .optional(),
})

export type ProvisionOrganizationInput = z.infer<typeof provisionOrganizationSchema>

/** The categories, for the wizard's expandable feature sections. */
export const FEATURE_CATEGORY_LIST = FEATURE_CATEGORIES

export const updateOrganizationStatusSchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'DELETED']),
  reason: z.string().max(500).optional(),
})

export const changePlanSchema = z.object({
  plan: z.enum(['starter', 'growth', 'business', 'enterprise', 'custom']),
})

export const setFeaturesSchema = z.object({
  // The complete desired enabled set. The service diffs against current state,
  // resolves dependencies, and applies. Sending the whole set (not a patch) means
  // the result is deterministic regardless of prior state.
  features: z.array(z.string()),
  featureConfig: z.record(z.record(z.unknown())).optional(),
})
