'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import {
  CampaignStudioHome,
  createDraftId,
  writeDraft,
  listDrafts,
  readDraft,
  fetchCampaigns,
  normalizeIntakeStep,
  type Campaign,
  type CampaignPlan,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Campaign studio — `/app/create`.
 * Structured brief → plan → channel glimpse board (strategy route).
 */
export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateInner />
    </Suspense>
  )
}

function CreateInner() {
  const router = useRouter()
  const search = useSearchParams()
  const toast = useToast()
  const [planning, setPlanning] = useState(false)
  const [recent, setRecent] = useState<Campaign[]>([])
  const [drafts, setDrafts] = useState<CreateDraft[]>([])
  const [seedNotes, setSeedNotes] = useState('')

  const refreshLists = useCallback(() => {
    fetchCampaigns().then(setRecent)
    setDrafts(listDrafts().filter((d) => d.brief.trim() || d.prompt?.trim() || d.plan))
  }, [])

  useEffect(refreshLists, [refreshLists])

  useEffect(() => {
    const q = search.get('prompt')
    if (q?.trim()) setSeedNotes(q.trim())
  }, [search])

  async function createPlan(brief: string) {
    const text = brief.trim()
    if (text.length < 4) return
    setPlanning(true)
    try {
      const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief: text })
      const draftId = createDraftId()
      writeDraft({
        id: draftId,
        brief: text,
        prompt: text,
        plan,
        updatedAt: new Date().toISOString(),
      })
      router.push(`/app/create/strategy/${draftId}`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not create the plan')
    } finally {
      setPlanning(false)
    }
  }

  function openDraft(id: string) {
    const d = readDraft(id)
    if (!d) return
    if (d.plan) router.push(`/app/create/strategy/${id}`)
    else router.push(`/app/create/intake/${id}?step=${normalizeIntakeStep(d.step)}`)
  }

  return (
    <CampaignStudioHome
      planning={planning}
      onSubmit={(brief) => {
        const withSeed = seedNotes ? `${brief} Extra context from link: ${seedNotes}` : brief
        void createPlan(withSeed)
      }}
      recent={recent}
      onOpen={(id) => router.push(`/app/campaigns/${id}/assets`)}
      drafts={drafts}
      onOpenDraft={openDraft}
    />
  )
}
