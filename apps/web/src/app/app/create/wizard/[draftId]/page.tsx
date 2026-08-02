'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import {
  CampaignWizard,
  normalizeWizardStep,
} from '@/components/campaign-studio'
import { LoadingScreen } from '@/components/ui'

export default function CreateWizardPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WizardInner />
    </Suspense>
  )
}

function WizardInner() {
  const params = useParams<{ draftId: string }>()
  const search = useSearchParams()
  const step = normalizeWizardStep(search.get('step'))
  return <CampaignWizard draftId={params.draftId} step={step} />
}
