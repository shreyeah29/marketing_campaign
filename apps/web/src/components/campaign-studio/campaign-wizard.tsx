'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { PlatformIcon } from '@/components/platform-icon'
import { BrowserDraftBanner } from './draft'
import {
  buildBriefFromDraft,
  readDraft,
  upsertDraft,
} from './draft'
import type { CampaignPlan, CreateDraft } from './types'

export const WIZARD_STEPS = ['platforms', 'media', 'audience'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const PLATFORMS = [
  { id: 'Instagram', label: 'Instagram' },
  { id: 'Facebook', label: 'Facebook' },
  { id: 'LinkedIn', label: 'LinkedIn' },
  { id: 'Email', label: 'Email' },
  { id: 'WhatsApp', label: 'WhatsApp' },
  { id: 'YouTube', label: 'YouTube' },
] as const

const FORMATS = [
  { id: 'posts', label: 'Posts', hint: 'Feed content' },
  { id: 'stories', label: 'Stories', hint: 'Ephemeral' },
  { id: 'reels', label: 'Reels / Shorts', hint: 'Short video' },
  { id: 'ads', label: 'Ads', hint: 'Paid placements' },
] as const

const LOOKS = [
  'Clean & clinical',
  'Warm & lifestyle',
  'Bold & colourful',
  'Minimal luxury',
  'Playful & youthful',
] as const

/**
 * Steps 2–4 after the prompt: platforms → AI media → audience/look → plan API → strategy.
 */
export function CampaignWizard({ draftId, step }: { draftId: string; step: WizardStep }) {
  const router = useRouter()
  const toast = useToast()
  const [draft, setDraft] = useState<CreateDraft | null>(() => readDraft(draftId))
  const [busy, setBusy] = useState(false)

  const stepIndex = WIZARD_STEPS.indexOf(step)
  const displayStep = stepIndex + 2 // prompt was step 1

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
      toast.push('error', e instanceof ApiError ? e.message : 'Could not build the strategy overview')
      setBusy(false)
    }
  }

  const channels = draft.channels ?? []
  const formats = draft.formats ?? ['posts']

  return (
    <div className="wiz">
      <BrowserDraftBanner />
      <div className="wiz__progress" aria-label="Wizard progress">
        {['Brief', 'Platforms', 'Creatives', 'Audience', 'Overview'].map((label, i) => {
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
          formats={formats}
          onChannels={(v) => persist({ channels: v })}
          onFormats={(v) => persist({ formats: v })}
          onBack={() => router.push('/app/create')}
          onNext={() => {
            if (!channels.length) {
              toast.push('error', 'Pick at least one platform')
              return
            }
            if (!formats.length) {
              toast.push('error', 'Pick at least one format')
              return
            }
            go('media')
          }}
        />
      ) : null}

      {step === 'media' ? (
        <MediaStep
          wantPosters={draft.wantPosters !== false}
          wantVideos={Boolean(draft.wantVideos)}
          onPosters={(v) => persist({ wantPosters: v })}
          onVideos={(v) => persist({ wantVideos: v })}
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
          onBack={() => go('media')}
          onNext={() => go('strategy')}
        />
      ) : null}
    </div>
  )
}

function PlatformsStep({
  channels,
  formats,
  onChannels,
  onFormats,
  onBack,
  onNext,
}: {
  channels: string[]
  formats: string[]
  onChannels: (v: string[]) => void
  onFormats: (v: string[]) => void
  onBack: () => void
  onNext: () => void
}) {
  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  return (
    <section className="wiz__panel">
      <h1 className="wiz__title">Where should it publish?</h1>
      <p className="wiz__sub type-secondary">
        Choose platforms and formats. You will approve creatives before anything goes live.
      </p>

      <p className="type-label" style={{ marginTop: 20 }}>
        Platforms
      </p>
      <div className="wiz__chip-grid">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`wiz__chip${channels.includes(p.id) ? ' is-on' : ''}`}
            onClick={() => toggle(channels, p.id, onChannels)}
            aria-pressed={channels.includes(p.id)}
          >
            <PlatformIcon platform={p.id.toUpperCase()} size={18} />
            {p.label}
          </button>
        ))}
      </div>

      <p className="type-label" style={{ marginTop: 24 }}>
        Formats
      </p>
      <div className="wiz__chip-grid">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`wiz__chip${formats.includes(f.id) ? ' is-on' : ''}`}
            onClick={() => toggle(formats, f.id, onFormats)}
            aria-pressed={formats.includes(f.id)}
          >
            <strong>{f.label}</strong>
            <span className="type-caption">{f.hint}</span>
          </button>
        ))}
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
    </section>
  )
}

function MediaStep({
  wantPosters,
  wantVideos,
  onPosters,
  onVideos,
  onBack,
  onNext,
}: {
  wantPosters: boolean
  wantVideos: boolean
  onPosters: (v: boolean) => void
  onVideos: (v: boolean) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <section className="wiz__panel">
      <h1 className="wiz__title">AI posters &amp; videos?</h1>
      <p className="wiz__sub type-secondary">
        If yes, image and video concepts are generated with the creative pipeline (Runway) after you
        approve the strategy — then you review before posting.
      </p>

      <div className="wiz__media-grid">
        <button
          type="button"
          className={`wiz__media-card${wantPosters ? ' is-on' : ''}`}
          onClick={() => onPosters(!wantPosters)}
          aria-pressed={wantPosters}
        >
          <Icon name="image" size={22} />
          <strong>AI posters / stills</strong>
          <span className="type-caption">
            {wantPosters ? 'Yes — generate image concepts' : 'No — skip image generation'}
          </span>
        </button>
        <button
          type="button"
          className={`wiz__media-card${wantVideos ? ' is-on' : ''}`}
          onClick={() => onVideos(!wantVideos)}
          aria-pressed={wantVideos}
        >
          <Icon name="video" size={22} />
          <strong>AI videos</strong>
          <span className="type-caption">
            {wantVideos ? 'Yes — generate video concepts' : 'No — skip video generation'}
          </span>
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
        A few details so the strategy overview matches your product and audience.
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
      <button
        type="button"
        className="btn primary"
        disabled={nextDisabled}
        onClick={onNext}
      >
        {nextBusy ? <Spinner /> : null}
        {nextLabel}
      </button>
    </div>
  )
}

export function normalizeWizardStep(raw: string | null | undefined): WizardStep {
  if (raw && (WIZARD_STEPS as readonly string[]).includes(raw)) return raw as WizardStep
  return 'platforms'
}

/** Resume helper for drafts list. */
export function wizardPathForDraft(d: CreateDraft): string {
  if (d.plan) return `/app/create/strategy/${d.id}`
  if (!d.channels?.length) return `/app/create/wizard/${d.id}?step=platforms`
  return `/app/create/wizard/${d.id}?step=${normalizeWizardStep(d.step)}`
}
