'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast, EmptyState, CardSkeleton } from '@/components/kit'
import { Icon } from '@/components/icon'
import {
  BrowserDraftBanner,
  PlanView,
  buildBriefFromDraft,
  readDraft,
  upsertDraft,
  type CampaignPlan,
  type CreateDraft,
  type SectionId,
} from '@/components/campaign-studio'

/**
 * Strategy review for a browser draft. Generate uses the same
 * POST /campaign-assets/generate contract, then routes to the generating screen.
 * Request-changes re-calls plan and merges only the commented section.
 */
export default function StrategyDraftPage() {
  const params = useParams<{ draftId: string }>()
  const router = useRouter()
  const toast = useToast()
  const draftId = params.draftId

  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    setDraft(readDraft(draftId))
  }, [draftId])

  // ── Posters start themselves ─────────────────────────────────────────────
  // Approving a plan you cannot see the results of is a decision made blind, so
  // generation no longer waits behind that button: as soon as a plan exists the
  // campaign is created and the posters begin rendering. The plan stays fully
  // reviewable — it becomes the campaign's Brief tab, and "Request changes"
  // still regenerates it — but you now judge the work rather than the promise.
  //
  // Guarded on `generatedCampaignId`, which is written before navigating, so
  // coming back here never creates a second campaign or bills twice.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!draft?.plan) return
    if (draft.generatedCampaignId || autoStarted.current) return
    if (generating || planning || regenerating) return
    autoStarted.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.plan, draft?.generatedCampaignId])

  async function ensurePlan(current: CreateDraft): Promise<CampaignPlan | null> {
    if (current.plan) return current.plan
    const brief = buildBriefFromDraft(current)
    if (brief.trim().length < 4) return null
    setPlanning(true)
    try {
      const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      const next = upsertDraft(draftId, { brief, plan })
      setDraft(next)
      return plan
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not create the plan')
      return null
    } finally {
      setPlanning(false)
    }
  }

  useEffect(() => {
    if (!draft || draft.plan || planning) return
    void ensurePlan(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id])

  function persistPlan(plan: CampaignPlan) {
    if (!draft) return
    const brief = buildBriefFromDraft({ ...draft, plan })
    const next = upsertDraft(draftId, { plan, brief })
    setDraft(next)
  }

  async function requestChanges(section: SectionId, comment: string) {
    if (!draft?.plan) return
    const baseBrief = buildBriefFromDraft(draft)
    const brief = `${baseBrief}\n\nRevision request — regenerate ONLY the "${section}" section. Keep every other section unchanged.\nFeedback: ${comment}`
    setRegenerating(true)
    try {
      const fresh = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      const merged = mergeSection(draft.plan, fresh, section)
      const next = upsertDraft(draftId, { plan: merged, brief: baseBrief, planApproved: false })
      setDraft(next)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not regenerate that section')
    } finally {
      setRegenerating(false)
    }
  }

  async function generate() {
    if (!draft) return
    const brief = buildBriefFromDraft(draft)
    if (brief.trim().length < 4) {
      toast.push('error', 'Add more detail before generating')
      return
    }
    setGenerating(true)
    try {
      const res = await api.post<{ campaignId: string; assetCount: number }>(
        '/campaign-assets/generate',
        { brief },
      )
      // Recorded before navigating so returning to this screen never bills for
      // a second campaign.
      upsertDraft(draftId, { generatedCampaignId: res.campaignId })
      router.push(`/app/create/generating/${res.campaignId}`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Generation failed')
      setGenerating(false)
    }
  }

  if (!draft) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <EmptyState
          icon="file-text"
          title="Draft not found"
          hint="This draft lives in this browser only. Start again from the Command Center."
          action={
            <button className="btn primary" onClick={() => router.push('/app/create')}>
              Back to Create
            </button>
          }
        />
      </div>
    )
  }

  if (!draft.plan) {
    return (
      <div className="strat" style={{ maxWidth: 960, margin: '40px auto' }}>
        <BrowserDraftBanner />
        <CardSkeleton count={2} />
        <p className="type-secondary" style={{ textAlign: 'center', marginTop: 16 }}>
          {planning ? 'Building your plan…' : 'Preparing strategy…'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 0 48px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <BrowserDraftBanner />
        </div>
        <PlanView
          plan={draft.plan}
          draft={draft}
          approved={Boolean(draft.planApproved)}
          generating={generating}
          regenerating={regenerating}
          onBack={() => router.push(`/app/create/wizard/${draftId}?step=audience`)}
          onPlanChange={persistPlan}
          onApprove={() => {
            const next = upsertDraft(draftId, { planApproved: true, plan: draft.plan })
            setDraft(next)
          }}
          onRequestChanges={(section, comment) => void requestChanges(section, comment)}
          onGenerate={() => void generate()}
        />
        <button
          type="button"
          className="btn ghost sm"
          style={{ marginTop: 16 }}
          onClick={() => router.push('/app/create')}
        >
          <Icon name="arrow-left" size={14} /> Back to Create
        </button>
      </div>
    </div>
  )
}

/** Merge only fields belonging to the requested section — preserve user edits elsewhere. */
function mergeSection(
  current: CampaignPlan,
  fresh: CampaignPlan,
  section: SectionId,
): CampaignPlan {
  switch (section) {
    case 'overview':
      return {
        ...current,
        campaignName: fresh.campaignName,
        objective: fresh.objective,
        strategy: fresh.strategy,
      }
    case 'audience':
      return { ...current, audience: fresh.audience }
    case 'channels':
    case 'funnel':
      return {
        ...current,
        platforms: fresh.platforms,
        deliverables: fresh.deliverables,
        estimatedAssets: fresh.estimatedAssets,
      }
    case 'budget':
      return { ...current, suggestedBudget: fresh.suggestedBudget }
    case 'timeline':
      return { ...current, durationDays: fresh.durationDays }
    case 'metrics':
      return {
        ...current,
        estimatedAssets: fresh.estimatedAssets,
        deliverables: fresh.deliverables,
      }
  }
}

// Re-export for PlanView prop typing when imported from page path only.
export type { SectionId }
