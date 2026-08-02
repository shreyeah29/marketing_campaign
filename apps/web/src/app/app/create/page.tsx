'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  CampaignStudioHome,
  createDraftId,
  writeDraft,
  listDrafts,
  fetchCampaigns,
  wizardPathForDraft,
  type Campaign,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Campaign studio — `/app/create`.
 * Step 1: prompt → wizard (platforms → media → audience) → strategy overview.
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
  const [recent, setRecent] = useState<Campaign[]>([])
  const [drafts, setDrafts] = useState<CreateDraft[]>([])
  const [seedPrompt, setSeedPrompt] = useState('')

  const refreshLists = useCallback(() => {
    fetchCampaigns().then(setRecent)
    setDrafts(listDrafts().filter((d) => d.brief.trim() || d.prompt?.trim() || d.plan))
  }, [])

  useEffect(refreshLists, [refreshLists])

  useEffect(() => {
    const q = search.get('prompt')
    if (q?.trim()) setSeedPrompt(q.trim())
  }, [search])

  function continueFromPrompt(prompt: string) {
    const text = seedPrompt ? `${prompt}\n\nExtra context from link: ${seedPrompt}` : prompt
    const draftId = createDraftId()
    writeDraft({
      id: draftId,
      brief: text,
      prompt: text,
      step: 'platforms',
      formats: ['posts'],
      wantPosters: true,
      wantVideos: false,
      updatedAt: new Date().toISOString(),
    })
    router.push(`/app/create/wizard/${draftId}?step=platforms`)
  }

  return (
    <CampaignStudioHome
      initialPrompt={seedPrompt}
      onContinue={continueFromPrompt}
      recent={recent}
      onOpen={(id) => router.push(`/app/campaigns/${id}/assets`)}
      drafts={drafts}
      onOpenDraft={(id) => {
        const d = drafts.find((x) => x.id === id)
        if (!d) return
        router.push(wizardPathForDraft(d))
      }}
    />
  )
}
