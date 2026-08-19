'use client'

import { useEffect, useRef, useState } from 'react'

import { ApiError, api, apiUpload } from '@/lib/api'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/kit'

import { BriefCoach, parseStoredCoach, type CoachResult } from './brief-coach'
import { DirectionShelf, type Direction } from './direction-shelf'
import { StyleGallery } from './style-gallery'
import type { Campaign, CreateDraft } from './types'

/**
 * Studio brief — step 1 of six.
 *
 * One question, one field. The suggestion rows below it are whole sentences
 * rather than tags: clicking one fills the field with something editable, so
 * the intake that follows is never fed two words and left to guess. That is the
 * same reason the field has no toolbar — a brief is prose, and chrome around it
 * invites people to fill in a form instead of writing.
 *
 * The step rail is present on every screen of this flow. Knowing four decisions
 * remain before anything is generated is what stops the first screen feeling
 * like a commitment.
 */

const STEPS = ['Brief', 'Intake', 'Plan', 'Generate', 'Review', 'Publish'] as const

interface DesignTemplate {
  slug: string
  name: string
}

/** Where a saved draft actually stopped, in the language of the step rail. */
function draftStop(d: CreateDraft): { step: number; label: string } {
  if (d.plan) return { step: 3, label: 'plan awaiting approval' }
  if (d.channels?.length) return { step: 2, label: `intake · ${d.step ?? 'platforms'}` }
  return { step: 1, label: 'brief' }
}

export function PromptView({
  prompt,
  setPrompt,
  planning,
  onSubmit,
  recent,
  onOpen,
  drafts,
  onOpenDraft,
  onGuidedIntake,
  restoredCoach = null,
  onCoachResult,
  pictureKinds,
  onPictureKinds,
  reference,
  onReference,
  productImage,
  onProductImage,
  styleTemplateId,
  onStyleTemplate,
  directionId,
  onDirection,
}: {
  prompt: string
  setPrompt: (v: string) => void
  planning: boolean
  onSubmit: () => void
  recent: Campaign[]
  onOpen: (id: string) => void
  drafts: CreateDraft[]
  onOpenDraft: (id: string) => void
  onGuidedIntake: () => void
  /** Coaching restored with the brief, so returning does not re-run the model. */
  restoredCoach?: unknown
  onCoachResult?: ((result: CoachResult | null) => void) | undefined
  pictureKinds?: { photography: boolean; posters: boolean } | undefined
  onPictureKinds?: ((next: { photography: boolean; posters: boolean }) => void) | undefined
  /** A stored URL for the poster whose look this campaign should follow. */
  reference?: string | null
  onReference?: ((url: string | null) => void) | undefined
  /**
   * A photograph of the thing being advertised.
   *
   * The opposite of `reference`: that one's look is borrowed and its content
   * discarded, this one's content is the point — their own product, kept
   * faithful and put somewhere new.
   */
  productImage?: string | null
  onProductImage?: ((url: string | null) => void) | undefined
  /** A saved look from the gallery, when one is chosen. */
  styleTemplateId?: string | null
  onStyleTemplate?: ((id: string | null) => void) | undefined
  /** The chosen creative direction, and picking one. */
  directionId?: string | null
  onDirection?: ((direction: Direction) => void) | undefined
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Photography is on by default and posters are opt-in.
   *
   * Defaults matter here: a poster costs a designed generation and needs words
   * to put on it, so it is asked for rather than assumed. At least one must
   * stay on — unticking both would mean a campaign that generates no pictures,
   * which is never what the click meant.
   */
  const wantPhotos = pictureKinds?.photography !== false
  const wantDesigns = pictureKinds?.posters === true
  function setKinds(photos: boolean, designs: boolean) {
    if (!photos && !designs) return
    onPictureKinds?.({ photography: photos, posters: designs })
  }

  const toast = useToast()
  const refRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  /**
   * Uploaded through our own endpoint, not linked from wherever it came from.
   *
   * `/uploads` re-encodes, strips EXIF, caps the dimensions and stores the
   * result in our bucket — and the generation endpoint only accepts a reference
   * on that host, because the server fetches it. A pasted URL would make the
   * request a forwarder.
   */
  async function uploadReference(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiUpload<{ url: string }>('/uploads', form)
      onReference?.(res.url)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'That image could not be uploaded')
    } finally {
      setUploading(false)
    }
  }
  const productRef = useRef<HTMLInputElement>(null)
  const [uploadingProduct, setUploadingProduct] = useState(false)

  /** Same route as the style reference, and the same reason: see above. */
  async function uploadProduct(file: File) {
    setUploadingProduct(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiUpload<{ url: string }>('/uploads', form)
      onProductImage?.(res.url)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'That image could not be uploaded')
    } finally {
      setUploadingProduct(false)
    }
  }
  const [templates, setTemplates] = useState<DesignTemplate[]>([])

  // The coach is a copywriter-class call per analyse, so it only exists for a
  // workspace entitled to one. Without the feature the field is exactly as it
  // was — no placeholder, no upsell.
  // No feature check for the coach. It reads what is being typed on this screen
  // and belongs to the screen, so every client has it — the endpoint is ungated
  // for the same reason. Hiding it per plan made a whole section of the page
  // exist for some workspaces and not others, which reads as a bug rather than
  // as an upsell.

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${String(Math.min(320, Math.max(140, el.scrollHeight)))}px`
  }, [prompt])

  /**
   * Design templates, not the prompt library.
   *
   * `/prompts` sits behind the `ai.knowledge_base` feature and 403s for an
   * organisation without it, which would leave this panel permanently empty.
   * The built-in layouts are always available and are what "reuse a template"
   * means on the poster path anyway.
   */
  useEffect(() => {
    api
      .get<{ data: DesignTemplate[] }>('/design-templates')
      .then((r) => setTemplates(r.data ?? []))
      .catch(() => setTemplates([]))
  }, [])

  /**
   * Which three directions the AI put first for this brief.
   *
   * Asked for once the brief is long enough to say anything, and re-asked only
   * when it settles — a request per keystroke would bill for a model call on
   * every letter. The endpoint never fails: with no LLM it answers from
   * keywords, so this state is either empty or useful, never an error.
   */
  const [recommended, setRecommended] = useState<string[]>([])
  const briefForRecs = prompt.trim()
  useEffect(() => {
    if (briefForRecs.length < 12) {
      setRecommended([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      api
        .post<{ picks: { id: string; reason: string }[] }>('/ai/recommend-directions', {
          brief: briefForRecs,
        })
        .then((r) => {
          if (!cancelled) setRecommended((r.picks ?? []).map((p) => p.id))
        })
        .catch(() => undefined)
    }, 900)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [briefForRecs])

  function applySentence(sentence: string) {
    setPrompt(sentence)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  return (
    <FadeIn className="today-layout">
      <div className="today-main">
        <div className="step-rail">
          {STEPS.map((label, i) => (
            <span key={label} className="step-chip" data-state={i === 0 ? 'current' : 'todo'}>
              {i + 1} {label.toUpperCase()}
            </span>
          ))}
        </div>

        <h1 className="brief-title">What are we building?</h1>
        <p className="brief-sub">
          Describe the campaign in plain language, or start from a suggestion. Next comes objective,
          channels, audience and duration — then the plan for you to approve before anything is
          generated.
        </p>

        <textarea
          ref={taRef}
          className="brief-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Run a festive Republic Day campaign for the cafe — brunch offers, high energy, Instagram first…"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit()
          }}
          aria-label="Campaign brief"
          autoFocus
        />

        {/* ── What kind of pictures ─────────────────────────────────────
            Chosen before the brief is written, because it changes what the
            brief should say: a designed poster wants an offer in words, a
            photograph wants a scene. It also decides which model draws each
            concept — a photographer that cannot spell, or a designer that can. */}
        <div className="picture-kinds">
          <button
            type="button"
            className="picture-kind"
            aria-pressed={wantPhotos}
            onClick={() => setKinds(!wantPhotos, wantDesigns)}
          >
            <span className="picture-kind__box">
              {wantPhotos ? <Icon name="check" size={12} /> : null}
            </span>
            <span>
              <span className="picture-kind__title">Photography</span>
              <span className="picture-kind__hint">
                Real scenes and product shots. No words in the picture.
              </span>
            </span>
          </button>

          <button
            type="button"
            className="picture-kind"
            aria-pressed={wantDesigns}
            onClick={() => setKinds(wantPhotos, !wantDesigns)}
          >
            <span className="picture-kind__box">
              {wantDesigns ? <Icon name="check" size={12} /> : null}
            </span>
            <span>
              <span className="picture-kind__title">Poster with text</span>
              <span className="picture-kind__hint">
                A designed layout. The headline, offer and small print are written for you from this
                brief.
              </span>
            </span>
          </button>
        </div>

        {/* ── Your product ────────────────────────────────────────────
            Offered whenever photography is being made, which is the case this
            was missing entirely: someone typed "red shoe" and got a red shoe,
            correctly and generically, with no way to say *my* red shoe. The
            poster path had a reference slot; this one had none. */}
        {wantPhotos ? (
          <div className="reference">
            {productImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={productImage} alt="Your product" className="reference__thumb" />
                <div className="reference__body">
                  <p className="reference__title">Photographing this product</p>
                  <p className="reference__hint">
                    Its shape, colour and materials are kept faithful. Only the setting and the
                    light change — so every picture is genuinely yours.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => onProductImage?.(null)}
                  disabled={uploadingProduct}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className="reference__box">
                  <Icon name="image" size={18} />
                </span>
                <div className="reference__body">
                  <p className="reference__title">Your product photo — optional</p>
                  <p className="reference__hint">
                    Upload the actual thing you are advertising and every photograph features it,
                    staged in a different setting each time.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  disabled={uploadingProduct}
                  onClick={() => productRef.current?.click()}
                >
                  {uploadingProduct ? <Spinner /> : <Icon name="upload" size={13} />} Upload
                </button>
              </>
            )}
            <input
              ref={productRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void uploadProduct(file)
              }}
            />
          </div>
        ) : null}

        {/* ── Reference poster ─────────────────────────────────────────
            Only offered when posters are being made: a photograph does not
            borrow a layout, so the control would be inert next to a run of
            product shots. */}
        {wantDesigns ? (
          <div className="reference">
            {reference ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reference} alt="Reference poster" className="reference__thumb" />
                <div className="reference__body">
                  <p className="reference__title">Designing with this look</p>
                  <p className="reference__hint">
                    Its layout, type pairing and density carry over. None of its words, products or
                    brand marks do — everything on your poster comes from your campaign.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => onReference?.(null)}
                  disabled={uploading}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className="reference__box">
                  <Icon name="image" size={18} />
                </span>
                <div className="reference__body">
                  <p className="reference__title">Reference poster — optional</p>
                  <p className="reference__hint">
                    Upload a poster you like and yours will be designed with the same eye, using
                    your own offer and products.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  disabled={uploading}
                  onClick={() => refRef.current?.click()}
                >
                  {uploading ? <Spinner /> : <Icon name="upload" size={13} />} Upload
                </button>
              </>
            )}
            <input
              ref={refRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void uploadReference(file)
              }}
            />
          </div>
        ) : null}

        <BriefCoach
          brief={prompt}
          onReplace={setPrompt}
          focusBrief={() => {
            // After the frame the new text has rendered, so the caret lands at
            // the end of the scaffold rather than where the old text ended.
            requestAnimationFrame(() => {
              const el = taRef.current
              if (!el) return
              el.focus()
              el.setSelectionRange(el.value.length, el.value.length)
            })
          }}
          initialResult={parseStoredCoach(restoredCoach)}
          onResult={onCoachResult}
        />

        <div className="row" style={{ flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
          <button
            type="button"
            className="btn primary"
            onClick={onSubmit}
            disabled={planning || prompt.trim().length < 4}
          >
            {planning ? (
              <Spinner />
            ) : (
              <>
                Continue
                <Icon name="arrow-right" size={15} />
              </>
            )}
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            ⌘↵ · drafts save automatically
          </span>
          <button type="button" className="btn ghost" onClick={onGuidedIntake}>
            <Icon name="clipboard" size={14} /> Skip to guided intake
          </button>
        </div>

        {/* Launch / Grow / Channel / Analyse used to sit here. Each was a
            sentence and nothing more, so every campaign still began by guessing
            how many pictures to make and whether they should be drawn or
            typeset — the decisions that actually change the output. A direction
            answers all of them, and shows on the card what it produces. */}
        <DirectionShelf
          selectedId={directionId ?? null}
          recommended={recommended}
          onPick={(direction) => onDirection?.(direction)}
        />

        {/* Under the shelf, because a saved look is a refinement of a chosen
            direction rather than an alternative to one. */}
        <StyleGallery
          selectedId={styleTemplateId ?? null}
          onSelect={(id) => onStyleTemplate?.(id)}
        />
      </div>

      {/* ── Right rail ──────────────────────────────────────────────────── */}
      <div className="today-rail">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-default)' }}>
            <div className="panel-head__title">Unfinished drafts</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {drafts.length === 0 ? 'Nothing in progress.' : 'Picks up exactly where you stopped.'}
            </div>
          </div>
          {drafts.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '14px 15px',
                fontSize: 12.5,
                color: 'var(--text-tertiary)',
              }}
            >
              Drafts are saved in this browser as you type.
            </p>
          ) : (
            drafts.slice(0, 5).map((d) => {
              const stop = draftStop(d)
              const title =
                d.plan?.campaignName ||
                d.prompt?.slice(0, 60) ||
                d.brief.slice(0, 60) ||
                'Untitled draft'
              return (
                <button
                  key={d.id}
                  type="button"
                  className="rail-row"
                  onClick={() => onOpenDraft(d.id)}
                >
                  <div className="rail-row__title">{title}</div>
                  <div className="rail-row__meta">
                    Step {stop.step} · {stop.label}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {templates.length > 0 ? (
          <div className="card">
            <div className="panel-head__title" style={{ marginBottom: 10 }}>
              Reuse a template
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.slice(0, 5).map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  className="rail-link"
                  onClick={() =>
                    applySentence(
                      `${prompt.trim() ? `${prompt.trim()}\n\n` : ''}Use the ${t.name} layout for the posters.`,
                    )
                  }
                >
                  <Icon name="layout" size={15} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-default)' }}>
              <div className="panel-head__title">Recent campaigns</div>
            </div>
            {recent.slice(0, 5).map((c) => (
              <button key={c.id} type="button" className="rail-row" onClick={() => onOpen(c.id)}>
                <div className="rail-row__title">{c.name}</div>
                <div className="rail-row__meta">
                  {(c.status ?? 'draft').toLowerCase()}
                  {c.objective ? ` · ${c.objective.toLowerCase()}` : ''}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FadeIn>
  )
}
