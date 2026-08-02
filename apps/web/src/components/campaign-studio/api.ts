import { api } from '@/lib/api'

import type { Asset, Campaign } from './types'

function unwrapList<T>(r: { data: T[] } | T[]): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  return api
    .get<{ data: Campaign[] } | Campaign[]>('/campaigns')
    .then(unwrapList)
    .catch(() => [] as Campaign[])
}

/**
 * There is no `GET /campaigns/:id` in the frozen API contract (see
 * docs/API_CONTRACT.md §8). Load the list and find by id — same pattern the
 * original campaign studio used in `openCampaign()`.
 */
export async function fetchCampaignById(id: string): Promise<Campaign | null> {
  const list = await fetchCampaigns()
  return list.find((c) => c.id === id) ?? null
}

export async function fetchAssets(campaignId: string): Promise<Asset[]> {
  return api
    .get<{ data: Asset[] } | Asset[]>(`/campaign-assets?campaignId=${campaignId}`)
    .then(unwrapList)
    .catch(() => [] as Asset[])
}
