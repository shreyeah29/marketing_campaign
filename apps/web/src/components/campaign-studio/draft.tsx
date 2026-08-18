'use client'

import type { CreateDraft } from './types'
import { INTAKE_OBJECTIVES, paceById } from './constants'

const DRAFT_KEY = (id: string) => `mos:draft:${id}`

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function listDrafts(): CreateDraft[] {
  if (typeof window === 'undefined') return []
  const out: CreateDraft[] = []
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)
      if (!key?.startsWith('mos:draft:')) continue
      const raw = window.sessionStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as CreateDraft
      if (parsed?.id) out.push(parsed)
    }
  } catch {
    return []
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createDraftId(): string {
  return newId()
}

export function readDraft(id: string): CreateDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CreateDraft
    if (!parsed || parsed.id !== id) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(draft: CreateDraft): void {
  if (typeof window === 'undefined') return
  try {
    const next: CreateDraft = { ...draft, updatedAt: new Date().toISOString() }
    window.sessionStorage.setItem(DRAFT_KEY(draft.id), JSON.stringify(next))
  } catch {
    /* storage full / disabled — best-effort */
  }
}

const OPTIONAL_KEYS: (keyof Omit<CreateDraft, 'id' | 'brief' | 'updatedAt'>)[] = [
  'prompt',
  'selectedChips',
  'plan',
  'step',
  'objective',
  'audience',
  'channels',
  'tone',
  'audienceAgeMin',
  'audienceAgeMax',
  'audienceGender',
  'audienceLocations',
  'audienceInterests',
  'audienceLanguages',
  'audienceOccupation',
  'durationDays',
  'customStart',
  'customEnd',
  'budget',
  'planApproved',
  'formats',
  'wantPosters',
  'wantVideos',
  'lookFeel',
  'postCount',
  'videoCount',
  'adPlatforms',
  'wantEmails',
  'wantLanding',
]

export function upsertDraft(
  id: string,
  patch: Partial<Omit<CreateDraft, 'id'>> & { brief?: string },
): CreateDraft {
  const existing = readDraft(id)
  const base: CreateDraft = {
    id,
    brief: patch.brief ?? existing?.brief ?? '',
    updatedAt: new Date().toISOString(),
  }
  const merged: CreateDraft = { ...existing, ...base, ...patch, id, updatedAt: base.updatedAt }
  // Drop undefined optional keys so exactOptionalPropertyTypes stays honest.
  for (const key of OPTIONAL_KEYS) {
    if (merged[key] === undefined) delete (merged as unknown as { [k: string]: unknown })[key]
  }
  writeDraft(merged)
  return merged
}

export function composeAudienceSummary(draft: CreateDraft): string {
  const bits: string[] = []
  const min = draft.audienceAgeMin ?? 18
  const max = draft.audienceAgeMax ?? 65
  bits.push(`Ages ${min}–${max}`)
  if (draft.audienceGender && draft.audienceGender !== 'all') bits.push(draft.audienceGender)
  if (draft.audienceLocations?.length) bits.push(draft.audienceLocations.join(', '))
  if (draft.audienceInterests?.length) bits.push(`Interests: ${draft.audienceInterests.join(', ')}`)
  if (draft.audienceLanguages?.length) bits.push(`Languages: ${draft.audienceLanguages.join(', ')}`)
  if (draft.audienceOccupation?.trim()) bits.push(draft.audienceOccupation.trim())
  return bits.join(' · ')
}

export function buildBriefFromDraft(draft: CreateDraft): string {
  const parts: string[] = []
  if (draft.prompt?.trim()) parts.push(draft.prompt.trim())

  const obj = INTAKE_OBJECTIVES.find((o) => o.id === draft.objective)
  if (obj) parts.push(`Objective: ${obj.label} — ${obj.consequence}`)
  else if (draft.objective?.trim()) parts.push(`Objective: ${draft.objective.trim()}`)

  const audience = draft.audience?.trim() || composeAudienceSummary(draft)
  if (audience) parts.push(`Audience: ${audience}`)

  if (draft.channels?.length) parts.push(`Channels: ${draft.channels.join(', ')}`)

  const postCount = draft.postCount ?? 5
  const videoCount = draft.videoCount ?? (draft.wantVideos ? 1 : 0)
  const wantImages = draft.wantPosters !== false
  const adPlatforms = draft.adPlatforms ?? []

  parts.push(
    [
      'DELIVERABLES (exact — do not invent extra):',
      `- Social post concepts: exactly ${postCount} unique creative concepts.`,
      wantImages
        ? `- Images: exactly ${postCount} IMAGE_PROMPT assets (ONE poster per concept). Title each "Concept 1:", "Concept 2:", …`
        : '- Images: none — do not produce IMAGE_PROMPT assets.',
      videoCount > 0
        ? `- Videos: exactly ${videoCount} VIDEO_PROMPT assets. Title "Concept V1:", "Concept V2:", …`
        : '- Videos: none — do not produce VIDEO_PROMPT assets.',
      adPlatforms.length
        ? `- Advertisements: AD_COPY / AD_HEADLINE / AD_DESCRIPTION for: ${adPlatforms.join(', ')} only.`
        : '- Advertisements: none.',
      draft.wantEmails
        ? '- Email: produce email sequence copy as POST assets on platform GENERIC titled "Email: …".'
        : '- Email: none.',
      draft.wantLanding
        ? '- Landing page: produce landing copy as POST on platform GENERIC titled "Landing: …".'
        : '- Landing page: none.',
    ].join('\n'),
  )

  parts.push(
    [
      'MASTER CREATIVE RULE (critical for credit efficiency):',
      `Create exactly ${postCount} unique creative concepts.`,
      'For EACH concept produce:',
      wantImages
        ? '1) ONE IMAGE_PROMPT (master visual) titled "Concept N: …" — body is the detailed image-generation prompt.'
        : '1) No image prompt.',
      `2) ONE primary caption (POST) titled "Concept N: …" for the first channel.`,
      `3) Platform adaptations: additional POST assets for each of [${(draft.channels ?? []).join(', ') || 'Instagram'}], each titled with the SAME "Concept N:" prefix, adapting tone/length/hashtags per platform.`,
      'Do NOT generate a separate image or video per platform.',
      'Do NOT duplicate IMAGE_PROMPT rows across Instagram/Facebook/LinkedIn/X.',
      'Reuse the same Concept N poster conceptually across all platform adaptations.',
    ].join('\n'),
  )

  if (draft.formats?.length) parts.push(`Publish formats: ${draft.formats.join(', ')}`)

  if (draft.lookFeel?.trim()) parts.push(`Look & feel: ${draft.lookFeel.trim()}`)

  if (draft.durationDays) parts.push(`Duration: ${draft.durationDays} days`)
  else if (draft.customStart && draft.customEnd)
    parts.push(`Duration: ${draft.customStart} to ${draft.customEnd}`)

  // Pace, not a rupee figure. `draft.budget` is a leftover from before the
  // allowance funded the media; a stored draft can still carry one, and printing
  // it would put a currency amount into a brief on the client plane. The
  // generator needs to know how hard to push, and pace is that signal in the
  // only unit this side is allowed to speak.
  const pace = paceById(draft.pace)
  parts.push(`Pace: ${pace.label} — roughly ${String(pace.sharePct)}% of the monthly ad allowance`)

  if (draft.tone?.trim()) parts.push(`Tone: ${draft.tone.trim()}`)
  if (draft.selectedChips?.length)
    parts.push(`Requested outputs: ${draft.selectedChips.join(', ')}`)

  if (parts.length === 0 && draft.brief.trim()) return draft.brief.trim()
  return parts.join('\n\n') || draft.brief.trim()
}

/** Rough client-side reach estimate — not live platform data. */
export function estimateReach(draft: CreateDraft): number {
  const ageSpan = Math.max(1, (draft.audienceAgeMax ?? 45) - (draft.audienceAgeMin ?? 25))
  const locs = Math.max(1, draft.audienceLocations?.length ?? 1)
  const interests = Math.max(1, draft.audienceInterests?.length ?? 1)
  const channels = Math.max(1, draft.channels?.length ?? 1)
  const genderFactor = !draft.audienceGender || draft.audienceGender === 'all' ? 1 : 0.55
  const base = 18_000
  return Math.round(
    base * (ageSpan / 25) * locs * 1.15 * Math.sqrt(interests) * channels * genderFactor,
  )
}

export function suggestBudget(draft: CreateDraft): number {
  const days = draft.durationDays ?? 30
  const channels = Math.max(1, draft.channels?.length ?? 1)
  return Math.round(days * channels * 1_500)
}

export function BrowserDraftBanner() {
  return (
    <div role="status" className="intake-browser-banner">
      This draft lives in this browser. Closing the tab or clearing site data will lose it — there
      is no server draft API yet.
    </div>
  )
}
