'use client'

import Link from 'next/link'
import { motion, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { spring } from '@/components/motion'

/**
 * Shared frame for every authentication screen: centred glass card with the
 * brand mark, springing into place. Pages provide the form (children) and an
 * optional footer row (links under the form). Every screen carries a way back
 * to the landing page — an entrance you can't leave is a trap.
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
      <div className="center-screen" style={{ position: 'relative' }}>
        <motion.div
          className="card auth-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
        >
          <div className="spread" style={{ padding: '0 0 20px' }}>
            <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot" />
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
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>{title}</h1>
          {subtitle ? (
            <p className="page-sub" style={{ marginBottom: 20 }}>
              {subtitle}
            </p>
          ) : (
            <div style={{ height: 14 }} />
          )}
          {children}
          {footer ? <div style={{ marginTop: 16, fontSize: 13 }}>{footer}</div> : null}
        </motion.div>
      </div>
    </MotionConfig>
  )
}
