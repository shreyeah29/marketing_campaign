'use client'

import { Badge, Stat } from '@/components/ui'

import { useWorkspace } from './layout'

/**
 * The tenant dashboard.
 *
 * Everything shown is derived from the workspace bootstrap: the enabled feature
 * count, the plan, and the limit meters that apply to this org. An org without
 * voice never sees a voice-minutes card, because the API only returns limits whose
 * governing feature is enabled.
 */
export default function TenantDashboard() {
  const ws = useWorkspace()

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">
            {ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'}
          </h1>
          <p className="page-sub">
            {ws.plan ? `${ws.plan.name} plan` : 'No plan'} · {ws.enabledFeatures.length} modules
            enabled
          </p>
        </div>
        <Badge status={ws.organization?.status}>{ws.organization?.status ?? 'UNKNOWN'}</Badge>
      </div>

      <div className="cols-3 grid" style={{ marginBottom: 22 }}>
        <Stat label="Enabled modules" value={ws.enabledFeatures.length} />
        <Stat label="Your role" value={ws.user.role} />
        <Stat label="Limits tracked" value={ws.limits.length} />
      </div>

      <div className="cols-2 grid">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Limits</h3>
          {ws.limits.length === 0 ? (
            <span className="dim">No limits apply to this organization.</span>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {ws.limits.map((l) => (
                <div key={l.metric} className="spread">
                  <span className="muted">{l.name}</span>
                  <span>
                    {l.limit === null || l.limit === -1 ? 'Unlimited' : l.limit.toLocaleString()}{' '}
                    <span className="dim">{l.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Enabled modules</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ws.enabledFeatures.map((f) => (
              <span key={f} className="badge">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
