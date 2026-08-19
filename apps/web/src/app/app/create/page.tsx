'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  readBriefScratch,
  writeBriefScratch,
  clearBriefScratch,
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
  /**
   * The coaching for the brief on screen.
   *
   * Held here rather than in the coach because it outlives the component: a
   * refresh, or a walk to the intake step and back, should not re-read the same
   * paragraph. The model is paid per read.
   */
  const [coach, setCoach] = useState<unknown>(null)
  /** Photography on, posters opt-in — see PromptView for why. */
  const [kinds, setKinds] = useState({ photography: true, posters: false })
  const [reference, setReference] = useState<string | null>(null)
  /**
   * The saved look this campaign is designed in, when one was chosen.
   *
   * Distinct from `reference`: that attaches a picture to this one campaign,
   * this names a style the workspace already uses. Both may be set, and the
   * picture wins downstream — see the poster brief.
   */
  const [styleTemplateId, setStyleTemplateId] = useState<string | null>(null)
  /**
   * The recipe's decisions, held until the draft is created.
   *
   * A recipe sets counts and picture kinds as well as the brief text, and those
   * only become real when `start` writes the draft. Keeping them here rather
   * than writing a draft on pick means someone can try three recipes, read their
   * briefs, and leave without three abandoned drafts in the rail.
   */
  const [recipeSettings, setRecipeSettings] = useState<Partial<CreateDraft>>({})
  const restored = useRef(false)

  const refreshLists = useCallback(() => {
    void fetchCampaigns().then(setRecent)
    setDrafts(listDrafts().filter((d) => d.brief.trim() || d.prompt?.trim() || d.plan))
  }, [])

  useEffect(refreshLists, [refreshLists])

  // Restore the unfinished brief and its coaching, once.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const scratch = readBriefScratch()
    if (!scratch) return
    setPrompt(scratch.brief)
    setCoach(scratch.coach)
  }, [])

  // Save both together. They describe the same paragraph, and a brief restored
  // without its coaching would silently pay for the read again.
  useEffect(() => {
    if (!restored.current) return
    writeBriefScratch(prompt, coach)
  }, [prompt, coach])

  // A brief can arrive by link — from Today's "start something", or a shared
  // URL. It seeds the field rather than submitting, so it stays editable.
  useEffect(() => {
    const q = search.get('prompt')
    if (q?.trim()) setPrompt(q.trim())
  }, [search])

  function start(brief: string) {
    const draftId = createDraftId()
    // The brief now has an id of its own, so the scratch copy is a duplicate
    // that would reappear on the next visit to this screen.
    clearBriefScratch()
    writeDraft({
      id: draftId,
      brief,
      prompt: brief,
      step: 'objective',
      formats: ['posts'],
      wantPosters: true,
      wantVideos: false,
      wantPhotography: kinds.photography,
      wantPosterDesigns: kinds.posters,
      ...(reference ? { referenceImageUrl: reference } : {}),
      postCount: 5,
      videoCount: 0,
      adPlatforms: [],
      wantEmails: false,
      wantLanding: false,
      /**
       * Last, so a recipe's decisions beat the defaults above.
       *
       * The defaults are what an untouched brief falls back to; a recipe is
       * someone choosing. Spreading it earlier would mean picking "Menu
       * showcase" and still generating five concepts instead of ten.
       */
      ...recipeSettings,
      ...(styleTemplateId ? { styleTemplateId } : {}),
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
      restoredCoach={coach}
      onCoachResult={setCoach}
      pictureKinds={kinds}
      onPictureKinds={setKinds}
      reference={reference}
      onReference={setReference}
      styleTemplateId={styleTemplateId}
      onStyleTemplate={setStyleTemplateId}
      onRecipe={(recipe) => {
        setPrompt(recipe.brief)
        // The picture kinds live in their own state because the checkboxes on
        // this screen read from it; the rest rides along to `start`.
        setKinds({
          photography: recipe.settings.wantPhotography !== false,
          posters: recipe.settings.wantPosterDesigns === true,
        })
        setRecipeSettings(recipe.settings)
      }}
      onGuidedIntake={() => {
        // Skipping the brief is allowed: intake asks the structured questions,
        // and a brief is composed from those answers alone.
        start(prompt.trim())
      }}
    />
  )
}
