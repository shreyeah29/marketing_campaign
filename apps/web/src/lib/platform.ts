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

  listOrganizations: () => api.get<OrgListItem[]>('/platform/organizations', { platformAuth: true }),

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

  changePlan: (id: string, plan: string) =>
    api.patch<{ ok: true }>(
      `/platform/organizations/${id}/plan`,
      { plan },
      { platformAuth: true },
    ),

  setFeatures: (id: string, features: string[], featureConfig?: Record<string, Record<string, unknown>>) =>
    api.put<{ ok: true; enabled: number }>(
      `/platform/organizations/${id}/features`,
      { features, ...(featureConfig ? { featureConfig } : {}) },
      { platformAuth: true },
    ),
}
