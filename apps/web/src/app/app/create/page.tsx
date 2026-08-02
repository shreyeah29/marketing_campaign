'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import {
  PromptView,
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
 * AI Command Center — `/app/create`.
 * Plans via POST /campaign-assets/plan, then persists the plan in sessionStorage
 * (no draft API) and navigates to `/app/create/strategy/[draftId]`.
 */
export default function CreatePage() {
  const router = useRouter()
  const toast = useToast()
  const [prompt, setPrompt] = useState('')
  const [planning, setPlanning] = useState(false)
  const [recent, setRecent] = useState<Campaign[]>([])
  const [drafts, setDrafts] = useState<CreateDraft[]>([])

  const refreshLists = useCallback(() => {
    fetchCampaigns().then(setRecent)
    setDrafts(listDrafts().filter((d) => d.brief.trim() || d.prompt?.trim() || d.plan))
  }, [])

  useEffect(refreshLists, [refreshLists])

  async function createPlan() {
    const brief = prompt.trim()
    if (brief.length < 4) return
    setPlanning(true)
    try {
      const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      const draftId = createDraftId()
      writeDraft({
        id: draftId,
        brief,
        prompt: brief,
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

  function startIntake() {
    const id = createDraftId()
    writeDraft({
      id,
      brief: prompt.trim(),
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      step: 'objective',
      updatedAt: new Date().toISOString(),
    })
    router.push(`/app/create/intake/${id}?step=objective`)
  }

  function openDraft(id: string) {
    const d = readDraft(id)
    if (!d) return
    if (d.plan) router.push(`/app/create/strategy/${id}`)
    else router.push(`/app/create/intake/${id}?step=${normalizeIntakeStep(d.step)}`)
  }

  return (
    <PromptView
      prompt={prompt}
      setPrompt={setPrompt}
      planning={planning}
      onSubmit={() => void createPlan()}
      recent={recent}
      onOpen={(id) => router.push(`/app/campaigns/${id}/assets`)}
      drafts={drafts}
      onOpenDraft={openDraft}
      onGuidedIntake={startIntake}
    />
  )
}
