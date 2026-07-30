/**
 * Response shapes returned by the API, mirrored for the client.
 *
 * These intentionally match the controller return values in `apps/api` rather
 * than being invented here. The frontend treats them as the contract: it renders
 * whatever the API says exists (features, nav, plans), never a hardcoded list.
 */

// ── Platform catalog (the wizard's source data) ────────────────────────────────

export interface CatalogFeature {
  id: string
  name: string
  description: string
  dependencies: string[]
  billingCategory: string
  defaultEnabled: boolean
}

export interface CatalogCategoryGroup {
  category: string
  features: CatalogFeature[]
}

export interface CatalogPlan {
  id: string
  name: string
  description: string
  featureCount: number
  featureIds: string[]
  monthlyPriceUsd: number | null
  customPricing: boolean
}

export interface CatalogPreset {
  id: string
  name: string
  industry: string
  description: string
  recommendedPlan: string
  featureCount: number
  featureIds: string[]
}

export interface Catalog {
  categories: string[]
  features: CatalogCategoryGroup[]
  plans: CatalogPlan[]
  presets: CatalogPreset[]
}

// ── Organisations ──────────────────────────────────────────────────────────────

export type OrgStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'DELETED'

export interface OrgListItem {
  id: string
  name: string
  slug: string
  status: OrgStatus
  plan: string | null
  members: number
  enabledFeatures: number
  createdAt: string
}

export interface OrgDetail {
  id: string
  name: string
  slug: string
  status: OrgStatus
  industry: string | null
  plan: { key: string; name: string } | null
  features: { key: string; source: string }[]
  limits: { metric: string; limit: number }[]
  branding: { displayName: string | null; primaryColor: string | null } | null
  usage: {
    members: number
    contacts: number
    campaigns: number
    agentRuns: number
    aiCostUsd: string
    aiCalls: number
  }
}

export interface ProvisionResult {
  organizationId: string
  enabledFeatures: string[]
  message: string
}

export interface PlatformAdmin {
  id: string
  email: string
  name: string | null
  role: string
}

// ── Provisioning input (the wizard's output) ───────────────────────────────────

export interface ProvisionInput {
  company: {
    name: string
    slug: string
    industry?: string
    timezone?: string
  }
  admin: {
    email: string
    name: string
    password: string
  }
  plan: string
  status?: OrgStatus
  preset?: string
  features?: string[]
  featureConfig?: Record<string, Record<string, unknown>>
}

// ── Tenant workspace (dynamic nav) ─────────────────────────────────────────────

export interface NavEntry {
  label: string
  icon?: string
  // The API sends `path` (e.g. "/crm/contacts"); the shell links to `/app${path}`.
  path: string
  section: string
  order: number
}

export interface NavGroup {
  section: string
  items: NavEntry[]
}

export interface Workspace {
  user: { id: string; email: string; name: string; role: string; permissions: string[] }
  organization: {
    id: string
    name: string
    slug: string
    industry: string | null
    timezone: string | null
    status: OrgStatus
  } | null
  plan: { key: string; name: string } | null
  enabledFeatures: string[]
  navigation: NavGroup[]
  branding: {
    displayName: string | null
    logoUrl: string | null
    faviconUrl: string | null
    primaryColor: string | null
    secondaryColor: string | null
    accentColor: string | null
    headingFont: string | null
    bodyFont: string | null
    loginTagline: string | null
  } | null
  limits: {
    metric: string
    name: string
    unit: string
    period: string
    limit: number | null
  }[]
}
