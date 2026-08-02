'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast, EmptyState } from '@/components/kit'
import { Icon } from '@/components/icon'
import {
  BrowserDraftBanner,
  PlanView,
  buildBriefFromDraft,
  readDraft,
  upsertDraft,
  type CampaignPlan,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Strategy review for a browser draft. Generate uses the same
 * POST /campaign-assets/generate contract, then routes to the generating screen.
 */
export default function StrategyDraftPage() {
  const params = useParams<{ draftId: string }>()
  const router = useRouter()
  const toast = useToast()
  const draftId = params.draftId

  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [planning, setPlanning] = useState(false)

  useEffect(() => {
    setDraft(readDraft(draftId))
  }, [draftId])

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
      toast.push('success', `${res.assetCount} assets queued`)
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
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <BrowserDraftBanner />
        <div className="card skeleton" style={{ height: 320 }} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          {planning ? 'Building your plan…' : 'Preparing strategy…'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 0 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        <BrowserDraftBanner />
      </div>
      <PlanView
        plan={draft.plan}
        generating={generating}
        onBack={() => router.push(`/app/create/intake/${draftId}?step=objective`)}
        onGenerate={() => void generate()}
      />
      <div style={{ maxWidth: 720, margin: '12px auto 0', padding: '0 16px' }}>
        <button className="btn ghost sm" onClick={() => router.push('/app/create')}>
          <Icon name="arrow-left" size={14} /> Edit in Command Center
        </button>
      </div>
    </div>
  )
}
