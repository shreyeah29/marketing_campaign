'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { LoadingScreen } from '@/components/ui'
import {
  BrowserDraftBanner,
  INTAKE_CHANNELS,
  INTAKE_STEPS,
  INTAKE_TONES,
  buildBriefFromDraft,
  readDraft,
  upsertDraft,
  type CreateDraft,
  type IntakeStep,
} from '@/components/campaign-studio'

function isStep(v: string | null): v is IntakeStep {
  return v !== null && (INTAKE_STEPS as readonly string[]).includes(v)
}

/** useSearchParams must sit under Suspense for prerender. */
export default function IntakePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntakeInner />
    </Suspense>
  )
}

/**
 * Guided intake — four steps via ?step=. Draft is browser-only (sessionStorage).
 */
function IntakeInner() {
  const params = useParams<{ draftId: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const draftId = params.draftId
  const stepParam = search.get('step')
  const step: IntakeStep = isStep(stepParam) ? stepParam : 'objective'

  const [draft, setDraft] = useState<CreateDraft | null>(null)

  useEffect(() => {
    const existing = readDraft(draftId)
    if (existing) {
      setDraft(existing)
      return
    }
    const created = upsertDraft(draftId, { brief: '', step: 'objective' })
    setDraft(created)
  }, [draftId])

  const stepIndex = INTAKE_STEPS.indexOf(step)

  function save(patch: Partial<CreateDraft>) {
    const next = upsertDraft(draftId, { ...patch, step })
    setDraft(next)
  }

  function go(nextStep: IntakeStep) {
    const brief = draft ? buildBriefFromDraft({ ...draft, step: nextStep }) : ''
    upsertDraft(draftId, { brief, step: nextStep })
    router.push(`/app/create/intake/${draftId}?step=${nextStep}`)
  }

  function finish() {
    if (!draft) return
    const brief = buildBriefFromDraft(draft)
    upsertDraft(draftId, { brief, step: 'tone' })
    router.push(`/app/create/strategy/${draftId}`)
  }

  const title = useMemo(() => {
    switch (step) {
      case 'objective':
        return 'What is the campaign objective?'
      case 'audience':
        return 'Who are you talking to?'
      case 'channels':
        return 'Which channels matter?'
      case 'tone':
        return 'What tone should the AI use?'
    }
  }, [step])

  if (!draft) {
    return (
      <div className="card skeleton" style={{ height: 240, maxWidth: 640, margin: '40px auto' }} />
    )
  }

  return (
    <FadeIn style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>
      <BrowserDraftBanner />
      <button
        className="btn ghost sm"
        onClick={() => router.push('/app/create')}
        style={{ marginBottom: 16 }}
      >
        <Icon name="arrow-left" size={14} /> Command Center
      </button>

      <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
        Step {stepIndex + 1} of {INTAKE_STEPS.length}
      </div>
      <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}>{title}</h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>
        Answers autosave in this browser. You can jump ahead or go back anytime.
      </p>

      {step === 'objective' ? (
        <textarea
          className="input"
          rows={5}
          value={draft.objective ?? ''}
          onChange={(e) => save({ objective: e.target.value })}
          placeholder="e.g. Launch our Diwali jewellery collection with festive elegance"
          autoFocus
        />
      ) : null}

      {step === 'audience' ? (
        <textarea
          className="input"
          rows={5}
          value={draft.audience ?? ''}
          onChange={(e) => save({ audience: e.target.value })}
          placeholder="e.g. Affluent urban professionals 28–45 who gift jewellery"
          autoFocus
        />
      ) : null}

      {step === 'channels' ? (
        <div className="chips">
          {INTAKE_CHANNELS.map((c) => {
            const on = (draft.channels ?? []).includes(c)
            return (
              <button
                key={c}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                onClick={() => {
                  const cur = new Set(draft.channels ?? [])
                  if (cur.has(c)) cur.delete(c)
                  else cur.add(c)
                  save({ channels: [...cur] })
                }}
              >
                {on ? <Icon name="check" size={13} /> : null}
                {c}
              </button>
            )
          })}
        </div>
      ) : null}

      {step === 'tone' ? (
        <div className="chips">
          {INTAKE_TONES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${draft.tone === t ? 'on' : ''}`}
              onClick={() => save({ tone: t })}
            >
              {draft.tone === t ? <Icon name="check" size={13} /> : null}
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 28, gap: 10 }}>
        {stepIndex > 0 ? (
          <button className="btn" onClick={() => go(INTAKE_STEPS[stepIndex - 1]!)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {stepIndex < INTAKE_STEPS.length - 1 ? (
          <button className="btn primary" onClick={() => go(INTAKE_STEPS[stepIndex + 1]!)}>
            Continue
          </button>
        ) : (
          <button className="btn primary" onClick={finish}>
            Review strategy
          </button>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <Link className="btn ghost sm" href={`/app/create/strategy/${draftId}`}>
          Skip to strategy →
        </Link>
      </div>
    </FadeIn>
  )
}
