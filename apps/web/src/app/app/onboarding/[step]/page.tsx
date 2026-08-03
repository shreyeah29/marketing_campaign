'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { MetaConnectCard } from '@/components/meta-connect'
import { Field, Spinner } from '@/components/ui'
import { PlatformIcon } from '@/components/platform-icon'
import { StatusPill, toStatus } from '@/components/status'
import {
  completeStep,
  isOnboardStep,
  ONBOARD_STEPS,
  readOnboarding,
  writeOnboarding,
  type OnboardStep,
} from '@/components/onboarding-state'
import { createDraftId, writeDraft } from '@/components/campaign-studio'

interface Organization {
  id: string
  name: string
  industry?: string | null
  settings?: {
    tagline?: string | null
    brandVoice?: string | null
    targetAudience?: string | null
  } | null
}

interface SocialAccount {
  id: string
  platform: string
  status: string
  displayName?: string | null
  handle?: string | null
}

function stepIndex(step: OnboardStep): number {
  return ONBOARD_STEPS.findIndex((s) => s.id === step)
}

export default function OnboardingStepPage() {
  const params = useParams<{ step: string }>()
  const router = useRouter()
  const toast = useToast()
  const rawStep = params.step
  const step: OnboardStep = isOnboardStep(rawStep) ? rawStep : 'business'

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tagline, setTagline] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [goalPrompt, setGoalPrompt] = useState('')
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [metaConnected, setMetaConnected] = useState(false)
  const [completed, setCompleted] = useState<OnboardStep[]>([])

  const loadOrg = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Organization>('/organization')
      setOrg(res)
      const stored = readOnboarding()
      setTagline(stored.tagline || res.settings?.tagline || '')
      setTargetAudience(stored.targetAudience || res.settings?.targetAudience || '')
      setBrandVoice(stored.brandVoice || res.settings?.brandVoice || '')
      setGoalPrompt(stored.goalPrompt || '')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not load workspace')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadConnections = useCallback(() => {
    Promise.all([
      api.get<SocialAccount[]>('/social/accounts').catch(() => [] as SocialAccount[]),
      api.get<{ status: string } | null>('/meta/connection').catch(() => null),
    ]).then(([social, meta]) => {
      setAccounts(social)
      setMetaConnected(Boolean(meta && ['CONNECTED', 'ACTIVE'].includes(meta.status.toUpperCase())))
    })
  }, [])

  useEffect(() => {
    if (!isOnboardStep(rawStep)) {
      router.replace('/app/onboarding')
      return
    }
    writeOnboarding({ step })
    setCompleted(readOnboarding().completed)
    void loadOrg()
    if (step === 'connect') loadConnections()
  }, [rawStep, step, router, loadOrg, loadConnections])

  async function patchSettings(fields: {
    tagline?: string | null
    brandVoice?: string | null
    targetAudience?: string | null
  }) {
    const current = await api.get<Organization>('/organization').catch(() => null)
    const s = current?.settings
    await api.patch('/organization/settings', {
      tagline: fields.tagline !== undefined ? fields.tagline : (s?.tagline ?? null),
      brandVoice: fields.brandVoice !== undefined ? fields.brandVoice : (s?.brandVoice ?? null),
      targetAudience:
        fields.targetAudience !== undefined ? fields.targetAudience : (s?.targetAudience ?? null),
      monthlyReportEnabled: false,
      reportRecipientEmail: null,
    })
  }

  async function goNext() {
    setSaving(true)
    try {
      if (step === 'business') {
        writeOnboarding({ tagline, targetAudience })
        await patchSettings({
          tagline: tagline.trim() || null,
          targetAudience: targetAudience.trim() || null,
        })
        completeStep('business')
        setCompleted(readOnboarding().completed)
        router.push('/app/onboarding/brand')
      } else if (step === 'brand') {
        writeOnboarding({ brandVoice })
        await patchSettings({ brandVoice: brandVoice.trim() || null })
        completeStep('brand')
        setCompleted(readOnboarding().completed)
        router.push('/app/onboarding/connect')
      } else if (step === 'connect') {
        completeStep('connect')
        setCompleted(readOnboarding().completed)
        router.push('/app/onboarding/goals')
      } else if (step === 'goals') {
        const prompt = goalPrompt.trim()
        if (prompt.length < 4) {
          toast.push('error', 'Describe your first goal in a sentence or two')
          return
        }
        writeOnboarding({ goalPrompt: prompt })
        completeStep('goals')
        const draftId = createDraftId()
        writeDraft({
          id: draftId,
          brief: prompt,
          prompt,
          step: 'objective',
          updatedAt: new Date().toISOString(),
        })
        router.push(`/app/create/intake/${draftId}?step=objective`)
      }
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    const idx = stepIndex(step)
    if (idx <= 0) return
    const prev = ONBOARD_STEPS[idx - 1]
    if (prev) router.push(`/app/onboarding/${prev.id}`)
  }

  const connectedCount =
    accounts.filter((a) => a.status === 'CONNECTED').length + (metaConnected ? 1 : 0)

  return (
    <div className="onboard">
      <aside className="onboard__rail" aria-label="Onboarding progress">
        <div className="onboard__brand dim" style={{ fontSize: 12, marginBottom: 24 }}>
          Setup
        </div>
        <ol className="onboard__steps">
          {ONBOARD_STEPS.map((s) => {
            const done = completed.includes(s.id)
            const current = s.id === step
            return (
              <li
                key={s.id}
                className={`onboard__step${current ? ' is-current' : ''}${done ? ' is-done' : ''}`}
              >
                <Link href={`/app/onboarding/${s.id}`} className="onboard__step-link">
                  <span className="onboard__step-n mono">{s.n}</span>
                  <span>{s.label}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </aside>

      <main className="onboard__main">
        <FadeIn>
          <PageHeader
            title={ONBOARD_STEPS.find((s) => s.id === step)?.label ?? 'Onboarding'}
            subtitle={
              step === 'business'
                ? 'Tell us about your business so campaigns sound like you.'
                : step === 'brand'
                  ? 'This shapes everything the AI writes for you.'
                  : step === 'connect'
                    ? 'Connect at least one channel, or skip for now.'
                    : 'What would you like your first campaign to achieve?'
            }
          />

          {loading ? (
            <div className="state">
              <Spinner />
            </div>
          ) : (
            <div className="card onboard__panel">
              {step === 'business' ? (
                <>
                  <Field label="Business name">
                    <input className="input" value={org?.name ?? ''} disabled />
                  </Field>
                  <Field label="Tagline" hint="A short line that captures your brand.">
                    <input
                      className="input"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="Marketing on autopilot"
                    />
                  </Field>
                  <Field
                    label="Target audience"
                    hint="Who you sell to — the AI uses this in every plan."
                  >
                    <textarea
                      className="input"
                      rows={3}
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="Women 25–40 in metro cities interested in clean skincare"
                    />
                  </Field>
                  {org?.industry ? (
                    <p className="dim" style={{ fontSize: 13 }}>
                      Industry · {org.industry}
                    </p>
                  ) : null}
                </>
              ) : null}

              {step === 'brand' ? (
                <>
                  <Field
                    label="Brand voice"
                    hint="How should the AI sound? Formal, playful, expert, warm — describe it in your words."
                  >
                    <textarea
                      className="input"
                      rows={5}
                      value={brandVoice}
                      onChange={(e) => setBrandVoice(e.target.value)}
                      placeholder="Confident and warm. Short sentences. Never salesy."
                    />
                  </Field>
                  <p className="dim" style={{ fontSize: 13 }}>
                    Logo upload is managed under Settings → Branding when you are ready.
                  </p>
                </>
              ) : null}

              {step === 'connect' ? (
                <>
                  <MetaConnectCard />
                  {accounts.length > 0 ? (
                    <div className="stack" style={{ gap: 8, marginTop: 16 }}>
                      <h3 style={{ fontSize: 14 }}>Other channels</h3>
                      {accounts.map((a) => (
                        <div
                          key={a.id}
                          className="row spread card"
                          style={{ padding: 12, fontSize: 13 }}
                        >
                          <span className="row" style={{ gap: 8 }}>
                            <PlatformIcon platform={a.platform} size={16} />
                            {a.displayName ?? a.handle ?? a.platform}
                          </span>
                          <StatusPill status={toStatus(a.status)} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="dim" style={{ fontSize: 13, marginTop: 16 }}>
                    {connectedCount > 0
                      ? `${connectedCount} connection${connectedCount === 1 ? '' : 's'} ready.`
                      : 'No channels connected yet — you can add them later under Connections.'}{' '}
                    <Link href="/app/connections">Open full connections page →</Link>
                  </p>
                </>
              ) : null}

              {step === 'goals' ? (
                <Field label="Your first goal">
                  <textarea
                    className="input"
                    rows={5}
                    value={goalPrompt}
                    onChange={(e) => setGoalPrompt(e.target.value)}
                    placeholder="Launch my new vitamin C serum to women 25–40 in Mumbai and Delhi"
                    style={{ minHeight: 120, fontSize: 16 }}
                  />
                </Field>
              ) : null}

              <div className="onboard__foot spread">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={stepIndex(step) === 0 || saving}
                  onClick={goBack}
                >
                  Back
                </button>
                <div className="row" style={{ gap: 8 }}>
                  {step === 'connect' ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={saving}
                      onClick={() => void goNext()}
                    >
                      Skip for now
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn primary"
                    disabled={saving}
                    onClick={() => void goNext()}
                  >
                    {saving ? <Spinner /> : step === 'goals' ? 'Start intake →' : 'Continue →'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </FadeIn>
      </main>
    </div>
  )
}
