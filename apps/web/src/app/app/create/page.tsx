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
  /** The client's own product, kept faithful. See `productImageUrl`. */
  const [productImage, setProductImage] = useState<string | null>(null)
  /**
   * The saved look this campaign is designed in, when one was chosen.
   *
   * Distinct from `reference`: that attaches a picture to this one campaign,
   * this names a style the workspace already uses. Both may be set, and the
   * picture wins downstream — see the poster brief.
   */
  const [styleTemplateId, setStyleTemplateId] = useState<string | null>(null)
  /**
   * The direction's decisions, held until the draft is created.
   *
   * A direction sets counts and picture kinds as well as the look, and those
   * only become real when `start` writes the draft. Keeping them here rather
   * than writing a draft on pick means someone can try three directions, read
   * what each produces, and leave without three abandoned drafts in the rail.
   */
  const [directionId, setDirectionId] = useState<string | null>(null)
  const [directionSettings, setDirectionSettings] = useState<Partial<CreateDraft>>({})
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
      ...(productImage ? { productImageUrl: productImage } : {}),
      postCount: 5,
      videoCount: 0,
      adPlatforms: [],
      wantEmails: false,
      wantLanding: false,
      /**
       * Last, so a direction's decisions beat the defaults above.
       *
       * The defaults are what an untouched brief falls back to; a direction is
       * someone choosing. Spreading it earlier would mean picking one that wants
       * ten concepts and still generating five.
       */
      ...directionSettings,
      ...(styleTemplateId ? { styleTemplateId } : {}),
      ...(directionId ? { directionId } : {}),
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
      productImage={productImage}
      onProductImage={setProductImage}
      styleTemplateId={styleTemplateId}
      onStyleTemplate={setStyleTemplateId}
      directionId={directionId}
      onDirection={(direction) => {
        /**
         * A promotional card promises "typeset — text always correct", and only
         * the render path keeps that promise. Sending it down the AI path would
         * produce a drawn picture under a label saying the words cannot be
         * wrong, which is the exact confusion this shelf exists to end.
         *
         * So a template direction leaves the brief flow for the catalogue, with
         * its own layout already selected.
         */
        if (direction.kind === 'template' && direction.previewTemplateSlug) {
          router.push(`/app/products?template=${encodeURIComponent(direction.previewTemplateSlug)}`)
          return
        }
        /**
         * The other two that need something this screen has not got.
         *
         * A product direction stages a product photograph and a transform
         * re-renders one you already have. Neither can run from a brief alone,
         * so the card goes to the screen that holds the picture rather than
         * setting a look on a campaign that would never use it.
         */
        if (direction.needs === 'product') {
          router.push(`/app/products?direction=${encodeURIComponent(direction.id)}`)
          return
        }
        if (direction.needs === 'photo') {
          router.push(`/app/transform?direction=${encodeURIComponent(direction.id)}`)
          return
        }
        setDirectionId(direction.id)
        // The picture kinds live in their own state because the checkboxes on
        // this screen read from it; the rest rides along to `start`.
        setKinds({
          photography: direction.settings.wantPhotography !== false,
          posters: direction.settings.wantPosterDesigns === true,
        })
        setDirectionSettings(direction.settings)
      }}
      onGuidedIntake={() => {
        // Skipping the brief is allowed: intake asks the structured questions,
        // and a brief is composed from those answers alone.
        start(prompt.trim())
      }}
    />
  )
}
