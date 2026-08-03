import { api } from '@/lib/api'
import type { Asset } from './types'

function isMediaConcept(asset: Pick<Asset, 'kind' | 'mediaUrl'>) {
  return (asset.kind === 'IMAGE_PROMPT' || asset.kind === 'VIDEO_PROMPT') && !asset.mediaUrl
}

/**
 * Approve an asset. For image/video concepts without media, gate 1 chains into
 * Runway generate-media (API contract); otherwise approve is terminal.
 */
export async function approveCampaignAsset(asset: Pick<Asset, 'id' | 'kind' | 'mediaUrl'>) {
  await api.post(`/campaign-assets/${asset.id}/approve`, {})
  if (isMediaConcept(asset)) {
    await api.post(
      `/campaign-assets/${asset.id}/generate-media`,
      asset.kind === 'IMAGE_PROMPT' ? { variants: 2 } : {},
    )
    return 'generated' as const
  }
  return 'approved' as const
}
