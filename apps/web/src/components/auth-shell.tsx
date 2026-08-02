'use client'

import Link from 'next/link'
import { motion, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { tween } from '@/components/motion'

/**
 * Shared frame for every authentication screen.
 *
 * Brief 3.1: 50/50 split — graphite left panel with one anonymised result in
 * Plex Mono; white (raised) right panel with the form. No marketing copy, no
 * Google SSO (no backend support). One rewrite covers tenant + platform login
 * and the password/invite siblings.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  brand = 'VSP',
}: {
  title: string
  subtitle?: string | undefined
  children: ReactNode
  footer?: ReactNode | undefined
  brand?: string | undefined
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="auth-split">
        <aside className="auth-split__panel" aria-hidden>
          <div className="auth-split__brand">
            <span className="auth-split__mark" />
            <strong>{brand}</strong>
          </div>
          <div className="auth-split__metric">
            <p className="auth-split__metric-label type-label">Last campaign</p>
            <p className="auth-split__metric-value">Reach 2.4M · ROAS 4.1× · 38 days</p>
            <p className="auth-split__metric-note type-caption">
              Anonymised result from a live workspace
            </p>
          </div>
        </aside>

        <main className="auth-split__form-wrap">
          <motion.div
            className="auth-split__form"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween}
          >
            <div className="auth-split__form-head">
              <div className="auth-split__form-brand">
                <span className="auth-split__mark auth-split__mark--ink" />
                <strong>{brand}</strong>
              </div>
              <Link
                href="/"
                className="btn ghost sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="arrow-left" size={13} /> Home
              </Link>
            </div>
            <h1 className="type-title" style={{ marginBottom: 'var(--space-2)' }}>
              {title}
            </h1>
            {subtitle ? (
              <p className="type-secondary" style={{ marginBottom: 'var(--space-5)' }}>
                {subtitle}
              </p>
            ) : (
              <div style={{ height: 'var(--space-5)' }} />
            )}
            {children}
            {footer ? <div className="auth-split__footer type-secondary">{footer}</div> : null}
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  )
}
