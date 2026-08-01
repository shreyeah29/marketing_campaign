'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, EmptyState, useToast } from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon, type IconName } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Asset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  caption?: string | null
  hashtags?: string[]
  cta?: string | null
  scheduledFor?: string | null
  mediaUrl?: string | null
}
interface Campaign {
  id: string
  name: string
  objective?: string | null
  status?: string | null
  strategy?: { summary?: string; goals?: string[]; schedule?: string | null } | null
  targetAudience?: { description?: string | null } | null
  budgetTotal?: number | null
  createdAt?: string
}
interface CampaignPlan {
  campaignName: string
  objective: string
  audience: string
  strategy: string
  platforms: string[]
  durationDays: number
  suggestedBudget: number
  deliverables: string[]
  estimatedAssets: number
}

const CHIPS = [
  'Social Media Campaign',
  'Meta Ads',
  'Google Ads',
  'LinkedIn Campaign',
  'Email Marketing',
  'Content Calendar',
  'Product Launch',
  'Brand Awareness',
  'Lead Generation',
  'Seasonal Campaign',
  'Website Content',
  'Landing Page',
  'Blog Articles',
  'Marketing Strategy',
  'Complete 360° Campaign',
]

const SECTIONS: {
  id: string
  label: string
  icon: IconName
  kinds?: string[]
  statuses?: string[]
  scheduled?: boolean
}[] = [
  { id: 'overview', label: 'Overview', icon: 'layout' },
  { id: 'strategy', label: 'Strategy', icon: 'target' },
  { id: 'calendar', label: 'Content Calendar', icon: 'calendar', scheduled: true },
  {
    id: 'social',
    label: 'Social Posts',
    icon: 'megaphone',
    kinds: ['POST', 'CAPTION', 'STORY', 'REEL'],
  },
  {
    id: 'ads',
    label: 'Advertisements',
    icon: 'zap',
    kinds: ['AD_COPY', 'AD_HEADLINE', 'AD_DESCRIPTION'],
  },
  { id: 'email', label: 'Email Campaign', icon: 'mail', kinds: ['EMAIL'] },
  { id: 'landing', label: 'Landing Page', icon: 'layout', kinds: ['LANDING'] },
  { id: 'blog', label: 'Blog Content', icon: 'file-text', kinds: ['BLOG', 'ARTICLE'] },
  { id: 'media', label: 'Media Assets', icon: 'image', kinds: ['IMAGE_PROMPT', 'VIDEO_PROMPT'] },
  {
    id: 'review',
    label: 'Review Queue',
    icon: 'check-square',
    statuses: ['GENERATED', 'NEEDS_REVIEW', 'DRAFT'],
  },
  { id: 'publishing', label: 'Publishing', icon: 'send', statuses: ['SCHEDULED', 'PUBLISHED'] },
  { id: 'analytics', label: 'Analytics', icon: 'bar-chart' },
]

function statusTint(s: string): string {
  if (s === 'APPROVED' || s === 'PUBLISHED') return 'ok'
  if (s === 'REJECTED' || s === 'FAILED') return 'danger'
  if (s === 'SCHEDULED' || s === 'PUBLISHING') return 'info'
  return 'warn'
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const toast = useToast()
  const [phase, setPhase] = useState<'prompt' | 'plan' | 'workspace'>('prompt')

  const [prompt, setPrompt] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [plan, setPlan] = useState<CampaignPlan | null>(null)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [recent, setRecent] = useState<Campaign[]>([])

  const brief = useMemo(() => {
    const chips = [...selected]
    return chips.length > 0
      ? `${prompt.trim()}\n\nRequested outputs: ${chips.join(', ')}`
      : prompt.trim()
  }, [prompt, selected])

  const loadRecent = useCallback(() => {
    api
      .get<{ data: Campaign[] } | Campaign[]>('/campaigns')
      .then((r) => setRecent(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setRecent([]))
  }, [])
  useEffect(loadRecent, [loadRecent])

  const loadAssets = useCallback((campaignId: string) => {
    setAssets(null)
    api
      .get<{ data: Asset[] } | Asset[]>(`/campaign-assets?campaignId=${campaignId}`)
      .then((r) => setAssets(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setAssets([]))
  }, [])

  function toggleChip(c: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  async function createPlan() {
    if (brief.trim().length < 4) return
    setPlanning(true)
    try {
      const p = await api.post<CampaignPlan>('/campaign-assets/plan', { brief })
      setPlan(p)
      setPhase('plan')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not create the plan')
    } finally {
      setPlanning(false)
    }
  }

  async function generateAssets() {
    setGenerating(true)
    try {
      const res = await api.post<{ campaignId: string; assetCount: number }>(
        '/campaign-assets/generate',
        { brief },
      )
      toast.push('success', `${res.assetCount} assets generated`)
      await openCampaign(res.campaignId)
      loadRecent()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const openCampaign = useCallback(
    async (campaignId: string) => {
      const list = await api
        .get<{ data: Campaign[] } | Campaign[]>('/campaigns')
        .then((r) => (Array.isArray(r) ? r : (r.data ?? [])))
        .catch(() => [] as Campaign[])
      const c = list.find((x) => x.id === campaignId) ?? { id: campaignId, name: 'Campaign' }
      setCampaign(c)
      loadAssets(campaignId)
      setPhase('workspace')
    },
    [loadAssets],
  )

  function reset() {
    setPhase('prompt')
    setPlan(null)
    setCampaign(null)
    setAssets(null)
  }

  if (phase === 'plan' && plan) {
    return (
      <PlanView
        plan={plan}
        generating={generating}
        onBack={() => setPhase('prompt')}
        onGenerate={() => void generateAssets()}
      />
    )
  }

  if (phase === 'workspace' && campaign) {
    return (
      <WorkspaceView
        campaign={campaign}
        assets={assets}
        onReload={() => loadAssets(campaign.id)}
        onNew={reset}
      />
    )
  }

  return (
    <PromptView
      prompt={prompt}
      setPrompt={setPrompt}
      selected={selected}
      toggleChip={toggleChip}
      planning={planning}
      onSubmit={() => void createPlan()}
      recent={recent}
      onOpen={(id) => void openCampaign(id)}
    />
  )
}

// ── Phase 1: Prompt workspace ────────────────────────────────────────────────
function PromptView({
  prompt,
  setPrompt,
  selected,
  toggleChip,
  planning,
  onSubmit,
  recent,
  onOpen,
}: {
  prompt: string
  setPrompt: (v: string) => void
  selected: Set<string>
  toggleChip: (c: string) => void
  planning: boolean
  onSubmit: () => void
  recent: Campaign[]
  onOpen: (id: string) => void
}) {
  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="cmp-hero">
        <h1>What would you like to create today?</h1>
        <div className="sub">
          Describe your campaign and pick the outputs — your AI marketing director will plan it.
        </div>

        <div className="cmp-prompt">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Launch our new luxury jewellery collection for Diwali with a festive, elegant tone across social and paid…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit()
            }}
            autoFocus
          />
          <div className="cmp-prompt-actions">
            <span className="dim" style={{ fontSize: 12 }}>
              {selected.size > 0
                ? `${selected.size} output${selected.size > 1 ? 's' : ''} selected`
                : 'Tip: ⌘⏎ to plan'}
            </span>
            <button
              className="btn primary"
              onClick={onSubmit}
              disabled={planning || prompt.trim().length < 4}
            >
              {planning ? (
                <Spinner />
              ) : (
                <>
                  <Icon name="sparkles" size={15} /> Create plan
                </>
              )}
            </button>
          </div>
        </div>

        <div className="chips">
          {CHIPS.map((c) => (
            <button
              key={c}
              className={`chip ${selected.has(c) ? 'on' : ''}`}
              onClick={() => toggleChip(c)}
            >
              {selected.has(c) ? <Icon name="check" size={13} /> : null}
              {c}
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 ? (
        <div style={{ maxWidth: 760, margin: '48px auto 0', padding: '0 16px' }}>
          <div
            className="dim"
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            Recent campaigns
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {recent.slice(0, 6).map((c) => (
              <button
                key={c.id}
                className="asset-row"
                style={{ alignItems: 'center', padding: 14 }}
                onClick={() => onOpen(c.id)}
              >
                <div className="avatar" style={{ background: 'var(--primary-soft)' }}>
                  <Icon name="megaphone" size={15} />
                </div>
                <div className="body">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {c.objective ?? 'Open workspace'}
                  </div>
                </div>
                {c.status ? <Badge status={statusTint(c.status)}>{c.status}</Badge> : null}
                <Icon name="chevron-right" size={16} className="dim" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Phase 2: Plan summary ────────────────────────────────────────────────────
function PlanView({
  plan,
  generating,
  onBack,
  onGenerate,
}: {
  plan: CampaignPlan
  generating: boolean
  onBack: () => void
  onGenerate: () => void
}) {
  return (
    <div className="plan-card">
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <Icon name="arrow-left" size={14} /> Edit prompt
      </button>

      <div style={{ marginBottom: 6 }}>
        <div
          className="dim"
          style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Your campaign plan
        </div>
        <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', marginTop: 6 }}>
          {plan.campaignName}
        </h1>
        <p className="muted" style={{ fontSize: 15, marginTop: 8, lineHeight: 1.6 }}>
          {plan.objective}
        </p>
      </div>

      <div className="plan-grid" style={{ marginTop: 20 }}>
        <div>
          <div className="k">Target audience</div>
          <div className="v">{plan.audience || '—'}</div>
        </div>
        <div>
          <div className="k">Duration</div>
          <div className="v">{plan.durationDays} days</div>
        </div>
        <div>
          <div className="k">Platforms</div>
          <div className="v" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {plan.platforms.length
              ? plan.platforms.map((p) => (
                  <span key={p} className="badge">
                    {p}
                  </span>
                ))
              : '—'}
          </div>
        </div>
        <div>
          <div className="k">Suggested budget</div>
          <div className="v">${plan.suggestedBudget.toLocaleString()}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="k">Strategy</div>
          <div className="v">{plan.strategy || '—'}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="k">Expected deliverables — {plan.estimatedAssets} assets</div>
          <div className="v" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {plan.deliverables.length
              ? plan.deliverables.map((d) => (
                  <span key={d} className="badge" style={{ background: 'var(--bg-subtle)' }}>
                    {d}
                  </span>
                ))
              : '—'}
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
        <button className="btn" onClick={onBack} disabled={generating}>
          Back
        </button>
        <button className="btn primary" onClick={onGenerate} disabled={generating}>
          {generating ? (
            <Spinner />
          ) : (
            <>
              <Icon name="sparkles" size={15} /> Generate campaign assets
            </>
          )}
        </button>
      </div>

      {generating ? (
        <div className="muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 16 }}>
          Generating your assets — this takes a few seconds…
        </div>
      ) : null}
    </div>
  )
}

// ── Phase 3: Campaign workspace ──────────────────────────────────────────────
function WorkspaceView({
  campaign,
  assets,
  onReload,
  onNew,
}: {
  campaign: Campaign
  assets: Asset[] | null
  onReload: () => void
  onNew: () => void
}) {
  const [section, setSection] = useState('overview')
  const [active, setActive] = useState<Asset | null>(null)

  const countFor = useCallback(
    (s: (typeof SECTIONS)[number]): number => {
      if (!assets) return 0
      if (s.kinds) return assets.filter((a) => s.kinds!.includes(a.kind)).length
      if (s.statuses) return assets.filter((a) => s.statuses!.includes(a.status)).length
      if (s.scheduled) return assets.filter((a) => a.scheduledFor).length
      return 0
    },
    [assets],
  )

  return (
    <>
      <div className="spread" style={{ marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="btn ghost sm" onClick={onNew} style={{ marginBottom: 8 }}>
            <Icon name="arrow-left" size={14} /> New campaign
          </button>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>{campaign.name}</h1>
          {campaign.objective ? (
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
              {campaign.objective}
            </p>
          ) : null}
        </div>
        {campaign.status ? (
          <Badge status={statusTint(campaign.status)}>{campaign.status}</Badge>
        ) : null}
      </div>

      <div className="cmp-ws">
        <nav className="cmp-ws-nav">
          {SECTIONS.map((s) => {
            const n = countFor(s)
            return (
              <button
                key={s.id}
                className={section === s.id ? 'on' : ''}
                onClick={() => {
                  setSection(s.id)
                  setActive(null)
                }}
              >
                <Icon name={s.icon} size={16} />
                {s.label}
                {n > 0 ? <span className="count">{n}</span> : null}
              </button>
            )
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          {active ? (
            <AssetEditor
              asset={active}
              onBack={() => setActive(null)}
              onChanged={() => {
                onReload()
                setActive(null)
              }}
            />
          ) : (
            <SectionView section={section} campaign={campaign} assets={assets} onOpen={setActive} />
          )}
        </div>
      </div>
    </>
  )
}

function SectionView({
  section,
  campaign,
  assets,
  onOpen,
}: {
  section: string
  campaign: Campaign
  assets: Asset[] | null
  onOpen: (a: Asset) => void
}) {
  const def = SECTIONS.find((s) => s.id === section)!

  if (section === 'overview') return <OverviewSection campaign={campaign} assets={assets} />
  if (section === 'strategy') return <StrategySection campaign={campaign} />
  if (section === 'analytics') return <AnalyticsSection assets={assets} />

  if (assets === null) return <SkeletonList />

  const list = assets.filter((a) => {
    if (def.kinds) return def.kinds.includes(a.kind)
    if (def.statuses) return def.statuses.includes(a.status)
    if (def.scheduled) return Boolean(a.scheduledFor)
    return false
  })

  if (list.length === 0) {
    return (
      <EmptyState
        icon={def.icon}
        title={`No ${def.label.toLowerCase()} yet`}
        hint="Generate a campaign or add assets — they'll appear here, organised by type."
      />
    )
  }

  return (
    <>
      <SectionHeader def={def} count={list.length} />
      <div className="stack" style={{ gap: 10 }}>
        {list.map((a) => (
          <AssetRow key={a.id} asset={a} onOpen={() => onOpen(a)} />
        ))}
      </div>
    </>
  )
}

function SectionHeader({ def, count }: { def: (typeof SECTIONS)[number]; count: number }) {
  return (
    <div className="row" style={{ gap: 10, marginBottom: 16 }}>
      <div className="avatar" style={{ background: 'var(--primary-soft)' }}>
        <Icon name={def.icon} size={16} />
      </div>
      <div>
        <h2 style={{ fontSize: 18 }}>{def.label}</h2>
        <div className="dim" style={{ fontSize: 12 }}>
          {count} item{count === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

function AssetRow({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  return (
    <button className="asset-row" onClick={onOpen}>
      <PlatformIcon platform={asset.platform} size={20} style={{ color: 'var(--color-primary)' }} />
      <div className="body">
        <div className="row" style={{ gap: 8, marginBottom: 5 }}>
          <span className="dim" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em' }}>
            {asset.platform} · {asset.kind}
          </span>
          <Badge status={statusTint(asset.status)}>{asset.status}</Badge>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
          {asset.body.length > 220 ? `${asset.body.slice(0, 220)}…` : asset.body || '(empty)'}
        </div>
        {asset.hashtags && asset.hashtags.length > 0 ? (
          <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
            {asset.hashtags
              .slice(0, 6)
              .map((h) => `#${h.replace(/^#/, '')}`)
              .join(' ')}
          </div>
        ) : null}
      </div>
      <Icon name="chevron-right" size={16} className="dim" style={{ marginTop: 2 }} />
    </button>
  )
}

// ── Overview / Strategy / Analytics ──────────────────────────────────────────
function OverviewSection({ campaign, assets }: { campaign: Campaign; assets: Asset[] | null }) {
  const total = assets?.length ?? 0
  const byStatus = (s: string) => assets?.filter((a) => a.status === s).length ?? 0
  const stats = [
    { label: 'Total assets', value: total, icon: 'layout' as IconName },
    {
      label: 'Needs review',
      value: byStatus('GENERATED') + byStatus('NEEDS_REVIEW'),
      icon: 'check-square' as IconName,
    },
    { label: 'Approved', value: byStatus('APPROVED'), icon: 'check' as IconName },
    {
      label: 'Scheduled',
      value: byStatus('SCHEDULED') + byStatus('PUBLISHED'),
      icon: 'send' as IconName,
    },
  ]
  return (
    <>
      <div className="cols-4 grid" style={{ marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div
              className="dim"
              style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              <Icon name={s.icon} size={14} /> {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Objective</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.objective ?? '—'}
        </p>
        {campaign.strategy?.summary ? (
          <>
            <h3 style={{ margin: '16px 0 8px' }}>Strategy</h3>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              {campaign.strategy.summary}
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

function StrategySection({ campaign }: { campaign: Campaign }) {
  const goals = campaign.strategy?.goals ?? []
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Approach</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.strategy?.summary ?? '—'}
        </p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Target audience</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          {campaign.targetAudience?.description ?? '—'}
        </p>
      </div>
      {goals.length > 0 ? (
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Goals</h3>
          <div className="stack" style={{ gap: 8 }}>
            {goals.map((g, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <Icon name="check" size={15} style={{ color: 'var(--ok)' }} />
                <span style={{ fontSize: 14 }}>{g}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AnalyticsSection({ assets }: { assets: Asset[] | null }) {
  if (!assets) return <SkeletonList />
  const platforms = [...new Set(assets.map((a) => a.platform))]
  const max = Math.max(1, ...platforms.map((p) => assets.filter((a) => a.platform === p).length))
  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>Assets by platform</h3>
      <div className="stack" style={{ gap: 12 }}>
        {platforms.map((p) => {
          const n = assets.filter((a) => a.platform === p).length
          return (
            <div key={p} className="row" style={{ gap: 12 }}>
              <span className="row" style={{ width: 90, fontSize: 13, gap: 6 }}>
                <PlatformIcon platform={p} size={14} /> {p}
              </span>
              <div
                style={{ flex: 1, height: 10, background: 'var(--bg-subtle)', borderRadius: 999 }}
              >
                <div
                  style={{
                    width: `${(n / max) * 100}%`,
                    height: '100%',
                    background: 'var(--color-primary)',
                    borderRadius: 999,
                  }}
                />
              </div>
              <span className="dim" style={{ fontSize: 13, width: 28, textAlign: 'right' }}>
                {n}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card skeleton" style={{ height: 88 }} />
      ))}
    </div>
  )
}

// ── Asset editor panel ───────────────────────────────────────────────────────
function AssetEditor({
  asset,
  onBack,
  onChanged,
}: {
  asset: Asset
  onBack: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [body, setBody] = useState(asset.body)
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [cta, setCta] = useState(asset.cta ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const status = asset.status

  async function act(label: string, fn: () => Promise<unknown>, close = true) {
    setBusy(label)
    try {
      await fn()
      toast.push('success', `${label} done`)
      if (close) onChanged()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  async function regenerate() {
    setBusy('Regenerate')
    try {
      const res = await api.post<{ body?: string }>(`/campaign-assets/${asset.id}/regenerate`, {})
      if (res.body) setBody(res.body)
      toast.push('success', 'Regenerated')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Regenerate failed')
    } finally {
      setBusy(null)
    }
  }

  const isConcept = asset.kind === 'IMAGE_PROMPT' || asset.kind === 'VIDEO_PROMPT'
  const canApprove = ['GENERATED', 'NEEDS_REVIEW', 'REJECTED', 'DRAFT'].includes(status)
  const canPublish = status === 'APPROVED'
  const [publishOpen, setPublishOpen] = useState(false)

  /**
   * Gate 1 for concepts: approving an image/video *concept* immediately turns it
   * into a real creative (Runway), which comes back as NEEDS_REVIEW — Gate 2.
   * For everything else, approve is the final approval.
   */
  async function approve() {
    if (isConcept && !asset.mediaUrl) {
      setBusy('Generate')
      try {
        await api.post(`/campaign-assets/${asset.id}/approve`, {})
        await api.post(`/campaign-assets/${asset.id}/generate-media`, {})
        toast.push('success', 'Creative generated — give it a final look')
        onChanged()
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'Generation failed')
      } finally {
        setBusy(null)
      }
      return
    }
    await act('Approve', () => api.post(`/campaign-assets/${asset.id}/approve`, {}))
  }

  return (
    <div style={{ animation: 'rise 0.2s ease both' }}>
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 14 }}>
        <Icon name="arrow-left" size={14} /> Back
      </button>

      <div className="card">
        <div className="spread" style={{ marginBottom: 16, alignItems: 'center' }}>
          <div className="row" style={{ gap: 10 }}>
            <PlatformIcon
              platform={asset.platform}
              size={22}
              style={{ color: 'var(--color-primary)' }}
            />
            <div>
              <div style={{ fontWeight: 650, fontSize: 15 }}>
                {asset.platform} · {asset.kind}
              </div>
              {asset.scheduledFor ? (
                <div className="dim" style={{ fontSize: 12 }}>
                  Scheduled · {new Date(asset.scheduledFor).toLocaleString()}
                </div>
              ) : null}
            </div>
          </div>
          <Badge status={statusTint(status)}>{status}</Badge>
        </div>

        <Field label="Body">
          <textarea
            className="input"
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field label="Caption">
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <Field label="Call to action">
          <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
        </Field>

        {asset.hashtags && asset.hashtags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {asset.hashtags.map((h) => (
              <span key={h} className="badge">
                #{h.replace(/^#/, '')}
              </span>
            ))}
          </div>
        ) : null}

        {/* The creative itself — once generated it sits beside its copy. */}
        {asset.mediaUrl ? (
          <div style={{ marginBottom: 16 }}>
            {asset.kind === 'VIDEO_PROMPT' ? (
              <video
                src={asset.mediaUrl}
                controls
                style={{
                  width: '100%',
                  maxHeight: 420,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: '#000',
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.mediaUrl}
                alt={asset.title ?? 'Generated creative'}
                style={{
                  width: '100%',
                  maxHeight: 420,
                  objectFit: 'contain',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)',
                }}
              />
            )}
          </div>
        ) : isConcept ? (
          <div
            style={{
              border: '1px dashed var(--border-strong)',
              borderRadius: 'var(--radius)',
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              marginBottom: 16,
              background: 'var(--bg-subtle)',
            }}
          >
            <Icon name={asset.kind === 'VIDEO_PROMPT' ? 'video' : 'image'} size={22} />
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {busy === 'Generate'
                ? 'Generating your creative — this takes a few seconds…'
                : 'Approve this concept and the creative is generated for you in seconds.'}
            </div>
          </div>
        ) : null}

        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() =>
              void act(
                'Save',
                () => api.patch(`/campaign-assets/${asset.id}`, { body, caption, cta }),
                false,
              )
            }
          >
            {busy === 'Save' ? (
              <Spinner />
            ) : (
              <>
                <Icon name="check" size={14} /> Save
              </>
            )}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => void regenerate()}>
            {busy === 'Regenerate' ? (
              <Spinner />
            ) : (
              <>
                <Icon name="refresh" size={14} /> Regenerate
              </>
            )}
          </button>
          {canApprove ? (
            <button className="btn primary" disabled={busy !== null} onClick={() => void approve()}>
              {busy === 'Generate' ? (
                <>
                  <Spinner /> Generating…
                </>
              ) : (
                <>
                  <Icon name={isConcept && !asset.mediaUrl ? 'sparkles' : 'check'} size={14} />
                  {isConcept && !asset.mediaUrl ? 'Approve & generate' : 'Approve'}
                </>
              )}
            </button>
          ) : null}
          {canPublish ? (
            <button
              className="btn primary"
              disabled={busy !== null}
              onClick={() => setPublishOpen(true)}
            >
              <Icon name="send" size={14} /> Publish
            </button>
          ) : null}
          <button
            className="btn ghost sm"
            disabled={busy !== null}
            onClick={() =>
              void act('Reject', () => api.post(`/campaign-assets/${asset.id}/reject`, {}))
            }
          >
            <Icon name="x" size={14} /> Reject
          </button>
          <button
            className="btn ghost sm"
            disabled={busy !== null}
            onClick={() =>
              void act('Duplicate', () => api.post(`/campaign-assets/${asset.id}/duplicate`, {}))
            }
          >
            <Icon name="copy" size={14} /> Duplicate
          </button>
          <div className="grow" />
          <button className="btn ghost sm" onClick={() => setConfirmDel(true)}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        title="Delete asset?"
        message="This removes the asset from the campaign."
        confirmLabel="Delete"
        danger
        onConfirm={() => void act('Delete', () => api.del(`/campaign-assets/${asset.id}`))}
        onCancel={() => setConfirmDel(false)}
      />

      {publishOpen ? (
        <PublishDialog
          assetId={asset.id}
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            setPublishOpen(false)
            toast.push('success', 'Queued for publishing')
            onChanged()
          }}
        />
      ) : null}
    </div>
  )
}

// ── Publish dialog — where an approved creative meets the world ───────────────
function PublishDialog({
  assetId,
  onClose,
  onPublished,
}: {
  assetId: string
  onClose: () => void
  onPublished: () => void
}) {
  const toast = useToast()
  const [accounts, setAccounts] = useState<
    { id: string; platform: string; handle: string | null; displayName: string | null }[] | null
  >(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [when, setWhen] = useState('') // empty = post now
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<
        {
          id: string
          platform: string
          handle: string | null
          displayName: string | null
          status: string
        }[]
      >('/social/accounts')
      .then((rows) => setAccounts(rows.filter((a) => a.status === 'CONNECTED')))
      .catch(() => setAccounts([]))
  }, [])

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function publish() {
    if (chosen.size === 0) return
    setBusy(true)
    try {
      await api.post(`/campaign-assets/${assetId}/publish`, {
        accountIds: [...chosen],
        ...(when ? { scheduledAt: new Date(when).toISOString() } : {}),
      })
      onPublished()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Publish failed')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Publish">
        <div className="head">
          <h3>Publish this creative</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          {accounts === null ? (
            <Spinner />
          ) : accounts.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No connected accounts yet. Connect Instagram, Facebook or another channel under
              Marketing → Social first.
            </p>
          ) : (
            <>
              <div className="field">
                <label>Where should it go?</label>
                <div className="stack" style={{ gap: 6 }}>
                  {accounts.map((a) => (
                    <label
                      key={a.id}
                      className="row"
                      style={{ gap: 10, cursor: 'pointer', padding: '6px 4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(a.id)}
                        onChange={() => toggle(a.id)}
                        style={{ margin: 0 }}
                      />
                      <PlatformIcon platform={a.platform} size={16} />
                      <span style={{ fontSize: 13 }}>
                        {a.displayName ?? a.handle ?? a.platform}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>When?</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <span className="hint">Leave empty to post now.</span>
              </div>
            </>
          )}
        </div>
        <div className="foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || chosen.size === 0}
            onClick={() => void publish()}
          >
            {busy ? <Spinner /> : when ? 'Schedule' : 'Post now'}
          </button>
        </div>
      </div>
    </>
  )
}
