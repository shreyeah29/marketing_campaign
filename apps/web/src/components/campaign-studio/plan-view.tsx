'use client'

import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { Chip } from '@/components/status'

import type { CampaignPlan } from './types'

// ── Phase 2: Plan summary ────────────────────────────────────────────────────
export function PlanView({
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
            {plan.platforms.length ? plan.platforms.map((p) => <Chip key={p}>{p}</Chip>) : '—'}
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
              ? plan.deliverables.map((d) => <Chip key={d}>{d}</Chip>)
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
