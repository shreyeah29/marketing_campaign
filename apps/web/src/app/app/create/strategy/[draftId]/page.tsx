'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { useToast, CardSkeleton, EmptyState } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon, type IconName } from '@/components/icon'
import { Spinner } from '@/components/ui'
import {
  BrowserDraftBanner,
  DEFAULT_PACE,
  buildBriefFromDraft,
  paceById,
  readDraft,
  upsertDraft,
  type CampaignPlan,
  type CreateDraft,
} from '@/components/campaign-studio'

/**
 * Plan approval — step 3 of six.
 *
 * Nothing is generated until Approve is pressed.
 *
 * This screen used to start generation the moment a plan existed, on the
 * reasoning that you cannot judge a plan you have not seen output for. The
 * concern is real; billing first and asking afterwards is not the answer to it.
 * The answer is a plan specific enough to judge before it is paid for — every
 * asset itemised by kind, the cost of producing them stated separately from the
 * ad spend, and ad spend named as Meta's rather than ours.
 *
 * So Approve is the only lime button on the page: it is the only irreversible
 * one. Regenerating the plan costs nothing and says so.
 */

const STEPS = ['Brief', 'Intake', 'Plan', 'Generate', 'Review', 'Publish'] as const

/** One line of the deliverables table, derived from the draft the plan was built from. */
interface Deliverable {
  key: string
  icon: IconName
  label: string
  qualifier: string
  count: number
  /**
   * True when a model produces it, rather than the template engine.
   *
   * Named `billed` until now, which put our cost of goods into the vocabulary of
   * a client-facing screen. What the flag is actually used for is marking which
   * rows are generated — the icon is highlighted for those — and that is a fact
   * about how the asset is made, not about what it costs.
   */
  generated: boolean
}

/**
 * What will actually be produced.
 *
 * Read from the draft rather than the plan's free-text `deliverables`, because
 * the draft is what `buildBriefFromDraft` turns into the generator's
 * instructions — so these counts are the ones the run will honour, not a
 * paraphrase of them.
 */
function deliverablesFor(draft: CreateDraft): Deliverable[] {
  const posts = draft.postCount ?? 5
  const videos = draft.videoCount ?? (draft.wantVideos ? 1 : 0)
  const ads = draft.adPlatforms?.length ?? 0
  const rows: Deliverable[] = []

  if (draft.wantPosters !== false) {
    rows.push({
      key: 'posters',
      icon: 'image',
      label: 'Poster concepts',
      qualifier: 'one per concept, feed and story crops',
      count: posts,
      generated: true,
    })
  }
  if (videos > 0) {
    rows.push({
      key: 'videos',
      icon: 'video',
      label: 'Video concepts',
      qualifier: 'reels 9:16',
      count: videos,
      generated: true,
    })
  }
  rows.push({
    key: 'copy',
    icon: 'message-square',
    label: 'Captions & hashtags',
    qualifier: 'per concept',
    count: posts,
    generated: false,
  })
  if (ads > 0) {
    rows.push({
      key: 'ads',
      icon: 'zap',
      label: 'Ad copy sets',
      qualifier: draft.adPlatforms?.join(', ') ?? '',
      count: ads,
      generated: false,
    })
  }
  if (draft.wantEmails) {
    rows.push({
      key: 'email',
      icon: 'mail',
      label: 'Email sequence',
      qualifier: 'announce, remind, last call',
      count: 3,
      generated: false,
    })
  }
  if (draft.wantLanding) {
    rows.push({
      key: 'landing',
      icon: 'browser',
      label: 'Landing page copy',
      qualifier: 'headline, body, CTA',
      count: 1,
      generated: false,
    })
  }
  return rows
}

/**
 * The blocks that can be rewritten on their own.
 *
 * Regenerating one section is cheaper and faster than a whole-plan rewrite, and
 * it does not discard the parts already agreed with. Fixing one field by
 * rewriting everything is the coarseness that makes people stop iterating.
 *
 * `fields` is what a rewrite is allowed to replace — everything else on the plan
 * survives untouched, so a rewrite of the audience can never quietly move the
 * budget.
 */
const SECTIONS = {
  strategy: { label: 'Strategy', fields: ['strategy'] },
  audience: { label: 'Audience', fields: ['audience'] },
  schedule: { label: 'Schedule', fields: ['durationDays', 'platforms'] },
  // No budget section. The plan's `suggestedBudget` is redacted before it
  // reaches this plane, so a control that regenerated it would rewrite a field
  // the screen cannot show. Pace is chosen on the intake step instead.
  deliverables: { label: 'Deliverables', fields: ['deliverables', 'estimatedAssets'] },
} as const satisfies Record<string, { label: string; fields: readonly (keyof CampaignPlan)[] }>

type SectionKey = keyof typeof SECTIONS

/** Copy only the named fields across, leaving every other decision in place. */
function mergeSection(current: CampaignPlan, fresh: CampaignPlan, key: SectionKey): CampaignPlan {
  const next: CampaignPlan = { ...current }
  for (const f of SECTIONS[key].fields) {
    // Computed-key assign rather than a cast: `f` is a `keyof CampaignPlan`, so
    // both sides stay typed and a renamed field breaks the build here.
    Object.assign(next, { [f]: fresh[f] })
  }
  return next
}

export default function PlanApprovalPage() {
  const params = useParams<{ draftId: string }>()
  const router = useRouter()
  const toast = useToast()
  const draftId = params.draftId

  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [missing, setMissing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [note, setNote] = useState('')
  const [allowance, setAllowance] = useState<{ configured: boolean; usedPct: number } | null>(null)

  useEffect(() => {
    api
      .get<{ configured: boolean; usedPct: number }>('/me/ad-allowance')
      .then(setAllowance)
      .catch(() => setAllowance({ configured: false, usedPct: 0 }))
  }, [])
  /** Which block has its rewrite box open, and the note typed into it. */
  const [openSection, setOpenSection] = useState<SectionKey | null>(null)
  const [sectionNote, setSectionNote] = useState('')
  const [rewriting, setRewriting] = useState<SectionKey | null>(null)

  useEffect(() => {
    const d = readDraft(draftId)
    if (!d) {
      setMissing(true)
      return
    }
    setDraft(d)
  }, [draftId])

  /**
   * Build the plan if there isn't one. This is a copywriter-class call and
   * costs a fraction of a rupee — it is not the expensive step, and it does not
   * create a campaign or render anything.
   */
  const buildPlan = useCallback(
    async (current: CreateDraft, feedback?: string) => {
      const base = buildBriefFromDraft(current)
      if (base.trim().length < 4) return
      const brief = feedback?.trim()
        ? `${base}\n\nRevision request: ${feedback.trim()}\nKeep everything the brief already fixes; change only what the request asks for.`
        : base
      setPlanning(true)
      try {
        const plan = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
        setDraft(upsertDraft(draftId, { plan, brief: base, planApproved: false }))
        setNote('')
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'Could not build the plan')
      } finally {
        setPlanning(false)
      }
    },
    [draftId, toast],
  )

  useEffect(() => {
    if (!draft || draft.plan || planning) return
    void buildPlan(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id])

  /**
   * Rewrite one block. Same call as the full regenerate and the same price —
   * free — but only the named fields are taken from the result, so the parts
   * already agreed with survive verbatim.
   */
  async function rewriteSection(key: SectionKey) {
    if (!draft?.plan) return
    const base = buildBriefFromDraft(draft)
    const feedback = sectionNote.trim()
    const brief = [
      base,
      '',
      `Revision request — rewrite ONLY the "${SECTIONS[key].label}" section of the plan.`,
      'Return the whole plan object, but leave every other section exactly as it is.',
      feedback ? `What to change: ${feedback}` : 'Produce a different, stronger version.',
    ].join('\n')

    setRewriting(key)
    try {
      const fresh = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      const merged = mergeSection(draft.plan, fresh, key)
      setDraft(upsertDraft(draftId, { plan: merged, brief: base, planApproved: false }))
      setOpenSection(null)
      setSectionNote('')
    } catch (e) {
      toast.push(
        'error',
        e instanceof ApiError ? e.message : `Could not rewrite ${SECTIONS[key].label}`,
      )
    } finally {
      setRewriting(null)
    }
  }

  /** The "rewrite this" control that sits in each block's header. */
  function RewriteControl({ section }: { section: SectionKey }) {
    const busy = rewriting === section
    const open = openSection === section
    return (
      <>
        <button
          type="button"
          className="btn ghost sm rewrite-btn"
          disabled={busy || planning || generating}
          aria-expanded={open}
          onClick={() => {
            setOpenSection(open ? null : section)
            setSectionNote('')
          }}
          title={`Rewrite ${SECTIONS[section].label} only — free`}
        >
          {busy ? <Spinner /> : <Icon name="refresh" size={13} />}
          Rewrite this
        </button>
        {open ? (
          <div className="rewrite-box">
            <input
              className="input"
              value={sectionNote}
              onChange={(e) => setSectionNote(e.target.value)}
              placeholder={`What should ${SECTIONS[section].label.toLowerCase()} do differently?`}
              aria-label={`Feedback for ${SECTIONS[section].label}`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void rewriteSection(section)
                }
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void rewriteSection(section)}
            >
              {busy ? <Spinner /> : 'Rewrite'}
            </button>
            <span className="rewrite-box__note">
              Free — rewrites this block only, generates nothing.
            </span>
          </div>
        ) : null}
      </>
    )
  }

  /**
   * The irreversible step. Guarded on `generatedCampaignId` so returning to
   * this screen after approving never creates a second campaign — the guard
   * that mattered when generation started itself still matters now that a
   * person starts it.
   */
  async function approve() {
    if (!draft) return
    if (draft.generatedCampaignId) {
      router.push(`/app/create/generating/${draft.generatedCampaignId}`)
      return
    }
    const brief = buildBriefFromDraft(draft)
    setGenerating(true)
    try {
      const res = await api.post<{ campaignId: string; assetCount: number }>(
        '/campaign-assets/generate',
        // Sent as its own field as well as inside the brief: the brief is read
        // by a model, this is applied by us, and a stated instruction should not
        // depend on the model remembering it.
        {
          brief,
          ...(draft.posterText?.trim() ? { posterText: draft.posterText.trim() } : {}),
          ...(draft.referenceImageUrl ? { referenceImageUrl: draft.referenceImageUrl } : {}),
          // The saved look, by id. Its description is read server-side and
          // folded into every image prompt in the run, so the whole set gets
          // identical direction rather than five readings of one picture.
          ...(draft.styleTemplateId ? { styleTemplateId: draft.styleTemplateId } : {}),
          // The built-in direction. Resolved server-side into the same look slot
          // a saved style uses, so the two cannot behave differently.
          ...(draft.directionId ? { directionId: draft.directionId } : {}),
          /**
           * The picture-kind choice, as its own field.
           *
           * It is already described in the brief, and that was not enough: the
           * brief is read by a model, and a model that omits `visualStyle` on a
           * concept got the safe default — a photograph — for someone who had
           * explicitly asked for posters with words on them. Applied server-side
           * from this instead of inferred from what came back.
           */
          pictureKinds: {
            posters: draft.wantPosterDesigns === true,
            photography: draft.wantPhotography !== false,
          },
        },
      )
      upsertDraft(draftId, { generatedCampaignId: res.campaignId, planApproved: true })
      router.push(`/app/create/generating/${res.campaignId}`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Generation could not start')
      setGenerating(false)
    }
  }

  if (missing) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <EmptyState
          icon="file-text"
          title="Draft not found"
          hint="Drafts live in this browser only. Start again from the brief."
          action={
            <button className="btn primary" onClick={() => router.push('/app/create')}>
              New brief
            </button>
          }
        />
      </div>
    )
  }

  if (!draft) return <CardSkeleton count={2} />

  if (!draft.plan) {
    return (
      <div style={{ maxWidth: 960, margin: '40px auto' }}>
        <BrowserDraftBanner />
        <CardSkeleton count={2} />
        <p className="type-secondary" style={{ textAlign: 'center', marginTop: 16 }}>
          {planning ? 'Building your plan — nothing is generated yet.' : 'Preparing…'}
        </p>
      </div>
    )
  }

  const plan = draft.plan
  const pace = paceById(draft.pace ?? DEFAULT_PACE)
  const monthName = new Date().toLocaleString('en-GB', { month: 'long' })
  const rows = deliverablesFor(draft)
  const totalAssets = rows.reduce((n, r) => n + r.count, 0)
  const goals = plan.strategy
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter((l) => l.length > 0)

  return (
    <FadeIn className="today-layout">
      <div className="today-main">
        <div className="step-rail">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className="step-chip"
              data-state={i < 2 ? 'done' : i === 2 ? 'current' : 'todo'}
            >
              {i + 1} {label.toUpperCase()}
              {i < 2 ? ' ✓' : ''}
            </span>
          ))}
        </div>

        <h1 className="brief-title" style={{ maxWidth: 'none' }}>
          {plan.campaignName}
        </h1>
        <p className="brief-sub" style={{ maxWidth: '62ch', marginBottom: 22 }}>
          Nothing has been generated yet. Approve the plan and the run starts, producing exactly the
          assets listed here and nothing else.
        </p>

        <BrowserDraftBanner />

        {/* ── Four summary tiles ────────────────────────────────────────── */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div className="plan-tile">
            <div className="plan-tile__k">OBJECTIVE</div>
            <div className="plan-tile__v">{plan.objective}</div>
          </div>
          <div className="plan-tile">
            <div className="plan-tile__k">DURATION</div>
            <div className="plan-tile__v">{plan.durationDays || draft.durationDays || 15} days</div>
          </div>
          {/* Push, not budget. The tile answers the only question a client can
              act on here: will this campaign leave room for the rest of the
              month. No currency — the rupees behind the share are ours. */}
          <div className="plan-tile">
            <div className="plan-tile__k">AD PUSH</div>
            <div className="plan-tile__v">{allowance?.configured ? pace.label : 'Not set'}</div>
            {allowance?.configured ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>
                ~{pace.sharePct}% of {monthName} allowance ·{' '}
                {String(Math.max(0, 100 - allowance.usedPct))}% still unused
              </div>
            ) : null}
          </div>
          <div className="plan-tile" data-attention="">
            <div className="plan-tile__k">WILL GENERATE</div>
            <div className="plan-tile__v">{totalAssets} assets</div>
          </div>
        </div>

        {/* ── Strategy ──────────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div className="block-head">
            <span className="intake-section__title">Strategy</span>
            <RewriteControl section="strategy" />
          </div>
          <p
            style={{
              margin: '0 0 14px',
              color: 'var(--text-secondary)',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {plan.strategy}
          </p>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}
          >
            <div>
              <div className="block-head">
                <span className="field-label" style={{ marginBottom: 0 }}>
                  CHANNELS
                </span>
                <RewriteControl section="schedule" />
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                {plan.platforms.length > 0 ? plan.platforms.join(', ') : 'Not set'}
              </p>
            </div>
            <div>
              <div className="block-head">
                <span className="field-label" style={{ marginBottom: 0 }}>
                  AUDIENCE
                </span>
                <RewriteControl section="audience" />
              </div>
              <p
                style={{
                  margin: 0,
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                {plan.audience}
              </p>
            </div>
          </div>
          {goals.length > 1 ? (
            <div style={{ marginTop: 12 }}>
              <div className="field-label">SCHEDULE</div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Runs {plan.durationDays || draft.durationDays || 15} days across{' '}
                {plan.platforms.length || 1} channel
                {plan.platforms.length === 1 ? '' : 's'}.
              </p>
            </div>
          ) : null}
        </div>

        {/* ── Deliverables ──────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-head">
            <span className="panel-head__title">Deliverables</span>
            <span className="coach__status">{totalAssets} in total</span>
            <span style={{ marginLeft: 'auto' }}>
              <RewriteControl section="deliverables" />
            </span>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className="deliv-row"
              {...(r.generated ? { 'data-generated': '' } : {})}
            >
              <Icon name={r.icon} size={17} className="ico" />
              <span className="deliv-row__what">
                {r.label} <span className="deliv-row__qual">· {r.qualifier}</span>
              </span>
              <span className="deliv-row__n">{r.count}</span>
            </div>
          ))}
        </div>

        {/* ── The decision ──────────────────────────────────────────────── */}
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => void approve()}
            disabled={generating || planning}
          >
            {generating ? (
              <Spinner />
            ) : (
              <>
                <Icon name="check" size={15} />
                Approve &amp; generate
              </>
            )}
          </button>
          <button
            type="button"
            className="btn"
            disabled={generating}
            onClick={() => router.push(`/app/create/intake/${draftId}`)}
          >
            Adjust the intake
          </button>
          <button
            type="button"
            className="btn"
            disabled={planning || generating}
            onClick={() => void buildPlan(draft, note)}
          >
            {planning ? <Spinner /> : 'Regenerate plan'}
          </button>
        </div>

        <div style={{ marginTop: 10, maxWidth: 620 }}>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: what should the next plan do differently?"
            aria-label="Feedback for the regenerated plan"
            disabled={planning || generating}
          />
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Regenerating rewrites the plan and produces nothing. Only Approve starts the run.
          </p>
        </div>
      </div>

      {/* ── Cost rail ────────────────────────────────────────────────────── */}
      <div className="today-rail">
        {/* What Approve produces — a quantity, not a price.
            This panel used to be "Estimated cost" and itemised what each asset
            costs us to make. That is our cost of goods, shown to the person
            buying the goods; a client sees what they get and how their allowance
            is doing, and money never appears on this plane. */}
        <div className="card">
          <div className="panel-head__title" style={{ marginBottom: 12 }}>
            What this produces
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rows.map((r) => (
              <div key={r.key} className="cost-line">
                <span>
                  {r.count} {r.label.toLowerCase()}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>{r.qualifier}</span>
              </div>
            ))}
            <div className="cost-line cost-line__total">
              <span>Total</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {totalAssets} {totalAssets === 1 ? 'asset' : 'assets'}
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              Every one of these needs your approval before it publishes.
            </p>
          </div>
        </div>

        <div className="card">
          {/* No rewrite control: the allowance is a fact about the workspace, not
              a part of the plan a model can be asked to reconsider. */}
          <div className="block-head">
            <span className="panel-head__title">Ad allowance</span>
          </div>
          {allowance?.configured ? (
            <>
              <div className="cost-line">
                <span>This campaign</span>
                <span style={{ color: 'var(--text-primary)' }}>~{pace.sharePct}%</span>
              </div>
              <div className="cost-line" style={{ marginTop: 6 }}>
                <span>Used so far in {monthName}</span>
                <span style={{ color: 'var(--text-primary)' }}>{allowance.usedPct}%</span>
              </div>
              <div className="batch-bar" style={{ height: 5, marginTop: 9 }}>
                <div
                  className="batch-bar__fill"
                  style={{ width: `${String(Math.min(100, allowance.usedPct))}%` }}
                />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 9 }}>
                Ads run on your account and are paid for by us. The allowance resets at the start of
                next month.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              No monthly ad allowance is set for this workspace yet, so this campaign will publish
              organically until one is.
            </p>
          )}
        </div>

        <div className="card">
          <div className="panel-head__title" style={{ marginBottom: 10 }}>
            What Approve does
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 12.5,
              color: 'var(--text-secondary)',
            }}
          >
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check-circle" size={15} style={{ color: 'var(--jade-600)' }} />
              <span>Creates the campaign and starts rendering {totalAssets} assets.</span>
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check-circle" size={15} style={{ color: 'var(--jade-600)' }} />
              <span>Every asset still needs your approval before it publishes.</span>
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Icon name="alert-triangle" size={15} style={{ color: 'var(--amber-600)' }} />
              <span>Generation cannot be undone.</span>
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
