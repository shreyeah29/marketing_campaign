'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import {
  PromptView,
  createDraftId,
  writeDraft,
  fetchCampaigns,
  type Campaign,
  type CampaignPlan,
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [planning, setPlanning] = useState(false)
  const [recent, setRecent] = useState<Campaign[]>([])

  const brief = useMemo(() => {
    const chips = [...selected]
    return chips.length > 0
      ? `${prompt.trim()}\n\nRequested outputs: ${chips.join(', ')}`
      : prompt.trim()
  }, [prompt, selected])

  const loadRecent = useCallback(() => {
    fetchCampaigns().then(setRecent)
  }, [])
  useEffect(loadRecent, [loadRecent])

  function toggleChip(c: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  async function createPlan() {
    if (brief.trim().length < 4) return
    setPlanning(true)
    try {
      const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      const draftId = createDraftId()
      writeDraft({
        id: draftId,
        brief,
        prompt: prompt.trim(),
        selectedChips: [...selected],
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
      brief: '',
      step: 'objective',
      updatedAt: new Date().toISOString(),
    })
    router.push(`/app/create/intake/${id}?step=objective`)
  }

  return (
    <div>
      <div style={{ maxWidth: 760, margin: '0 auto 8px', padding: '0 16px' }}>
        <button type="button" className="btn ghost sm" onClick={startIntake}>
          <Icon name="clipboard" size={14} /> Guided intake instead
        </button>
      </div>
      <PromptView
        prompt={prompt}
        setPrompt={setPrompt}
        selected={selected}
        toggleChip={toggleChip}
        planning={planning}
        onSubmit={() => void createPlan()}
        recent={recent}
        onOpen={(id) => router.push(`/app/campaigns/${id}/assets`)}
      />
    </div>
  )
}
