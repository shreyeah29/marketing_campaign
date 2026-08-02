'use client'

import { motion, MotionConfig, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

/* ────────────────────────────────────────────────────────────────────────────
 * Motion primitives. Durations and easing match the brief (--dur-* / --ease-out).
 * prefers-reduced-motion is honoured via MotionConfig reducedMotion="user".
 * ──────────────────────────────────────────────────────────────────────────── */

const easeOut = [0.16, 1, 0.3, 1] as const
const durFast = 0.12
const durBase = 0.2
const durSlow = 0.32

/** Timed tween — prefer this over spring physics for product chrome. */
export const tween = { type: 'tween', duration: durBase, ease: easeOut } as const

/** @deprecated Use `tween`. Kept so existing imports compile during migration. */
export const spring = tween

const fadeUp = {
  hidden: { opacity: 0, y: 3 },
  show: { opacity: 1, y: 0, transition: tween },
}

/** Wrap a page (or any subtree) so all nested motion respects user settings. */
export function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/** Fade + slight rise (2–4px budget). `delay` staggers siblings manually. */
export function FadeIn({
  children,
  delay = 0,
  ...rest
}: { children: ReactNode; delay?: number } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...tween, delay }}
        {...rest}
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}

/**
 * Staggered reveal: the container cascades its <StaggerItem> children.
 * Use for card grids, lists, and hero sections.
 */
export function Stagger({
  children,
  interval = 0.05,
  ...rest
}: { children: ReactNode; interval?: number } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: interval } } }}
        {...rest}
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}

export function StaggerItem({
  children,
  ...rest
}: { children: ReactNode } & HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={fadeUp} {...rest}>
      {children}
    </motion.div>
  )
}

/** Press feedback — 1px translate (scale is not in the allowlist). */
export function Pressable({ children, ...rest }: { children: ReactNode } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        whileHover={{ y: -1 }}
        whileTap={{ y: 1 }}
        transition={{ type: 'tween', duration: durFast, ease: easeOut }}
        {...rest}
      >
        {children}
      </motion.div>
    </MotionConfig>
  )
}

/** Generation arrival — staggered fade-in as AI work appears. */
export function GenerationArrival({ children }: { children: ReactNode }) {
  return (
    <Stagger interval={0.06} className="generation-arrival">
      {children}
    </Stagger>
  )
}

/**
 * Approval wipe — iris rail resolving to jade over --dur-slow.
 * Parent should toggle `approved` after the human confirms.
 */
export function ApprovalWipe({ approved, children }: { approved: boolean; children: ReactNode }) {
  return <div className={`approval-wipe${approved ? ' is-approved' : ''}`}>{children}</div>
}

/** Per-channel publish progress bar. */
export function PublishProgress({
  channels,
}: {
  channels: {
    id: string
    label: string
    progress: number
    state: 'pending' | 'running' | 'done' | 'failed'
  }[]
}) {
  return (
    <div className="publish-progress stack" style={{ gap: 'var(--space-3)' }}>
      {channels.map((c) => (
        <div key={c.id}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="type-caption">{c.label}</span>
            <span className="type-caption" data-state={c.state}>
              {c.state === 'done'
                ? 'Done'
                : c.state === 'failed'
                  ? 'Failed'
                  : `${Math.round(c.progress * 100)}%`}
            </span>
          </div>
          <div className="publish-progress__track">
            <motion.div
              className="publish-progress__fill"
              data-state={c.state}
              initial={false}
              animate={{ width: `${Math.min(100, Math.max(0, c.progress * 100))}%` }}
              transition={{ type: 'tween', duration: durSlow, ease: easeOut }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
