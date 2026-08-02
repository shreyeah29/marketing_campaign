'use client'

import type { CreateDraft } from './types'

const DRAFT_KEY = (id: string) => `vsp:draft:${id}`

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
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

export function upsertDraft(
  id: string,
  patch: Partial<Omit<CreateDraft, 'id'>> & { brief?: string },
): CreateDraft {
  const existing = readDraft(id)
  const next: CreateDraft = {
    id,
    brief: patch.brief ?? existing?.brief ?? '',
    updatedAt: new Date().toISOString(),
    ...(patch.prompt !== undefined
      ? { prompt: patch.prompt }
      : existing?.prompt !== undefined
        ? { prompt: existing.prompt }
        : {}),
    ...(patch.selectedChips !== undefined
      ? { selectedChips: patch.selectedChips }
      : existing?.selectedChips !== undefined
        ? { selectedChips: existing.selectedChips }
        : {}),
    ...(patch.plan !== undefined
      ? { plan: patch.plan }
      : existing?.plan !== undefined
        ? { plan: existing.plan }
        : {}),
    ...(patch.step !== undefined
      ? { step: patch.step }
      : existing?.step !== undefined
        ? { step: existing.step }
        : {}),
    ...(patch.objective !== undefined
      ? { objective: patch.objective }
      : existing?.objective !== undefined
        ? { objective: existing.objective }
        : {}),
    ...(patch.audience !== undefined
      ? { audience: patch.audience }
      : existing?.audience !== undefined
        ? { audience: existing.audience }
        : {}),
    ...(patch.channels !== undefined
      ? { channels: patch.channels }
      : existing?.channels !== undefined
        ? { channels: existing.channels }
        : {}),
    ...(patch.tone !== undefined
      ? { tone: patch.tone }
      : existing?.tone !== undefined
        ? { tone: existing.tone }
        : {}),
  }
  writeDraft(next)
  return next
}

export function buildBriefFromDraft(draft: CreateDraft): string {
  if (draft.brief.trim()) return draft.brief.trim()
  const parts: string[] = []
  if (draft.prompt?.trim()) parts.push(draft.prompt.trim())
  if (draft.objective?.trim()) parts.push(`Objective: ${draft.objective.trim()}`)
  if (draft.audience?.trim()) parts.push(`Audience: ${draft.audience.trim()}`)
  if (draft.channels?.length) parts.push(`Channels: ${draft.channels.join(', ')}`)
  if (draft.tone?.trim()) parts.push(`Tone: ${draft.tone.trim()}`)
  if (draft.selectedChips?.length)
    parts.push(`Requested outputs: ${draft.selectedChips.join(', ')}`)
  return parts.join('\n\n')
}

export function BrowserDraftBanner() {
  return (
    <div
      role="status"
      style={{
        marginBottom: 16,
        fontSize: 13,
        background: 'var(--surface-sunken)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        padding: '10px 14px',
      }}
    >
      This draft lives in this browser. Closing the tab or clearing site data will lose it — there
      is no server draft API yet.
    </div>
  )
}
