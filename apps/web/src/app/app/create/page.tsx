'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  PromptView,
  createDraftId,
  fetchCampaigns,
  listDrafts,
  writeDraft,
  wizardPathForDraft,
  type Campaign,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Studio brief — `/app/create`, step 1 of six.
 *
 * Continue creates a browser draft and hands it to guided intake, which asks
 * objective, channels, audience and duration. Deliverables are not asked for
 * any more: the plan proposes them and you approve the proposal, which is what
 * the plan step is for. The defaults written here are what
 * `buildBriefFromDraft` falls back to if the plan is generated untouched.
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
  const [prompt, setPrompt] = useState('')

  const refreshLists = useCallback(() => {
    void fetchCampaigns().then(setRecent)
    setDrafts(listDrafts().filter((d) => d.brief.trim() || d.prompt?.trim() || d.plan))
  }, [])

  useEffect(refreshLists, [refreshLists])

  // A brief can arrive by link — from Today's "start something", or a shared
  // URL. It seeds the field rather than submitting, so it stays editable.
  useEffect(() => {
    const q = search.get('prompt')
    if (q?.trim()) setPrompt(q.trim())
  }, [search])

  function start(brief: string) {
    const draftId = createDraftId()
    writeDraft({
      id: draftId,
      brief,
      prompt: brief,
      step: 'objective',
      formats: ['posts'],
      wantPosters: true,
      wantVideos: false,
      postCount: 5,
      videoCount: 0,
      adPlatforms: [],
      wantEmails: false,
      wantLanding: false,
      updatedAt: new Date().toISOString(),
    })
    router.push(`/app/create/intake/${draftId}`)
  }

  return (
    <PromptView
      prompt={prompt}
      setPrompt={setPrompt}
      planning={false}
      onSubmit={() => {
        const text = prompt.trim()
        if (text.length >= 4) start(text)
      }}
      recent={recent}
      onOpen={(id) => router.push(`/app/campaigns/${id}/assets`)}
      drafts={drafts}
      onOpenDraft={(id) => {
        const d = drafts.find((x) => x.id === id)
        if (!d) return
        router.push(wizardPathForDraft(d))
      }}
      onGuidedIntake={() => {
        // Skipping the brief is allowed: intake asks the structured questions,
        // and a brief is composed from those answers alone.
        start(prompt.trim())
      }}
    />
  )
}
