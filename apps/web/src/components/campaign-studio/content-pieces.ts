import type { Asset, ContentPiece } from './types'

const CONCEPT_RE = /^(?:concept|piece|post|creative)\s*[#:]?\s*(\d+)\b/i
const NUM_PREFIX_RE = /^(\d+)[\.:)\-\s]/

function conceptKey(asset: Asset): string | null {
  const title = (asset.title ?? '').trim()
  if (title) {
    const m = title.match(CONCEPT_RE) || title.match(NUM_PREFIX_RE)
    if (m?.[1]) return `c${m[1]}`
    return `t:${title.toLowerCase()}`
  }
  if (asset.kind === 'IMAGE_PROMPT' || asset.kind === 'VIDEO_PROMPT') {
    return `m:${asset.id}`
  }
  return null
}

function pieceLabel(master: Asset | null, adaptations: Asset[], index: number): string {
  if (master?.title?.trim()) return master.title.trim()
  const titled = adaptations.find((a) => a.title?.trim())
  if (titled?.title?.trim()) return titled.title!.trim()
  return `Creative ${index}`
}

function statusRank(status: string): number {
  const order = [
    'FAILED',
    'REJECTED',
    'GENERATED',
    'DRAFT',
    'NEEDS_REVIEW',
    'APPROVED',
    'SCHEDULED',
    'PUBLISHING',
    'PUBLISHED',
  ]
  const i = order.indexOf(status.toUpperCase())
  return i < 0 ? 0 : i
}

/**
 * Group flat campaign assets into Content Pieces.
 * One IMAGE/VIDEO_PROMPT = one master creative; platform POSTs with the same
 * concept title/number become adaptations — not separate creatives.
 */
export function groupIntoContentPieces(assets: Asset[]): ContentPiece[] {
  type Bucket = { master: Asset | null; adaptations: Asset[] }
  const buckets = new Map<string, Bucket>()
  const assigned = new Set<string>()

  const masters = assets.filter((a) => a.kind === 'IMAGE_PROMPT' || a.kind === 'VIDEO_PROMPT')
  const copies = assets.filter((a) => a.kind !== 'IMAGE_PROMPT' && a.kind !== 'VIDEO_PROMPT')

  for (const m of masters) {
    const key = conceptKey(m) ?? `m:${m.id}`
    if (buckets.has(key) && buckets.get(key)!.master) {
      buckets.set(`m:${m.id}`, { master: m, adaptations: [] })
    } else {
      const b = buckets.get(key) ?? { master: null, adaptations: [] }
      b.master = m
      buckets.set(key, b)
    }
    assigned.add(m.id)
  }

  const unmatched: Asset[] = []
  for (const c of copies) {
    const key = conceptKey(c)
    if (key && buckets.has(key)) {
      buckets.get(key)!.adaptations.push(c)
      assigned.add(c.id)
    } else {
      unmatched.push(c)
    }
  }

  // Distribute unmatched social copy evenly across master pieces
  const masterBuckets = [...buckets.values()].filter((b) => b.master)
  let ri = 0
  for (const c of unmatched) {
    const isSocial = ['POST', 'CAPTION', 'STORY', 'REEL'].includes(c.kind)
    if (isSocial && masterBuckets.length > 0) {
      masterBuckets[ri % masterBuckets.length]!.adaptations.push(c)
      assigned.add(c.id)
      ri++
    }
  }

  const pieces: ContentPiece[] = []
  let index = 1
  for (const [key, bucket] of buckets) {
    const list = bucket.master ? [bucket.master, ...bucket.adaptations] : [...bucket.adaptations]
    if (!list.length) continue
    pieces.push({
      id: key,
      index,
      label: pieceLabel(bucket.master, bucket.adaptations, index),
      master: bucket.master,
      adaptations: bucket.adaptations,
      assets: list,
    })
    index++
  }

  for (const a of assets) {
    if (assigned.has(a.id)) continue
    pieces.push({
      id: `solo:${a.id}`,
      index,
      label: a.title?.trim() || `${a.platform} · ${a.kind}`,
      master: null,
      adaptations: [a],
      assets: [a],
    })
    index++
  }

  return pieces.sort((a, b) => a.index - b.index)
}

/** Most actionable status across a piece (failed/rejected before approved). */
export function pieceStatus(piece: ContentPiece): string {
  let worst = piece.assets[0]?.status ?? 'DRAFT'
  for (const a of piece.assets) {
    if (statusRank(a.status) < statusRank(worst)) worst = a.status
  }
  return worst
}

export function piecePlatforms(piece: ContentPiece): string[] {
  const set = new Set<string>()
  for (const a of piece.adaptations) set.add(a.platform)
  if (set.size === 0 && piece.master) set.add(piece.master.platform)
  return [...set]
}

export function piecePreviewUrl(piece: ContentPiece): string | null {
  if (piece.master?.mediaUrl) return piece.master.mediaUrl
  for (const a of piece.adaptations) {
    if (a.mediaUrl) return a.mediaUrl
  }
  return null
}

export function piecePrimaryCaption(piece: ContentPiece): string {
  const adapt = piece.adaptations[0]
  if (adapt?.caption?.trim()) return adapt.caption.trim()
  if (adapt?.body?.trim()) return adapt.body.trim()
  return ''
}
