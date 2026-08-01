'use client'

import { motion, MotionConfig, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

/* ────────────────────────────────────────────────────────────────────────────
 * Motion primitives. All entrance animation in the app goes through these so
 * every page shares the same spring physics and honours prefers-reduced-motion
 * (MotionConfig reducedMotion="user" disables transforms for those users).
 * ──────────────────────────────────────────────────────────────────────────── */

/** The house spring: snappy with a hint of bounce. */
export const spring = { type: 'spring', mass: 1, damping: 15, stiffness: 120 } as const

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: spring },
}

/** Wrap a page (or any subtree) so all nested motion respects user settings. */
export function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/** Fade + rise in when mounted. `delay` staggers siblings manually if needed. */
export function FadeIn({
  children,
  delay = 0,
  ...rest
}: { children: ReactNode; delay?: number } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay }}
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
  interval = 0.07,
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

/** Press feedback for interactive cards/tiles (scale on tap, lift on hover). */
export function Pressable({ children, ...rest }: { children: ReactNode } & HTMLMotionProps<'div'>) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={spring} {...rest}>
        {children}
      </motion.div>
    </MotionConfig>
  )
}
