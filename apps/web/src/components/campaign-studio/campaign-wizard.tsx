'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { PlatformIcon } from '@/components/platform-icon'
import { BrowserDraftBanner } from './draft'
import { buildBriefFromDraft, readDraft, upsertDraft } from './draft'
import type { CampaignPlan, CreateDraft } from './types'

export const WIZARD_STEPS = ['platforms', 'deliverables', 'audience'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const PLATFORMS = [
  { id: 'Instagram', label: 'Instagram' },
  { id: 'Facebook', label: 'Facebook' },
  { id: 'LinkedIn', label: 'LinkedIn' },
  { id: 'X', label: 'X' },
  { id: 'Threads', label: 'Threads' },
  { id: 'YouTube', label: 'YouTube' },
] as const

const POST_COUNTS = [1, 2, 3, 5, 10, 20] as const
const VIDEO_COUNTS = [0, 1, 2, 3] as const
const AD_PLATFORMS = ['Facebook', 'Instagram', 'Google', 'LinkedIn'] as const

const LOOKS = [
  'Clean & clinical',
  'Warm & lifestyle',
  'Bold & colourful',
  'Minimal luxury',
  'Playful & youthful',
] as const

/**
 * Steps after the prompt: platforms → deliverables → audience → plan → strategy.
 */
export function CampaignWizard({ draftId, step }: { draftId: string; step: WizardStep }) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState<CreateDraft | null>(() => readDraft(draftId))
  const [busy, setBusy] = useState(false)

  const stepIndex = WIZARD_STEPS.indexOf(step)
  const displayStep = stepIndex + 2

  if (!draft) {
    return (
      <div className="wiz">
        <p className="type-secondary">Draft not found in this browser.</p>
        <button type="button" className="btn" onClick={() => router.push('/app/create')}>
          Back to Create
        </button>
      </div>
    )
  }

  function persist(patch: Partial<CreateDraft>) {
    const next = upsertDraft(draftId, patch)
    setDraft(next)
    return next
  }

  function go(next: WizardStep | 'strategy') {
    if (next === 'strategy') {
      void finishPlan()
      return
    }
    persist({ step: next })
    router.push(`/app/create/wizard/${draftId}?step=${next}`)
  }

  async function finishPlan() {
    setBusy(true)
    try {
      const current = readDraft(draftId) ?? draft
      if (!current) {
        toast.push('error', 'Draft not found')
        setBusy(false)
        return
      }
      const brief = buildBriefFromDraft(current)
      const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      upsertDraft(draftId, { brief, plan, step: 'strategy' })
      router.push(`/app/create/strategy/${draftId}`)
    } catch (e) {
      toast.push(
        'error',
        e instanceof ApiError ? e.message : 'Could not build the strategy overview',
      )
      setBusy(false)
    }
  }

  const channels = draft.channels ?? []

  return (
    <div className="wiz">
      <BrowserDraftBanner />
      <div className="wiz__progress" aria-label="Wizard progress">
        {['Brief', 'Platforms', 'Deliverables', 'Audience', 'Overview'].map((label, i) => {
          const n = i + 1
          const active = n === displayStep
          const done = n < displayStep
          return (
            <div
              key={label}
              className={`wiz__pip${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
            >
              <span className="wiz__pip-n strat-mono">{String(n).padStart(2, '0')}</span>
              <span className="wiz__pip-label">{label}</span>
            </div>
          )
        })}
      </div>

      <p className="type-caption" style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
        Your brief
      </p>
      <p className="wiz__brief-echo type-body">{draft.prompt}</p>

      {step === 'platforms' ? (
        <PlatformsStep
          channels={channels}
          onChannels={(v) => persist({ channels: v })}
          onBack={() => router.push('/app/create')}
          onNext={() => {
            if (!channels.length) {
              toast.push('error', 'Pick at least one platform')
              return
            }
            go('deliverables')
          }}
        />
      ) : null}

      {step === 'deliverables' ? (
        <DeliverablesStep
          draft={draft}
          onPatch={persist}
          onBack={() => go('platforms')}
          onNext={() => go('audience')}
        />
      ) : null}

      {step === 'audience' ? (
        <AudienceStep
          audience={draft.audience ?? ''}
          lookFeel={draft.lookFeel ?? ''}
          busy={busy}
          onAudience={(v) => persist({ audience: v })}
          onLook={(v) => persist({ lookFeel: v })}
          onBack={() => go('deliverables')}
          onNext={() => go('strategy')}
        />
      ) : null}
    </div>
  )
}

function PlatformsStep({
  channels,
  onChannels,
  onBack,
  onNext,
}: {
  channels: string[]
  onChannels: (v: string[]) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <section className="wiz__panel">
      <h1 className="wiz__title">Where should it publish?</h1>
      <p className="wiz__sub type-secondary">
        One poster is reused across these platforms. Copy is adapted per channel — not regenerated
        as separate images.
      </p>

      <p className="type-label" style={{ marginTop: 20 }}>
        Platforms
      </p>
      <div className="wiz__chip-grid">
        {PLATFORMS.map((p) => {
          const on = channels.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              className={`wiz__chip${on ? ' is-on' : ''}`}
              onClick={() =>
                onChannels(on ? channels.filter((x) => x !== p.id) : [...channels, p.id])
              }
              aria-pressed={on}
            >
              <PlatformIcon platform={p.id.toUpperCase()} size={18} />
              {p.label}
            </button>
          )
        })}
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </section>
  )
}

function DeliverablesStep({
  draft,
  onPatch,
  onBack,
  onNext,
}: {
  draft: CreateDraft
  onPatch: (p: Partial<CreateDraft>) => void
  onBack: () => void
  onNext: () => void
}) {
  const postCount = draft.postCount ?? 5
  const wantImages = draft.wantPosters !== false
  const videoCount = draft.videoCount ?? 0
  const adPlatforms = draft.adPlatforms ?? []
  const wantEmails = Boolean(draft.wantEmails)
  const wantLanding = Boolean(draft.wantLanding)

  function toggleAd(id: string) {
    onPatch({
      adPlatforms: adPlatforms.includes(id)
        ? adPlatforms.filter((x) => x !== id)
        : [...adPlatforms, id],
    })
  }

  return (
    <section className="wiz__panel">
      <h1 className="wiz__title">What should we generate?</h1>
      <p className="wiz__sub type-secondary">
        Only what you select is produced. {postCount} posts means {postCount} unique creatives —
        reused across platforms — not {postCount}× every channel.
      </p>

      <p className="type-label" style={{ marginTop: 20 }}>
        How many social posts?
      </p>
      <div className="wiz__chip-grid wiz__chip-grid--compact">
        {POST_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`wiz__chip${postCount === n ? ' is-on' : ''}`}
            onClick={() => onPatch({ postCount: n })}
          >
            <strong>{n}</strong>
          </button>
        ))}
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Generate images?
      </p>
      <div className="wiz__chip-grid wiz__chip-grid--compact">
        <button
          type="button"
          className={`wiz__chip${wantImages ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantPosters: true, wantVideos: videoCount > 0 })}
        >
          Yes — {postCount} master images
        </button>
        <button
          type="button"
          className={`wiz__chip${!wantImages ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantPosters: false })}
        >
          No
        </button>
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Generate videos?
      </p>
      <div className="wiz__chip-grid wiz__chip-grid--compact">
        {VIDEO_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`wiz__chip${videoCount === n ? ' is-on' : ''}`}
            onClick={() => onPatch({ videoCount: n, wantVideos: n > 0 })}
          >
            <strong>{n}</strong>
          </button>
        ))}
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Generate advertisements?
      </p>
      <div className="wiz__chip-grid">
        {AD_PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            className={`wiz__chip${adPlatforms.includes(p) ? ' is-on' : ''}`}
            onClick={() => toggleAd(p)}
            aria-pressed={adPlatforms.includes(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Generate emails?
      </p>
      <div className="wiz__chip-grid wiz__chip-grid--compact">
        <button
          type="button"
          className={`wiz__chip${wantEmails ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantEmails: true })}
        >
          Yes
        </button>
        <button
          type="button"
          className={`wiz__chip${!wantEmails ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantEmails: false })}
        >
          No
        </button>
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Generate landing page?
      </p>
      <div className="wiz__chip-grid wiz__chip-grid--compact">
        <button
          type="button"
          className={`wiz__chip${wantLanding ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantLanding: true })}
        >
          Yes
        </button>
        <button
          type="button"
          className={`wiz__chip${!wantLanding ? ' is-on' : ''}`}
          onClick={() => onPatch({ wantLanding: false })}
        >
          No
        </button>
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </section>
  )
}

function AudienceStep({
  audience,
  lookFeel,
  busy,
  onAudience,
  onLook,
  onBack,
  onNext,
}: {
  audience: string
  lookFeel: string
  busy: boolean
  onAudience: (v: string) => void
  onLook: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const can = audience.trim().length >= 3

  return (
    <section className="wiz__panel">
      <h1 className="wiz__title">Who is it for, and how should it look?</h1>
      <p className="wiz__sub type-secondary">
        A few details so the strategy and creatives match your product and audience.
      </p>

      <label className="type-label" htmlFor="wiz-aud" style={{ marginTop: 16 }}>
        Target audience
      </label>
      <textarea
        id="wiz-aud"
        className="input"
        rows={3}
        value={audience}
        onChange={(e) => onAudience(e.target.value)}
        placeholder="e.g. Women 25–40 in Mumbai and Delhi who care about clean skincare"
      />

      <p className="type-label" style={{ marginTop: 20 }}>
        Look &amp; feel
      </p>
      <div className="wiz__chip-grid">
        {LOOKS.map((look) => (
          <button
            key={look}
            type="button"
            className={`wiz__chip${lookFeel === look ? ' is-on' : ''}`}
            onClick={() => onLook(look)}
          >
            {look}
          </button>
        ))}
      </div>
      <input
        className="input"
        style={{ marginTop: 10 }}
        value={lookFeel}
        onChange={(e) => onLook(e.target.value)}
        placeholder="Or describe the look in your own words"
      />

      <WizardNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={busy ? 'Building overview…' : 'See strategy overview'}
        nextDisabled={!can || busy}
        nextBusy={busy}
      />
    </section>
  )
}

function WizardNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextBusy,
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  nextBusy?: boolean
}) {
  return (
    <div className="wiz__footer" style={{ marginTop: 28 }}>
      <button type="button" className="btn ghost" onClick={onBack} disabled={nextBusy}>
        <Icon name="arrow-left" size={14} /> Back
      </button>
      <button type="button" className="btn primary" disabled={nextDisabled} onClick={onNext}>
        {nextBusy ? <Spinner /> : null}
        {nextLabel}
      </button>
    </div>
  )
}

export function normalizeWizardStep(raw: string | null | undefined): WizardStep {
  if (raw === 'media') return 'deliverables'
  if (raw && (WIZARD_STEPS as readonly string[]).includes(raw)) return raw as WizardStep
  return 'platforms'
}

/**
 * Where a draft resumes.
 *
 * Guided intake replaced this wizard: one screen asking objective, channels,
 * audience and duration, instead of three asking platforms, deliverables and
 * audience. Deliverables are no longer asked for at all — the plan proposes
 * them and you approve the proposal, which is the whole point of the plan step.
 *
 * The wizard route stays reachable so a part-finished draft from before the
 * change still opens, but nothing sends a draft there any more.
 */
export function wizardPathForDraft(d: CreateDraft): string {
  if (d.plan) return `/app/create/strategy/${d.id}`
  return `/app/create/intake/${d.id}`
}
