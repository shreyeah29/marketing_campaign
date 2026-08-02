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

export interface Catalog {
  categories: string[]
  features: CatalogCategoryGroup[]
}

// ── Organisations ──────────────────────────────────────────────────────────────

export type OrgStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'DELETED'

export interface OrgListItem {
  id: string
  name: string
  slug: string
  status: OrgStatus
  industry: string | null
  logoUrl: string | null
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
  website: string | null
  registeredYear: number | null
  description: string | null
  monthlyFeeUsd: number | null
  profile: { vision: string | null; targetAudience: string | null; tagline: string | null } | null
  features: { key: string; source: string }[]
  limits: { metric: string; limit: number }[]
  branding: {
    displayName: string | null
    primaryColor: string | null
    logoUrl: string | null
  } | null
  usage: {
    members: number
    contacts: number
    leads: number
    campaigns: number
    assets: number
    agentRuns: number
    aiCostUsd: string
    aiCalls: number
  }
  setup: {
    brandProfile: boolean
    metaConnected: boolean
    socialConnected: boolean
    firstCampaign: boolean
    firstLead: boolean
  }
}

// ── Portfolio analytics (operator console) ─────────────────────────────────────

export interface PortfolioOrg {
  id: string
  name: string
  slug: string
  status: OrgStatus
  logoUrl: string | null
  createdAt: string
  members: number
  modules: string[]
  leadsTotal: number
  leads30d: number
  campaigns: number
  assetsGenerated: number
  aiCostUsd: string
  aiCalls: number
  revenueWonUsd: string
  lastActivityAt: string | null
  monthlyFeeUsd: number | null
  marginUsd: string | null
}

export interface PortfolioAnalytics {
  totals: {
    organizations: number
    active: number
    members: number
    leads30d: number
    campaigns: number
    assetsGenerated: number
    aiCostUsd: string
    revenueWonUsd: string
  }
  organizations: PortfolioOrg[]
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
    website?: string
    timezone?: string
    registeredYear?: number
    description?: string
  }
  profile?: {
    vision?: string
    targetAudience?: string
    tagline?: string
  }
  branding?: {
    displayName?: string
    logoUrl?: string
    primaryColor?: string
    accentColor?: string
  }
  admin: {
    email: string
    name: string
    password: string
  }
  status?: OrgStatus
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
