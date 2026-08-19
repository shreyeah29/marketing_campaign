'use client'

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { useParams, useRouter } from 'next/navigation'

import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { LoadingScreen } from '@/components/ui'
import { useToast } from '@/components/kit'
import {
  BrowserDraftBanner,
  CAMPAIGN_PACES,
  DEFAULT_PACE,
  INTAKE_CHANNELS,
  INTAKE_DURATIONS,
  INTAKE_INTEREST_SUGGESTIONS,
  INTAKE_LANGUAGES,
  INTAKE_LOCATIONS,
  INTAKE_OBJECTIVES,
  paceFits,
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

/**
 * How many poster concepts a run may produce.
 *
 * Bounded rather than free-typed: the top of the range is the point where a
 * review queue stops being reviewable, and a number box invites 50 from someone
 * who has not yet seen what one concept looks like.
 */
const POSTER_COUNTS = [1, 2, 3, 5, 10, 20] as const
const VIDEO_COUNTS = [0, 1, 2, 3] as const
const DEFAULT_POSTERS = 5
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

  /**
   * The allowance, in the only unit that crosses: a percentage used.
   *
   * The pace selector is priced as a share of it, so a Heavy push that would not
   * fit in what is left of the month can be refused before it is chosen rather
   * than trimmed afterwards.
   */
  const [allowance, setAllowance] = useState<{ configured: boolean; usedPct: number } | null>(null)

  useEffect(() => {
    api
      .get<{ configured: boolean; usedPct: number }>('/me/ad-allowance')
      .then(setAllowance)
      // A failed read hides the selector rather than guessing: offering shares of
      // an allowance we could not measure is worse than not asking.
      .catch(() => setAllowance({ configured: false, usedPct: 0 }))
  }, [])

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
    if (!draft) return
    if (!ready) {
      toast.push('error', 'Pick an objective and at least one channel first')
      return
    }
    // A pace is always recorded, even when the selector was hidden: the brief and
    // the deliverable counts key off it, and "unset" is not a pace.
    patch({ step: 'duration', pace: draft.pace ?? DEFAULT_PACE })
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

        {/* ── Step 4 · Duration & pace ───────────────────────────────── */}
        <div className="card intake-section" style={{ flex: '1 1 300px', minWidth: 0, margin: 0 }}>
          <div className="intake-section__head">
            <span className="intake-step">STEP 4</span>
            <span className="intake-section__title">Duration &amp; pace</span>
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

          {/* Pace, not a budget.
              A client typing a rupee figure stopped meaning anything once we
              began funding the media — the allowance governs what a flight can
              spend. The generator still needs to know how hard to push, so the
              question is asked as a share of the allowance, which is the one
              allowance unit a tenant is allowed to see.

              Hidden entirely when no allocation is configured: a picker offering
              "35% of your allowance" is noise without an allowance. */}
          {allowance?.configured ? (
            <>
              <div className="field-label" style={{ margin: '16px 0 7px' }}>
                HOW HARD SHOULD THIS PUSH?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CAMPAIGN_PACES.map((pc) => {
                  const fits = paceFits(pc.sharePct, allowance.usedPct)
                  const chosen = (draft.pace ?? DEFAULT_PACE) === pc.id
                  return (
                    <button
                      key={pc.id}
                      type="button"
                      className="pace-option"
                      aria-pressed={chosen}
                      disabled={!fits}
                      onClick={() => patch({ pace: pc.id })}
                      title={
                        fits
                          ? `${pc.label} — about ${String(pc.sharePct)}% of this month's allowance`
                          : `${pc.label} needs about ${String(pc.sharePct)}% of the allowance and only ${String(Math.max(0, 100 - allowance.usedPct))}% is left this month`
                      }
                    >
                      <span className="pace-option__head">
                        <span className="pace-option__label">{pc.label}</span>
                        <span className="pace-option__share">~{pc.sharePct}% of allowance</span>
                      </span>
                      <span className="pace-option__blurb">
                        {fits
                          ? pc.blurb
                          : `Not enough allowance left this month — ${String(Math.max(0, 100 - allowance.usedPct))}% remains. Standard fits.`}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
                {String(Math.max(0, 100 - allowance.usedPct))}% of this month&apos;s allowance is
                still unused. Ads are paid for by us, never by you.
              </p>
            </>
          ) : null}

          {/* ── Step 5 · How much ─────────────────────────────────────
              The count was a constant. `postCount` defaulted to 5 at draft
              creation and no screen ever offered it, so every plan arrived at
              ten assets and the number read as a rule of the product rather than
              a choice — which is exactly how it was reported. It is a decision,
              and it belongs to the person paying for the run. */}
          <div className="field-label" style={{ marginTop: 20 }}>
            HOW MANY POSTER CONCEPTS
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {POSTER_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={(draft.postCount ?? DEFAULT_POSTERS) === n}
                onClick={() => patch({ postCount: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Each concept is one image with its own caption and hashtags, reused across the channels
            you picked — not one per channel. {String(draft.postCount ?? DEFAULT_POSTERS)} concepts
            means {String((draft.postCount ?? DEFAULT_POSTERS) * 2)} assets to review.
          </p>

          {/* The words themselves, typed rather than inferred.

              The image model is forbidden from drawing text — it cannot spell,
              and a mangled offer reaching a customer is worse than a plain
              photograph — so whatever goes here is typeset onto the finished
              artwork afterwards, at full size, spelled exactly as written. */}
          <div className="field-label" style={{ marginTop: 20 }}>
            HEADLINE ON THE POSTER <span className="type-caption">— optional</span>
          </div>
          <input
            className="input"
            value={draft.posterText ?? ''}
            maxLength={70}
            placeholder="1+1 this Rakshabandhan"
            onChange={(e) => patch({ posterText: e.target.value })}
          />
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            {draft.posterText?.trim()
              ? `Used as the headline on every poster in this run. ${String(70 - draft.posterText.trim().length)} characters left — the offer, the conditions and the small print are still written for you.`
              : 'Leave this empty and the whole poster is written for you — headline, offer, conditions, dates and the small print — from the brief and your campaign. Fill it in only to fix the headline yourself.'}
          </p>

          <div className="field-label" style={{ marginTop: 16 }}>
            VIDEO CONCEPTS
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {VIDEO_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={(draft.videoCount ?? 0) === n}
                onClick={() => patch({ videoCount: n, wantVideos: n > 0 })}
              >
                {n === 0 ? 'None' : n}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Video takes minutes per clip rather than seconds, so it starts at none and is asked for
            rather than assumed.
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
