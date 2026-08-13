'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { tween } from '@/components/motion'
import { Icon } from '@/components/icon'

const LOOP = [
  { label: 'Plan', detail: 'Strategy from a single brief' },
  { label: 'Approve', detail: 'Every asset reviewed by you' },
  { label: 'Publish', detail: 'Channels on one calendar' },
  { label: 'Measure', detail: 'Reach, leads, and ROAS' },
] as const

/**
 * Public landing — interactive stage + clear login doors.
 * Hero text is static (no opacity gate) so content always paints.
 */
export function LandingView() {
  const reduce = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState({ x: 0.55, y: 0.35 })

  useEffect(() => {
    if (reduce) return
    const el = stageRef.current
    if (!el) return
    function onMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect()
      setPointer({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      })
    }
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [reduce])

  return (
    <div className="landing" ref={stageRef}>
      <LandingMotionBackground pointer={pointer} reduce={Boolean(reduce)} />

      <header className="landing__nav">
        <Link href="/" className="landing__brand" aria-label="Marketing OS home">
          <span className="landing__mark" aria-hidden />
          <span className="landing__brand-name">Marketing OS</span>
        </Link>
        <nav className="landing__logins" aria-label="Sign in">
          <Link href="/login" className="landing__login-link">
            Workspace sign in
          </Link>
          <Link href="/register" className="landing__login-link">
            Create account
          </Link>
          <Link href="/platform/login" className="landing__login-link landing__login-link--quiet">
            Operator
          </Link>
          <Link href="/login" className="btn primary sm">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="landing__hero">
        <div className="landing__copy">
          <p className="landing__brand-hero">Marketing OS</p>
          <h1 className="landing__headline">Your AI marketing team in one platform</h1>
          <p className="landing__sub">
            Generate campaigns, approve every asset, publish across channels, and measure what
            worked — in one workspace.
          </p>
          <div className="landing__ctas">
            <Link href="/login" className="btn primary">
              Sign in to workspace
            </Link>
            <Link href="/register" className="btn">
              Create account
            </Link>
          </div>
        </div>

        <div className="landing__doors">
          <p className="landing__doors-label type-label">Logins</p>
          <div className="landing__door-row">
            <Link href="/login" className="landing__door">
              <span className="landing__door-icon" aria-hidden>
                <Icon name="building" size={18} />
              </span>
              <span className="landing__door-title">Workspace</span>
              <span className="landing__door-copy">
                For marketers running campaigns day to day.
              </span>
              <span className="landing__door-action">
                Sign in <Icon name="arrow-left" size={14} style={{ transform: 'rotate(180deg)' }} />
              </span>
            </Link>
            <Link href="/register" className="landing__door">
              <span className="landing__door-icon" aria-hidden>
                <Icon name="users" size={18} />
              </span>
              <span className="landing__door-title">New organisation</span>
              <span className="landing__door-copy">Create a workspace and invite your team.</span>
              <span className="landing__door-action">
                Register{' '}
                <Icon name="arrow-left" size={14} style={{ transform: 'rotate(180deg)' }} />
              </span>
            </Link>
            <Link href="/platform/login" className="landing__door">
              <span className="landing__door-icon" aria-hidden>
                <Icon name="shield" size={18} />
              </span>
              <span className="landing__door-title">Operator console</span>
              <span className="landing__door-copy">For platform operators managing tenants.</span>
              <span className="landing__door-action">
                Operator sign in{' '}
                <Icon name="arrow-left" size={14} style={{ transform: 'rotate(180deg)' }} />
              </span>
            </Link>
          </div>
        </div>
      </main>

      <section className="landing__loop" aria-label="How Marketing OS works">
        <p className="type-label landing__loop-kicker">The loop</p>
        <h2 className="landing__loop-title">From brief to results without leaving the OS</h2>
        <ol className="landing__loop-list">
          {LOOP.map((step, i) => (
            <motion.li
              key={step.label}
              className="landing__loop-item"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ ...tween, delay: i * 0.06 }}
            >
              <span className="landing__loop-index strat-mono">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="landing__loop-label">{step.label}</p>
                <p className="landing__loop-detail type-secondary">{step.detail}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      <footer className="landing__foot">
        <p className="type-caption">Marketing OS</p>
        <div className="landing__foot-links">
          <Link href="/login">Workspace sign in</Link>
          <Link href="/register">Create account</Link>
          <Link href="/platform/login">Operator</Link>
        </div>
      </footer>
    </div>
  )
}

function LandingMotionBackground({
  pointer,
  reduce,
}: {
  pointer: { x: number; y: number }
  reduce: boolean
}) {
  const glowX = `${pointer.x * 100}%`
  const glowY = `${pointer.y * 100}%`

  return (
    <div className="landing__stage" aria-hidden>
      <div
        className="landing__glow"
        style={
          reduce
            ? undefined
            : ({
                '--glow-x': glowX,
                '--glow-y': glowY,
              } as CSSProperties)
        }
      />
      <div className="landing__grid" />
      <svg className="landing__orbit" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="landing-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--cobalt-600)" stopOpacity="0" />
            <stop offset="40%" stopColor="var(--cobalt-600)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--slate-600)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!reduce ? (
          <>
            <motion.path
              d="M80 420 C 280 180, 520 620, 760 280 S 1100 120, 1180 360"
              fill="none"
              stroke="url(#landing-line)"
              strokeWidth="1.5"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.path
              d="M40 560 C 240 700, 480 240, 720 520 S 1020 640, 1160 400"
              fill="none"
              stroke="var(--slate-600)"
              strokeOpacity="0.25"
              strokeWidth="1"
              strokeDasharray="6 10"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </>
        ) : (
          <path
            d="M80 420 C 280 180, 520 620, 760 280 S 1100 120, 1180 360"
            fill="none"
            stroke="var(--cobalt-600)"
            strokeOpacity="0.25"
            strokeWidth="1.5"
          />
        )}
        {(
          [
            [180, 360],
            [420, 280],
            [640, 400],
            [880, 260],
            [1040, 380],
          ] as const
        ).map(([cx, cy], i) => (
          <motion.circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={reduce ? 4 : 5}
            fill="var(--surface-raised)"
            stroke="var(--cobalt-600)"
            strokeWidth="1.5"
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...tween, delay: 0.35 + i * 0.08 }}
          />
        ))}
      </svg>
      {!reduce ? (
        <motion.div
          className="landing__pulse"
          animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.04, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
    </div>
  )
}
