/**
 * Platform-realm API surface — the super-admin portal's calls.
 *
 * Every function maps to one route on `PlatformController`. These are the
 * "onboard a client without code" operations: browse the registries, run the
 * provisioning wizard, list and inspect organisations, and drive the lifecycle.
 */

import { api, setPlatformToken } from './api'
import type {
  Catalog,
  OrgDetail,
  OrgListItem,
  PlatformAdmin,
  PortfolioAnalytics,
  ProvisionInput,
  ProvisionResult,
} from './types'

export const platform = {
  async login(email: string, password: string): Promise<PlatformAdmin> {
    const res = await api.post<{ token: string; admin: PlatformAdmin }>('/platform/auth/login', {
      email,
      password,
    })
    setPlatformToken(res.token)
    return res.admin
  },

  logout(): void {
    setPlatformToken(null)
  },

  catalog: () => api.get<Catalog>('/platform/catalog', { platformAuth: true }),

  listOrganizations: () =>
    api.get<OrgListItem[]>('/platform/organizations', { platformAuth: true }),

  diagnostics: () => api.get<Diagnostics>('/platform/diagnostics', { platformAuth: true }),

  /**
   * Walk the generation path and report each step.
   *
   * `draw` bills the account for one image and writes one object, so it is the
   * caller's explicit choice rather than a default.
   */
  generationTest: (draw: boolean) =>
    api.post<GenerationTest>(
      '/platform/diagnostics/generation-test',
      { draw },
      {
        platformAuth: true,
      },
    ),

  organizationDetail: (id: string) =>
    api.get<OrgDetail>(`/platform/organizations/${id}`, { platformAuth: true }),

  provision: (input: ProvisionInput) =>
    api.post<ProvisionResult>('/platform/organizations', input, { platformAuth: true }),

  setStatus: (id: string, status: string, reason?: string) =>
    api.patch<{ ok: true; status: string }>(
      `/platform/organizations/${id}/status`,
      { status, ...(reason ? { reason } : {}) },
      { platformAuth: true },
    ),

  analytics: () => api.get<PortfolioAnalytics>('/platform/analytics', { platformAuth: true }),

  setFee: (id: string, monthlyFeeUsd: number | null) =>
    api.patch<{ ok: true }>(
      `/platform/organizations/${id}/fee`,
      { monthlyFeeUsd },
      { platformAuth: true },
    ),

  /** Exchange the platform session for a read-only view-as token for one org. */
  startViewSession: (id: string) =>
    api.post<{ token: string; expiresAt: string; organization: { id: string; name: string } }>(
      `/platform/organizations/${id}/view-session`,
      undefined,
      { platformAuth: true },
    ),

  setFeatures: (
    id: string,
    features: string[],
    featureConfig?: Record<string, Record<string, unknown>>,
  ) =>
    api.put<{ ok: true; enabled: number }>(
      `/platform/organizations/${id}/features`,
      { features, ...(featureConfig ? { featureConfig } : {}) },
      { platformAuth: true },
    ),
}

/**
 * What the running API can reach. Booleans, never values.
 *
 * `commit` is the API's build. The console compares it against the frontend's own
 * build commit, because the failure that has cost the most time here is a current
 * UI talking to an API several commits behind — routes 404, fields arrive
 * missing, and nothing says why.
 */
export interface Diagnostics {
  commit: string
  environment: string
  providers: {
    runway: boolean
    runwayImageModelOverride: boolean
    runwayVideoModelOverride: boolean
    openai: boolean
    resend: boolean
    metaApp: boolean
  }
  storage: { supabase: boolean }
  infrastructure: { redis: boolean; directDatabaseUrl: boolean }
  worker: {
    lastInsightSyncAt: string | null
    insightRows: number
    connectedAdAccounts: number
  }
}

/**
 * One step of the generation self-test.
 *
 * `detail` is written by the API to be the last thing anyone needs to read —
 * when a step fails it names the setting to change, not the symptom.
 */
export interface GenerationTestStep {
  id: string
  label: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
}

export interface GenerationTest {
  ok: boolean
  ranAt: string
  /** Whether a real picture was drawn — the part that costs money. */
  drew: boolean
  steps: GenerationTestStep[]
}
