'use client'

import { motion, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

import { tween } from '@/components/motion'

/**
 * The connected-modules motif.
 *
 * Stands in for the reference's isometric render: nodes wired into one another,
 * a few resolved to solid ink. Drawn rather than shipped as an image so it
 * re-tints with the theme and costs nothing to load. Decorative — never read.
 */
const NODES: { x: number; y: number; size: number; ink?: boolean }[] = [
  { x: 92, y: 122, size: 64 },
  { x: 228, y: 68, size: 52 },
  { x: 186, y: 206, size: 72, ink: true },
  { x: 70, y: 290, size: 58 },
  { x: 282, y: 282, size: 66, ink: true },
  { x: 154, y: 394, size: 64 },
  { x: 278, y: 468, size: 78, ink: true },
]

const EDGES = [
  'M92,122 Q160,70 228,68',
  'M92,122 Q140,150 186,206',
  'M186,206 Q240,220 282,282',
  'M92,122 Q60,200 70,290',
  'M70,290 Q100,350 154,394',
  'M186,206 Q170,300 154,394',
  'M282,282 Q300,380 278,468',
  'M154,394 Q220,420 278,468',
]

function ModuleLattice() {
  return (
    <svg
      className="auth-panel__art"
      viewBox="0 0 360 540"
      fill="none"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      {EDGES.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      {NODES.map((n) => (
        <g key={`${String(n.x)}-${String(n.y)}`}>
          <rect
            x={n.x - n.size / 2}
            y={n.y - n.size / 2}
            width={n.size}
            height={n.size}
            rx={n.size * 0.28}
            fill="currentColor"
            fillOpacity={n.ink ? 0.92 : 0.1}
            stroke="currentColor"
            strokeOpacity={n.ink ? 0 : 0.25}
            strokeWidth={1.5}
          />
          {/* A highlight on the upper edge gives the tile a little dimension. */}
          <rect
            x={n.x - n.size / 2 + n.size * 0.16}
            y={n.y - n.size / 2 + n.size * 0.14}
            width={n.size * 0.68}
            height={n.size * 0.16}
            rx={n.size * 0.08}
            fill="currentColor"
            fillOpacity={n.ink ? 0.18 : 0.14}
          />
        </g>
      ))}
    </svg>
  )
}

/**
 * Shared frame for every authentication and workspace-creation screen.
 *
 * Split 50/50: a full-bleed panel carrying the product statement on the left,
 * the form on a raised card to the right. The panel is decorative and is hidden
 * entirely below the tablet breakpoint, where the form takes the whole page.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  panelTitle,
  panelSubtitle,
  tone = 'light',
  wide = false,
}: {
  title: string
  subtitle?: string | undefined
  children: ReactNode
  footer?: ReactNode | undefined
  panelTitle: string
  panelSubtitle?: string | undefined
  tone?: 'light' | 'dark' | undefined
  wide?: boolean | undefined
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="auth-split">
        <aside className={`auth-panel auth-panel--${tone}`} aria-hidden>
          <ModuleLattice />
          <div className="auth-panel__copy">
            <h2 className="auth-panel__title">{panelTitle}</h2>
            {panelSubtitle ? <p className="auth-panel__sub">{panelSubtitle}</p> : null}
          </div>
        </aside>

        <main className="auth-main">
          <motion.div
            className={['auth-card', wide ? 'auth-card--wide' : ''].join(' ').trim()}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tween}
          >
            <h1 className="auth-card__title">{title}</h1>
            {subtitle ? <p className="auth-card__sub">{subtitle}</p> : null}
            {children}
          </motion.div>
          {footer ? <div className="auth-main__foot">{footer}</div> : null}
        </main>
      </div>
    </MotionConfig>
  )
}
