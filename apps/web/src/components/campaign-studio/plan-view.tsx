'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { Chip, StatusRail } from '@/components/status'
import { ApprovalWipe } from '@/components/motion'
import { estimateReach } from './draft'
import type { CampaignPlan, CreateDraft } from './types'

type SectionId =
  | 'overview'
  | 'audience'
  | 'funnel'
  | 'channels'
  | 'budget'
  | 'timeline'
  | 'metrics'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'audience', label: 'Audience' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'channels', label: 'Channel plan' },
  { id: 'budget', label: 'Budget allocation' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'metrics', label: 'KPIs & success' },
]

const FUNNEL_STAGES = ['Awareness', 'Consideration', 'Conversion', 'Retention'] as const

/**
 * Strategy review (brief Part 3 §7).
 * Editable sections from the real plan payload; iris until approved.
 * Request-changes regenerates only the commented section via the parent.
 */
export function PlanView({
  plan,
  draft,
  approved,
  generating,
  regenerating,
  onBack,
  onPlanChange,
  onApprove,
  onSaveDraft,
  onRequestChanges,
  onGenerate,
}: {
  plan: CampaignPlan
  draft: CreateDraft
  approved: boolean
  generating: boolean
  regenerating: boolean
  onBack: () => void
  onPlanChange: (next: CampaignPlan) => void
  onApprove: () => void
  onSaveDraft: () => void
  onRequestChanges: (section: SectionId, comment: string) => void
  onGenerate: () => void
}) {
  const [editing, setEditing] = useState<SectionId | null>(null)
  const [changeSection, setChangeSection] = useState<SectionId | null>(null)
  const [changeComment, setChangeComment] = useState('')
  const [budgetSplits, setBudgetSplits] = useState<Record<string, number>>(() =>
    evenSplit(plan.platforms, plan.suggestedBudget),
  )

  const reach = estimateReach(draft)
  const platforms = plan.platforms.length ? plan.platforms : ['All channels']

  const funnelMap = useMemo(() => assignFunnel(platforms), [platforms])

  function patch(p: Partial<CampaignPlan>) {
    onPlanChange({ ...plan, ...p })
  }

  function rebalance(platform: string, value: number) {
    const next = { ...budgetSplits, [platform]: Math.max(0, value) }
    const total = Object.values(next).reduce((a, b) => a + b, 0)
    setBudgetSplits(next)
    if (total > 0) patch({ suggestedBudget: total })
  }

  return (
    <ApprovalWipe approved={approved}>
      <div className={`strat${approved ? ' is-approved' : ''}`}>
        <div className="strat__top">
          <button type="button" className="btn ghost sm" onClick={onBack}>
            <Icon name="arrow-left" size={14} /> Back
          </button>
          {!approved ? (
            <span className="status-pill" data-hue="iris">
              AI draft
            </span>
          ) : (
            <span className="status-pill" data-hue="jade">
              Approved
            </span>
          )}
        </div>

        <div className="strat__layout">
          <div className="strat__main">
            <StatusRail status={approved ? 'approved' : 'ai-draft'}>
              <header className="strat__header">
                <p className="type-label" style={{ color: 'var(--text-secondary)' }}>
                  Strategy review
                </p>
                <h1 className="strat__title">{plan.campaignName || 'Untitled campaign'}</h1>
                <p className="type-body" style={{ color: 'var(--text-secondary)' }}>
                  {plan.objective}
                </p>
              </header>
            </StatusRail>

            {SECTIONS.map((s) => (
              <section key={s.id} className="strat-card" id={`strat-${s.id}`}>
                <div className="strat-card__head">
                  <h2 className="type-section">{s.label}</h2>
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={`Edit ${s.label}`}
                    onClick={() => setEditing(editing === s.id ? null : s.id)}
                  >
                    <Icon name="pen-tool" size={14} /> {editing === s.id ? 'Done' : 'Edit'}
                  </button>
                </div>

                {s.id === 'overview' ? (
                  editing === 'overview' ? (
                    <div className="stack" style={{ gap: 12 }}>
                      <label className="field">
                        <span>Campaign name</span>
                        <input
                          className="input"
                          value={plan.campaignName}
                          onChange={(e) => patch({ campaignName: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Objective</span>
                        <textarea
                          className="input"
                          rows={2}
                          value={plan.objective}
                          onChange={(e) => patch({ objective: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Strategy</span>
                        <textarea
                          className="input"
                          rows={4}
                          value={plan.strategy}
                          onChange={(e) => patch({ strategy: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="type-body" style={{ whiteSpace: 'pre-wrap' }}>
                      {plan.strategy || '—'}
                    </p>
                  )
                ) : null}

                {s.id === 'audience' ? (
                  editing === 'audience' ? (
                    <label className="field">
                      <span>Audience</span>
                      <textarea
                        className="input"
                        rows={4}
                        value={plan.audience}
                        onChange={(e) => patch({ audience: e.target.value })}
                      />
                    </label>
                  ) : (
                    <div>
                      {reach > 0 ? (
                        <div className="strat-reach">
                          <span className="type-label">Estimated reach</span>
                          <div className="strat-reach__num">{reach.toLocaleString()}</div>
                          <span className="type-caption">From intake filters · rough estimate</span>
                        </div>
                      ) : null}
                      <p className="type-body">{plan.audience || '—'}</p>
                    </div>
                  )
                ) : null}

                {s.id === 'funnel' ? (
                  <div className="strat-funnel">
                    {FUNNEL_STAGES.map((stage) => (
                      <div key={stage} className="strat-funnel__stage">
                        <div className="type-label">{stage}</div>
                        <div className="strat-funnel__chips">
                          {(funnelMap[stage] ?? []).length ? (
                            funnelMap[stage]!.map((p) => <Chip key={p}>{p}</Chip>)
                          ) : (
                            <span className="type-caption">—</span>
                          )}
                        </div>
                        <div className="type-caption">{funnelHint(stage)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {s.id === 'channels' ? (
                  editing === 'channels' ? (
                    <div className="stack" style={{ gap: 12 }}>
                      <label className="field">
                        <span>Platforms (comma-separated)</span>
                        <input
                          className="input"
                          value={plan.platforms.join(', ')}
                          onChange={(e) => {
                            const list = e.target.value
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean)
                            patch({ platforms: list })
                            setBudgetSplits(evenSplit(list, plan.suggestedBudget))
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Deliverables (one per line)</span>
                        <textarea
                          className="input"
                          rows={4}
                          value={plan.deliverables.join('\n')}
                          onChange={(e) =>
                            patch({
                              deliverables: e.target.value
                                .split('\n')
                                .map((x) => x.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="stack" style={{ gap: 12 }}>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                        {platforms.map((p) => (
                          <Chip key={p}>{p}</Chip>
                        ))}
                      </div>
                      <ul className="strat-list">
                        {plan.deliverables.length ? (
                          plan.deliverables.map((d) => <li key={d}>{d}</li>)
                        ) : (
                          <li className="type-secondary">No deliverables listed</li>
                        )}
                      </ul>
                      <p className="type-caption">
                        ~{plan.estimatedAssets} assets estimated · cadence from plan
                      </p>
                    </div>
                  )
                ) : null}

                {s.id === 'budget' ? (
                  <div className="stack" style={{ gap: 14 }}>
                    <div className="strat-budget-bar" aria-hidden>
                      {platforms.map((p, i) => {
                        const v = budgetSplits[p] ?? 0
                        const pct =
                          plan.suggestedBudget > 0 ? (v / plan.suggestedBudget) * 100 : 0
                        return (
                          <span
                            key={p}
                            style={{
                              width: `${pct}%`,
                              background: `var(--chart-${(i % 6) + 1})`,
                            }}
                            title={`${p}: ${v}`}
                          />
                        )
                      })}
                    </div>
                    <table className="strat-budget-table">
                      <tbody>
                        {platforms.map((p) => (
                          <tr key={p}>
                            <td>{p}</td>
                            <td>
                              {editing === 'budget' ? (
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  value={budgetSplits[p] ?? 0}
                                  onChange={(e) => rebalance(p, Number(e.target.value) || 0)}
                                />
                              ) : (
                                <span className="strat-mono">
                                  ${(budgetSplits[p] ?? 0).toLocaleString()}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td>
                            <strong>Total</strong>
                          </td>
                          <td>
                            {editing === 'budget' ? (
                              <input
                                className="input"
                                type="number"
                                min={0}
                                value={plan.suggestedBudget}
                                onChange={(e) => {
                                  const total = Number(e.target.value) || 0
                                  patch({ suggestedBudget: total })
                                  setBudgetSplits(evenSplit(platforms, total))
                                }}
                              />
                            ) : (
                              <strong className="strat-mono">
                                ${plan.suggestedBudget.toLocaleString()}
                              </strong>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {s.id === 'timeline' ? (
                  editing === 'timeline' ? (
                    <label className="field">
                      <span>Duration (days)</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={plan.durationDays}
                        onChange={(e) => patch({ durationDays: Number(e.target.value) || 1 })}
                      />
                    </label>
                  ) : (
                    <div className="strat-gantt" aria-label={`${plan.durationDays} day timeline`}>
                      <div className="strat-gantt__track">
                        <div className="strat-gantt__fill" style={{ width: '100%' }} />
                      </div>
                      <div className="spread type-caption">
                        <span>Day 1</span>
                        <span className="strat-mono">{plan.durationDays} days</span>
                      </div>
                    </div>
                  )
                ) : null}

                {s.id === 'metrics' ? (
                  <div className="strat-kpis">
                    <div>
                      <div className="type-label">Assets to generate</div>
                      {editing === 'metrics' ? (
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={plan.estimatedAssets}
                          onChange={(e) =>
                            patch({ estimatedAssets: Number(e.target.value) || 0 })
                          }
                        />
                      ) : (
                        <div className="strat-mono strat-kpi">{plan.estimatedAssets}</div>
                      )}
                    </div>
                    <div>
                      <div className="type-label">Channels</div>
                      <div className="strat-mono strat-kpi">{platforms.length}</div>
                    </div>
                    <div>
                      <div className="type-label">Budget</div>
                      <div className="strat-mono strat-kpi">
                        ${plan.suggestedBudget.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <aside className="strat__rail">
            <div className="strat__rail-card">
              <p className="type-label" style={{ marginBottom: 12 }}>
                Campaign summary
              </p>
              <dl className="strat-summary">
                <div>
                  <dt>Reach</dt>
                  <dd className="strat-mono">{reach > 0 ? reach.toLocaleString() : '—'}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd className="strat-mono">${plan.suggestedBudget.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd className="strat-mono">{plan.durationDays} days</dd>
                </div>
                <div>
                  <dt>Assets</dt>
                  <dd className="strat-mono">{plan.estimatedAssets}</dd>
                </div>
              </dl>

              {!approved ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  onClick={onApprove}
                >
                  Approve strategy
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  disabled={generating}
                  onClick={onGenerate}
                >
                  {generating ? <Spinner /> : 'Generate campaign assets'}
                </button>
              )}

              <button
                type="button"
                className="btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                disabled={regenerating || approved}
                onClick={() => {
                  setChangeSection(changeSection ? null : 'overview')
                  setChangeComment('')
                }}
              >
                Request changes
              </button>

              <button
                type="button"
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={onSaveDraft}
              >
                Save as draft
              </button>

              {changeSection !== null && !approved ? (
                <div className="strat-changes">
                  <label className="field">
                    <span>Section</span>
                    <select
                      className="select"
                      value={changeSection}
                      onChange={(e) => setChangeSection(e.target.value as SectionId)}
                    >
                      {SECTIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>What should change?</span>
                    <textarea
                      className="input"
                      rows={3}
                      value={changeComment}
                      onChange={(e) => setChangeComment(e.target.value)}
                      placeholder="Only this section will be regenerated — your other edits stay."
                    />
                  </label>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={regenerating || changeComment.trim().length < 4}
                    onClick={() => {
                      if (!changeSection) return
                      onRequestChanges(changeSection, changeComment.trim())
                      setChangeComment('')
                      setChangeSection(null)
                    }}
                  >
                    {regenerating ? <Spinner /> : 'Regenerate section'}
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </ApprovalWipe>
  )
}

function evenSplit(platforms: string[], total: number): Record<string, number> {
  const list = platforms.length ? platforms : ['All']
  const n = list.length
  const base = Math.floor(total / n)
  const out: Record<string, number> = {}
  let spent = 0
  list.forEach((p, i) => {
    const v = i === n - 1 ? total - spent : base
    out[p] = v
    spent += v
  })
  return out
}

function assignFunnel(platforms: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {
    Awareness: [],
    Consideration: [],
    Conversion: [],
    Retention: [],
  }
  platforms.forEach((p, i) => {
    const stage = FUNNEL_STAGES[i % FUNNEL_STAGES.length]!
    out[stage] = [...(out[stage] ?? []), p]
  })
  return out
}

function funnelHint(stage: (typeof FUNNEL_STAGES)[number]): string {
  switch (stage) {
    case 'Awareness':
      return 'Reach & intro creative'
    case 'Consideration':
      return 'Proof, demos, education'
    case 'Conversion':
      return 'Offers, landing, retargeting'
    case 'Retention':
      return 'Email, loyalty, upsell'
  }
}

export type { SectionId }
