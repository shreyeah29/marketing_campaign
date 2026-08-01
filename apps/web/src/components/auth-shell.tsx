'use client'

import { motion, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

import { spring } from '@/components/motion'

/**
 * Shared frame for every authentication screen: centred glass card with the
 * brand mark, springing into place. Pages provide the form (children) and an
 * optional footer row (links under the form).
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string | undefined
  children: ReactNode
  footer?: ReactNode | undefined
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="center-screen">
        <motion.div
          className="card auth-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
        >
          <div
            className="brand"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 20px' }}
          >
            <span className="dot" />
            <strong>VSP</strong>
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
