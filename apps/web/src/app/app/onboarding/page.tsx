'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { LoadingScreen } from '@/components/ui'
import { readOnboarding, type OnboardStep } from '@/components/onboarding-state'

const STEPS: OnboardStep[] = ['business', 'brand', 'connect', 'goals']

export default function OnboardingIndexPage() {
  const router = useRouter()

  useEffect(() => {
    const state = readOnboarding()
    const resume =
      STEPS.find((s) => !state.completed.includes(s)) ??
      (state.step && STEPS.includes(state.step) ? state.step : 'business')
    router.replace(`/app/onboarding/${resume}`)
  }, [router])

  return <LoadingScreen />
}
