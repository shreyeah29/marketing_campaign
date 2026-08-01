'use client'

import { Icon, isIconName } from '@/components/icon'
import { PageHeader } from '@/components/kit'

/**
 * A complete page for a module whose full function depends on a platform-managed
 * provider or setup step (storage, telephony, transcription, a billing provider).
 *
 * Provider setup is an operator concern handled in backend configuration, never by
 * the customer, so this states what the module does and lists its capabilities
 * without pointing anyone at a settings screen.
 */
export function ModuleIntro({
  title,
  subtitle,
  icon,
  requires,
  capabilities,
}: {
  title: string
  subtitle: string
  icon: string
  requires: string
  // Kept for source compatibility with existing call sites; no longer rendered.
  configureHref?: string
  capabilities: { title: string; body: string }[]
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div
        className="banner info"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}
      >
        <span className="state-badge" style={{ margin: 0, width: 40, height: 40, fontSize: 18 }}>
          {isIconName(icon) ? <Icon name={icon} size={20} /> : icon}
        </span>
        <span>
          <strong>Coming soon.</strong> {requires}
        </span>
      </div>
      <div className="cols-3 grid">
        {capabilities.map((c) => (
          <div key={c.title} className="card">
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>{c.title}</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
