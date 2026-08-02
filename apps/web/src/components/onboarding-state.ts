'use client'

const ONBOARD_KEY = 'vsp:onboarding:v1'

export type OnboardStep = 'business' | 'brand' | 'connect' | 'goals'

export interface OnboardState {
  step: OnboardStep
  completed: OnboardStep[]
  tagline?: string
  targetAudience?: string
  brandVoice?: string
  goalPrompt?: string
}

export const ONBOARD_STEPS: { id: OnboardStep; label: string; n: number }[] = [
  { id: 'business', label: 'Business', n: 1 },
  { id: 'brand', label: 'Brand kit', n: 2 },
  { id: 'connect', label: 'Connect channels', n: 3 },
  { id: 'goals', label: 'First goal', n: 4 },
]

export function readOnboarding(): OnboardState {
  if (typeof window === 'undefined') {
    return { step: 'business', completed: [] }
  }
  try {
    const raw = window.sessionStorage.getItem(ONBOARD_KEY)
    if (!raw) return { step: 'business', completed: [] }
    const parsed = JSON.parse(raw) as OnboardState
    return {
      step: parsed.step ?? 'business',
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      tagline: parsed.tagline ?? '',
      targetAudience: parsed.targetAudience ?? '',
      brandVoice: parsed.brandVoice ?? '',
      goalPrompt: parsed.goalPrompt ?? '',
    }
  } catch {
    return { step: 'business', completed: [] }
  }
}

export function writeOnboarding(patch: Partial<OnboardState>): OnboardState {
  const prev = readOnboarding()
  const next: OnboardState = { ...prev, ...patch }
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(ONBOARD_KEY, JSON.stringify(next))
    } catch {
      /* best-effort */
    }
  }
  return next
}

export function completeStep(step: OnboardStep): OnboardState {
  const prev = readOnboarding()
  const completed = prev.completed.includes(step) ? prev.completed : [...prev.completed, step]
  return writeOnboarding({ completed, step })
}

export function isOnboardStep(raw: string): raw is OnboardStep {
  return ONBOARD_STEPS.some((s) => s.id === raw)
}
