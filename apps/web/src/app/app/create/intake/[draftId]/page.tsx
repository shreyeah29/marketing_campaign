'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { LoadingScreen } from '@/components/ui'
import { useToast } from '@/components/kit'
import {
  BrowserDraftBanner,
  INTAKE_CHANNELS,
  INTAKE_DURATIONS,
  INTAKE_INTEREST_SUGGESTIONS,
  INTAKE_LANGUAGES,
  INTAKE_LOCATIONS,
  INTAKE_OBJECTIVES,
  readDraft,
  upsertDraft,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Guided intake — step 2 of six.
 *
 * Four questions, one screen. They used to be four screens, and before that
 * there were two competing wizards asking overlapping questions in different
 * orders depending on how you arrived. One screen ends both problems: you can
 * see every decision at once, which is what makes it feel like a form you can
 * finish rather than a corridor you are walking down.
 *
 * Each objective prints its consequence. Choosing "Awareness" and discovering
 * afterwards that spend was weighted to retargeting is the kind of surprise
 * that costs real money, so the trade is stated on the card.
 *
 * Everything writes straight to the browser draft on change — there is no save
 * button because there is nothing to lose by leaving.
 */

const STEPS = ['Brief', 'Intake', 'Plan', 'Generate', 'Review', 'Publish'] as const
const GENDERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'female', label: 'F' },
  { id: 'male', label: 'M' },
]

/** Toggle a value in a list, preserving order of first selection. */
function toggle(list: string[] | undefined, value: string): string[] {
  const current = list ?? []
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}

export default function GuidedIntakePage() {
  const params = useParams<{ draftId: string }>()
  const router = useRouter()
  const toast = useToast()
  const draftId = params.draftId

  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const d = readDraft(draftId)
    if (!d) {
      setMissing(true)
      return
    }
    setDraft(d)
  }, [draftId])

  /**
   * Every edit persists immediately; the draft is the only state that matters.
   * `upsertDraft` does the merge and the timestamp, and returns the stored
   * record — so what is rendered is exactly what was written, not a local copy
   * that could drift from it.
   */
  function patch(next: Partial<Omit<CreateDraft, 'id'>>) {
    setDraft(upsertDraft(draftId, next))
  }

  if (missing) {
    return (
      <FadeIn style={{ maxWidth: 560 }}>
        <h1 className="brief-title">That draft is gone</h1>
        <p className="brief-sub">
          Drafts live in this browser only, so clearing site data or switching machines loses them.
          Start a new brief and it will be saved as you type.
        </p>
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: 20 }}
          onClick={() => router.push('/app/create')}
        >
          New brief
          <Icon name="arrow-right" size={15} />
        </button>
      </FadeIn>
    )
  }

  if (!draft) return <LoadingScreen />

  const objective = INTAKE_OBJECTIVES.find((o) => o.id === draft.objective)
  const channels = draft.channels ?? []
  const locations = draft.audienceLocations ?? []
  const interests = draft.audienceInterests ?? []
  const languages = draft.audienceLanguages ?? []
  const ready = Boolean(draft.objective) && channels.length > 0

  /** Suggestions are the catalogue minus what is already chosen. */
  const locationOffers = INTAKE_LOCATIONS.filter((l) => !locations.includes(l)).slice(0, 4)
  const interestOffers = INTAKE_INTEREST_SUGGESTIONS.filter((i) => !interests.includes(i)).slice(
    0,
    4,
  )

  function chooseObjective(id: string) {
    const next = INTAKE_OBJECTIVES.find((o) => o.id === id)
    // Picking an objective pre-marks its recommended channels, but only while
    // nothing has been chosen by hand — silently rewriting a considered choice
    // is worse than not helping at all.
    patch({
      objective: id,
      ...(channels.length === 0 && next ? { channels: [...next.recommendChannels] } : {}),
    })
  }

  function buildPlan() {
    if (!ready) {
      toast.push('error', 'Pick an objective and at least one channel first')
      return
    }
    patch({ step: 'duration' })
    router.push(`/app/create/strategy/${draftId}`)
  }

  return (
    <FadeIn style={{ maxWidth: 1180 }}>
      <div className="step-rail">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className="step-chip"
            data-state={i === 0 ? 'done' : i === 1 ? 'current' : 'todo'}
          >
            {i + 1} {label.toUpperCase()}
            {i === 0 ? ' ✓' : ''}
          </span>
        ))}
      </div>

      <h1 className="brief-title" style={{ maxWidth: 'none' }}>
        Guided intake
      </h1>
      <p className="brief-sub" style={{ maxWidth: '62ch', marginBottom: 26 }}>
        Four questions. Each one changes what the generator produces, so the consequence is spelled
        out next to every choice.
      </p>

      <BrowserDraftBanner />

      {/* ── Step 1 · Objective ─────────────────────────────────────────── */}
      <div className="card intake-section">
        <div className="intake-section__head">
          <span className="intake-step">STEP 1</span>
          <span className="intake-section__title">Objective</span>
          <span className="intake-section__note">
            {objective ? `${objective.label} selected` : 'Nothing selected yet'}
          </span>
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 9 }}
        >
          {INTAKE_OBJECTIVES.map((o) => (
            <button
              key={o.id}
              type="button"
              className="objective-card"
              aria-pressed={draft.objective === o.id}
              onClick={() => chooseObjective(o.id)}
            >
              <span className="objective-card__label">
                <Icon name={o.icon} size={16} className="ico" />
                {o.label}
              </span>
              <span className="objective-card__why">{o.consequence}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 2 · Channels ──────────────────────────────────────────── */}
      <div className="card intake-section">
        <div className="intake-section__head" style={{ marginBottom: 6 }}>
          <span className="intake-step">STEP 2</span>
          <span className="intake-section__title">Channels</span>
          <span className="intake-section__note">
            {objective
              ? `Recommended for ${objective.label}: ${objective.recommendChannels.join(', ')}`
              : 'Pick an objective and the recommended set is marked for you'}
          </span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {INTAKE_CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={channels.includes(c.id)}
              onClick={() => patch({ channels: toggle(channels, c.id) })}
            >
              {c.id}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        {/* ── Step 3 · Audience ────────────────────────────────────────── */}
        <div className="card intake-section" style={{ flex: '2 1 420px', minWidth: 0, margin: 0 }}>
          <div className="intake-section__head">
            <span className="intake-step">STEP 3</span>
            <span className="intake-section__title">Audience</span>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}
          >
            <div>
              <div className="field-label">AGE</div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="mini-input"
                  type="number"
                  min={13}
                  max={99}
                  aria-label="Minimum age"
                  value={draft.audienceAgeMin ?? 18}
                  onChange={(e) => patch({ audienceAgeMin: Number(e.target.value) })}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  className="mini-input"
                  type="number"
                  min={13}
                  max={99}
                  aria-label="Maximum age"
                  value={draft.audienceAgeMax ?? 65}
                  onChange={(e) => patch({ audienceAgeMax: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <div className="field-label">GENDER</div>
              <div className="row" style={{ gap: 5 }}>
                {GENDERS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="chip sm"
                    aria-pressed={(draft.audienceGender ?? 'all') === g.id}
                    onClick={() => patch({ audienceGender: g.id })}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="field-label">LANGUAGES</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
                {INTAKE_LANGUAGES.slice(0, 4).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="chip sm"
                    aria-pressed={languages.includes(l)}
                    onClick={() => patch({ audienceLanguages: toggle(languages, l) })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="field-label">LOCATIONS</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {locations.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip sm"
                  aria-pressed
                  onClick={() => patch({ audienceLocations: toggle(locations, l) })}
                  title={`Remove ${l}`}
                >
                  {l} ×
                </button>
              ))}
              {locationOffers.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip sm"
                  data-suggest=""
                  onClick={() => patch({ audienceLocations: toggle(locations, l) })}
                >
                  + {l}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="field-label">INTERESTS</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {interests.map((i) => (
                <button
                  key={i}
                  type="button"
                  className="chip sm"
                  aria-pressed
                  onClick={() => patch({ audienceInterests: toggle(interests, i) })}
                  title={`Remove ${i}`}
                >
                  {i} ×
                </button>
              ))}
              {interestOffers.map((i) => (
                <button
                  key={i}
                  type="button"
                  className="chip sm"
                  data-suggest=""
                  onClick={() => patch({ audienceInterests: toggle(interests, i) })}
                >
                  + {i}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Step 4 · Duration & budget ───────────────────────────────── */}
        <div className="card intake-section" style={{ flex: '1 1 300px', minWidth: 0, margin: 0 }}>
          <div className="intake-section__head">
            <span className="intake-step">STEP 4</span>
            <span className="intake-section__title">Duration &amp; budget</span>
          </div>

          <div className="field-label">RUN FOR</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {INTAKE_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={(draft.durationDays ?? 15) === d}
                onClick={() => patch({ durationDays: d })}
              >
                {d} days
              </button>
            ))}
          </div>

          <div className="field-label" style={{ margin: '16px 0 7px' }}>
            TOTAL BUDGET
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>₹</span>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              aria-label="Total budget in rupees"
              placeholder="25000"
              value={draft.budget ?? ''}
              onChange={(e) =>
                patch({ budget: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              style={{ flex: 1 }}
            />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Split 60 / 40 between prospecting and retargeting.
          </p>

          <div className="row" style={{ flexWrap: 'wrap', gap: 9, marginTop: 20 }}>
            <button type="button" className="btn primary" onClick={buildPlan} disabled={!ready}>
              Build the plan
              <Icon name="arrow-right" size={15} />
            </button>
            <button type="button" className="btn" onClick={() => router.push('/app/create')}>
              Back
            </button>
          </div>
          {!ready ? (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
              Pick an objective and at least one channel to continue.
            </p>
          ) : null}
        </div>
      </div>
    </FadeIn>
  )
}
