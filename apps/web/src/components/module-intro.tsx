'use client'

import Link from 'next/link'

import { Icon, isIconName } from '@/components/icon'
import { PageHeader } from '@/components/kit'

/**
 * A complete page for a module whose full function depends on an external
 * provider or setup step (storage, telephony, transcription, a billing provider).
 *
 * It is intentionally NOT a "coming soon" placeholder: it states what the module
 * does, lists its capabilities, and tells the operator exactly what to configure
 * to turn it on — the same honest degradation as ProviderNotConfigured, applied to
 * a whole surface.
 */
export function ModuleIntro({
  title,
  subtitle,
  icon,
  requires,
  configureHref = '/app/settings/providers',
  capabilities,
}: {
  title: string
  subtitle: string
  icon: string
  requires: string
  configureHref?: string
  capabilities: { title: string; body: string }[]
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="banner info" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <span className="state-badge" style={{ margin: 0, width: 40, height: 40, fontSize: 18 }}>
          {isIconName(icon) ? <Icon name={icon} size={20} /> : icon}
        </span>
        <span>
          <strong>Setup required.</strong> {requires}{' '}
          <Link href={configureHref} style={{ color: 'var(--color-primary)' }}>
            Configure it →
          </Link>
        </span>
      </div>
      <div className="grid cols-3">
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
