/**
 * Client-side version history for asset regenerate/save.
 * The frozen contract returns regenerate bodies into the textarea only and
 * does not expose a restore API — keep prior copies in this browser so
 * regeneration is not lossy in the UI.
 */

export type AssetVersion = {
  at: string
  body: string
  caption: string
  cta: string
  note?: string
}

const PREFIX = 'mos:asset-versions:'

function key(assetId: string) {
  return `${PREFIX}${assetId}`
}

export function readAssetVersions(assetId: string): AssetVersion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(key(assetId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as AssetVersion[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushAssetVersion(
  assetId: string,
  version: Omit<AssetVersion, 'at'> & { at?: string },
) {
  const next: AssetVersion[] = [
    { at: version.at ?? new Date().toISOString(), ...version },
    ...readAssetVersions(assetId),
  ].slice(0, 40)
  try {
    sessionStorage.setItem(key(assetId), JSON.stringify(next))
  } catch {
    /* quota — ignore */
  }
  return next
}
