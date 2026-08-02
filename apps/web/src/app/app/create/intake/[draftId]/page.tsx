'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { api } from '@/lib/api'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Field, LoadingScreen } from '@/components/ui'
import { PlatformIcon } from '@/components/platform-icon'
import { MetaConnectCard } from '@/components/meta-connect'
import {
  BrowserDraftBanner,
  INTAKE_DURATIONS,
  INTAKE_INTEREST_SUGGESTIONS,
  INTAKE_LANGUAGES,
  INTAKE_LOCATIONS,
  INTAKE_OBJECTIVES,
  INTAKE_CHANNELS,
  INTAKE_STEPS,
  buildBriefFromDraft,
  composeAudienceSummary,
  estimateReach,
  normalizeIntakeStep,
  readDraft,
  suggestBudget,
  upsertDraft,
  type CreateDraft,
  type IntakeStep,
} from '@/components/campaign-studio'

interface SocialAccount {
  id: string
  platform: string
  status: string
}

export default function IntakePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntakeInner />
    </Suspense>
  )
}

/**
 * Guided intake — brief Part 3 §5.
 * One question per screen; draft is browser-only (sessionStorage).
 */
function IntakeInner() {
  const params = useParams<{ draftId: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const draftId = params.draftId
  const step = normalizeIntakeStep(search.get('step'))

  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [connectTarget, setConnectTarget] = useState<(typeof INTAKE_CHANNELS)[number] | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [interestQuery, setInterestQuery] = useState('')

  const refreshConnections = useCallback(() => {
    Promise.all([
      api.get<SocialAccount[]>('/social/accounts').catch(() => [] as SocialAccount[]),
      api.get<{ status: string } | null>('/meta/connection').catch(() => null),
    ]).then(([accounts, meta]) => {
      const next = new Set<string>()
      for (const a of accounts) {
        if (a.status === 'CONNECTED') next.add(a.platform.toUpperCase())
      }
      if (meta && (meta.status === 'CONNECTED' || meta.status === 'ACTIVE')) {
        next.add('INSTAGRAM')
        next.add('FACEBOOK')
        next.add('WHATSAPP')
      }
      setConnected(next)
    })
  }, [])

  useEffect(() => {
    const existing = readDraft(draftId)
    if (existing) {
      setDraft(existing)
      return
    }
    setDraft(upsertDraft(draftId, { brief: '', step: 'objective' }))
  }, [draftId])

  useEffect(() => {
    refreshConnections()
  }, [refreshConnections])

  const stepIndex = INTAKE_STEPS.indexOf(step)

  function save(patch: Partial<CreateDraft>) {
    const withAudience =
      patch.audienceAgeMin !== undefined ||
      patch.audienceAgeMax !== undefined ||
      patch.audienceGender !== undefined ||
      patch.audienceLocations !== undefined ||
      patch.audienceInterests !== undefined ||
      patch.audienceLanguages !== undefined ||
      patch.audienceOccupation !== undefined
        ? {
            ...patch,
            audience: composeAudienceSummary({
              ...(draft ?? { id: draftId, brief: '', updatedAt: '' }),
              ...patch,
            }),
          }
        : patch
    const next = upsertDraft(draftId, { ...withAudience, step })
    setDraft(next)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1200)
    return next
  }

  function go(nextStep: IntakeStep) {
    if (!draft) return
    const brief = buildBriefFromDraft({ ...draft, step: nextStep })
    upsertDraft(draftId, { brief, step: nextStep })
    router.push(`/app/create/intake/${draftId}?step=${nextStep}`)
  }

  function finish() {
    if (!draft) return
    const brief = buildBriefFromDraft(draft)
    upsertDraft(draftId, { brief, step: 'duration' })
    router.push(`/app/create/strategy/${draftId}`)
  }

  const recommended = useMemo(() => {
    const obj = INTAKE_OBJECTIVES.find((o) => o.id === draft?.objective)
    return new Set(obj?.recommendChannels ?? [])
  }, [draft?.objective])

  // Prefill recommended channels that are already connected.
  useEffect(() => {
    if (!draft?.objective || (draft.channels?.length ?? 0) > 0) return
    const obj = INTAKE_OBJECTIVES.find((o) => o.id === draft.objective)
    if (!obj) return
    const picks = obj.recommendChannels.filter((id) => {
      if (id === 'Email') return true
      const ch = INTAKE_CHANNELS.find((c) => c.id === id)
      return ch ? connected.has(ch.platform) : false
    })
    if (picks.length) save({ channels: picks })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.objective, connected])

  useEffect(() => {
    if (!draft || step !== 'duration') return
    if (typeof draft.budget === 'number') return
    if (!draft.durationDays && !draft.customStart) {
      save({ durationDays: 30, budget: suggestBudget({ ...draft, durationDays: 30 }) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft?.id])

  const reach = draft ? estimateReach(draft) : 0
  const budgetHint = draft ? suggestBudget(draft) : 0

  const locSuggestions = INTAKE_LOCATIONS.filter(
    (l) =>
      l.toLowerCase().includes(locQuery.toLowerCase()) &&
      !(draft?.audienceLocations ?? []).includes(l),
  ).slice(0, 6)

  const interestSuggestions = INTAKE_INTEREST_SUGGESTIONS.filter(
    (i) =>
      i.toLowerCase().includes(interestQuery.toLowerCase()) &&
      !(draft?.audienceInterests ?? []).includes(i),
  ).slice(0, 6)

  if (!draft) {
    return (
      <div className="intake-shell">
        <div className="skeleton-card" style={{ height: 280 }} />
      </div>
    )
  }

  const canContinue =
    step === 'objective'
      ? Boolean(draft.objective)
      : step === 'channels'
        ? (draft.channels?.length ?? 0) > 0
        : step === 'audience'
          ? true
          : Boolean(draft.durationDays || (draft.customStart && draft.customEnd))

  return (
    <FadeIn className="intake-shell">
      <BrowserDraftBanner />

      <div className="intake-top">
        <button type="button" className="btn ghost sm" onClick={() => router.push('/app/create')}>
          <Icon name="arrow-left" size={14} /> Command Center
        </button>
        <span className={`intake-saved${savedFlash ? 'is-on' : ''}`} aria-live="polite">
          {savedFlash ? 'Saved' : ''}
        </span>
      </div>

      <nav className="intake-rail" aria-label="Intake steps">
        {INTAKE_STEPS.map((s, i) => {
          const done = i < stepIndex
          const current = i === stepIndex
          return (
            <button
              key={s}
              type="button"
              className={`intake-dot${current ? 'is-current' : ''}${done ? 'is-done' : ''}`}
              aria-current={current ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s}`}
              disabled={i > stepIndex}
              onClick={() => {
                if (i <= stepIndex) go(s)
              }}
            >
              {done ? <Icon name="check" size={12} /> : <span>{i + 1}</span>}
            </button>
          )
        })}
      </nav>

      {draft.prompt?.trim() ? (
        <div className="intake-prompt-card type-secondary">{draft.prompt.trim()}</div>
      ) : null}

      {step === 'objective' ? (
        <section>
          <h1 className="intake-title">What is the campaign objective?</h1>
          <p className="intake-sub type-secondary">
            Pick one — each choice changes how budget and creative are weighted.
          </p>
          <div className="intake-obj-grid">
            {INTAKE_OBJECTIVES.map((o) => {
              const on = draft.objective === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`intake-obj${on ? 'is-selected' : ''}`}
                  onClick={() => save({ objective: o.id, channels: undefined })}
                >
                  <Icon name={o.icon} size={18} />
                  <strong>{o.label}</strong>
                  <span>{o.consequence}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {step === 'channels' ? (
        <section>
          <h1 className="intake-title">Which channels matter?</h1>
          <p className="intake-sub type-secondary">
            {draft.objective
              ? `Recommended for ${INTAKE_OBJECTIVES.find((o) => o.id === draft.objective)?.label.toLowerCase() ?? 'your objective'}.`
              : 'Select every channel you want in this campaign.'}
          </p>
          <div className="intake-channel-grid">
            {INTAKE_CHANNELS.map((c) => {
              const on = (draft.channels ?? []).includes(c.id)
              const isConnected = c.id === 'Email' || connected.has(c.platform)
              const rec = recommended.has(c.id)
              return (
                <div
                  key={c.id}
                  className={`intake-channel${on ? 'is-selected' : ''}${!isConnected ? 'is-dim' : ''}`}
                >
                  <button
                    type="button"
                    className="intake-channel__hit"
                    disabled={!isConnected}
                    onClick={() => {
                      const cur = new Set(draft.channels ?? [])
                      if (cur.has(c.id)) cur.delete(c.id)
                      else cur.add(c.id)
                      save({ channels: [...cur] })
                    }}
                  >
                    <PlatformIcon platform={c.platform} size={18} />
                    <span className="intake-channel__label">
                      {c.id}
                      {rec ? <em>Recommended</em> : null}
                    </span>
                    {on ? <Icon name="check" size={14} /> : null}
                  </button>
                  {!isConnected ? (
                    <button type="button" className="btn sm" onClick={() => setConnectTarget(c)}>
                      Connect
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {step === 'audience' ? (
        <section className="intake-audience">
          <div>
            <h1 className="intake-title">Who are you talking to?</h1>
            <p className="intake-sub type-secondary">
              Age, places, and interests — the reach figure updates as you refine.
            </p>

            <Field
              label={`Age range · ${draft.audienceAgeMin ?? 25}–${draft.audienceAgeMax ?? 45}`}
            >
              <div className="intake-dual">
                <input
                  type="range"
                  min={13}
                  max={65}
                  value={draft.audienceAgeMin ?? 25}
                  onChange={(e) => {
                    const min = Number(e.target.value)
                    const max = Math.max(min, draft.audienceAgeMax ?? 45)
                    save({ audienceAgeMin: min, audienceAgeMax: max })
                  }}
                />
                <input
                  type="range"
                  min={13}
                  max={65}
                  value={draft.audienceAgeMax ?? 45}
                  onChange={(e) => {
                    const max = Number(e.target.value)
                    const min = Math.min(max, draft.audienceAgeMin ?? 25)
                    save({ audienceAgeMin: min, audienceAgeMax: max })
                  }}
                />
              </div>
            </Field>

            <Field label="Gender">
              <div className="intake-seg">
                {(['all', 'Women', 'Men'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={(draft.audienceGender ?? 'all') === g ? 'is-on' : ''}
                    onClick={() => save({ audienceGender: g })}
                  >
                    {g === 'all' ? 'All' : g}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Locations">
              <div className="intake-tokens">
                {(draft.audienceLocations ?? []).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="intake-token"
                    onClick={() =>
                      save({
                        audienceLocations: (draft.audienceLocations ?? []).filter((x) => x !== l),
                      })
                    }
                  >
                    {l} <Icon name="x" size={12} />
                  </button>
                ))}
              </div>
              <input
                className="input"
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Search cities or regions"
              />
              {locQuery && locSuggestions.length > 0 ? (
                <div className="intake-suggest">
                  {locSuggestions.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        save({
                          audienceLocations: [...(draft.audienceLocations ?? []), l],
                        })
                        setLocQuery('')
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>

            <Field label="Interests">
              <div className="intake-tokens">
                {(draft.audienceInterests ?? []).map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="intake-token"
                    onClick={() =>
                      save({
                        audienceInterests: (draft.audienceInterests ?? []).filter((x) => x !== i),
                      })
                    }
                  >
                    {i} <Icon name="x" size={12} />
                  </button>
                ))}
              </div>
              <input
                className="input"
                value={interestQuery}
                onChange={(e) => setInterestQuery(e.target.value)}
                placeholder="Type to see suggestions"
              />
              {(interestQuery || (draft.audienceInterests?.length ?? 0) === 0) &&
              interestSuggestions.length > 0 ? (
                <div className="intake-suggest">
                  {interestSuggestions.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        save({
                          audienceInterests: [...(draft.audienceInterests ?? []), i],
                        })
                        setInterestQuery('')
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>

            <Field label="Languages">
              <div className="intake-seg wrap">
                {INTAKE_LANGUAGES.map((lang) => {
                  const on = (draft.audienceLanguages ?? []).includes(lang)
                  return (
                    <button
                      key={lang}
                      type="button"
                      className={on ? 'is-on' : ''}
                      onClick={() => {
                        const cur = new Set(draft.audienceLanguages ?? [])
                        if (cur.has(lang)) cur.delete(lang)
                        else cur.add(lang)
                        save({ audienceLanguages: [...cur] })
                      }}
                    >
                      {lang}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Occupation">
              <input
                className="input"
                value={draft.audienceOccupation ?? ''}
                onChange={(e) => save({ audienceOccupation: e.target.value })}
                placeholder="e.g. Marketing managers, new parents, SMB owners"
              />
            </Field>
          </div>

          <aside className="intake-reach" aria-live="polite">
            <div className="type-label">Estimated reach</div>
            <div className="intake-reach__num">{reach.toLocaleString()}</div>
            <p className="type-caption">
              Rough estimate from your filters — not live platform data.
            </p>
          </aside>
        </section>
      ) : null}

      {step === 'duration' ? (
        <section>
          <h1 className="intake-title">Duration and budget</h1>
          <p className="intake-sub type-secondary">
            Suggested ₹{budgetHint.toLocaleString('en-IN')} based on {draft.durationDays ?? 30} days
            across {Math.max(1, draft.channels?.length ?? 1)} channel
            {(draft.channels?.length ?? 1) === 1 ? '' : 's'} in your market.
          </p>
          <div className="intake-duration-grid">
            {INTAKE_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`intake-duration${draft.durationDays === d ? 'is-selected' : ''}`}
                onClick={() =>
                  save({
                    durationDays: d,
                    customStart: undefined,
                    customEnd: undefined,
                    budget: suggestBudget({ ...draft, durationDays: d }),
                  })
                }
              >
                <strong>{d} days</strong>
              </button>
            ))}
          </div>
          <Field label="Custom date range (optional)">
            <div className="row" style={{ gap: 10 }}>
              <input
                className="input"
                type="date"
                value={draft.customStart ?? ''}
                onChange={(e) =>
                  save({
                    customStart: e.target.value || undefined,
                    durationDays: undefined,
                  })
                }
              />
              <input
                className="input"
                type="date"
                value={draft.customEnd ?? ''}
                onChange={(e) =>
                  save({
                    customEnd: e.target.value || undefined,
                    durationDays: undefined,
                  })
                }
              />
            </div>
          </Field>
          <Field label="Budget (₹)">
            <input
              className="input"
              type="number"
              min={0}
              value={draft.budget ?? budgetHint}
              onChange={(e) => save({ budget: Number(e.target.value) || 0 })}
            />
          </Field>
        </section>
      ) : null}

      <footer className="intake-footer">
        {stepIndex > 0 ? (
          <button type="button" className="btn" onClick={() => go(INTAKE_STEPS[stepIndex - 1]!)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {stepIndex < INTAKE_STEPS.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            disabled={!canContinue}
            onClick={() => go(INTAKE_STEPS[stepIndex + 1]!)}
          >
            Continue
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!canContinue} onClick={finish}>
            Review strategy
          </button>
        )}
      </footer>

      <div style={{ marginTop: 16 }}>
        <Link className="btn ghost sm" href={`/app/create/strategy/${draftId}`}>
          Skip to strategy →
        </Link>
      </div>

      {connectTarget ? (
        <ConnectModal
          channel={connectTarget}
          onClose={() => {
            setConnectTarget(null)
            refreshConnections()
          }}
        />
      ) : null}
    </FadeIn>
  )
}

function ConnectModal({
  channel,
  onClose,
}: {
  channel: (typeof INTAKE_CHANNELS)[number]
  onClose: () => void
}) {
  return (
    <div
      className="intake-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${channel.id}`}
    >
      <button
        type="button"
        className="intake-modal__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="intake-modal__panel">
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2 className="type-section">Connect {channel.id}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {channel.meta ? (
          <MetaConnectCard />
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <p className="type-body">
              Finish connecting {channel.id} on the Connections page, then come back — this step
              stays open in your draft.
            </p>
            <Link href="/app/connections" className="btn primary" onClick={onClose}>
              Open Connections
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
