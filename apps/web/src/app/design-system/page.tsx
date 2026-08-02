'use client'

/* ────────────────────────────────────────────────────────────────────────────
 * /design-system — the living reference for docs/DESIGN_BRIEF.md Part 1.
 *
 * Every value on this page is read from a CSS custom property, never retyped as
 * a literal. If a token changes in globals.css, this page changes with it — and
 * if a swatch here looks wrong, the token is wrong. It is the acceptance surface
 * for Phase 2 and the specification the Phase 3 primitives are built against.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react'

const THEME_KEY = 'vsp:theme'

const SURFACES = [
  ['--surface-canvas', 'Page background'],
  ['--surface-raised', 'Cards, panels, rows'],
  ['--surface-sunken', 'Wells, table heads, disabled'],
  ['--surface-inverse', 'Inverted bars, tooltips'],
  ['--surface-hover', 'Hover on a raised surface'],
  ['--surface-selected', 'Selected row, active nav'],
]

const BORDERS = [
  ['--border-subtle', 'Dividers inside a card'],
  ['--border-default', 'Card and input outlines'],
  ['--border-strong', 'Emphasis, dragged edges'],
  ['--border-focus', 'Focus ring'],
]

const TEXT = [
  ['--text-primary', 'Body copy, headings, numbers'],
  ['--text-secondary', 'Helper text, metadata, glyphs'],
  ['--text-tertiary', 'Placeholders, timestamps'],
  ['--text-link', 'Links'],
]

const RAMP = [
  ['cobalt', 'Primary action, selected nav, links'],
  ['amber', 'RESERVED — human decision required'],
  ['jade', 'Live, approved, published, positive delta'],
  ['crimson', 'Rejected, failed, negative delta, destructive'],
  ['iris', 'AI-generated, not yet reviewed'],
]

const TYPE_RAMP: [string, string, string][] = [
  ['--type-metric-hero', '36/40 · 500 · -0.02em · Plex Mono', '128,400'],
  ['--type-metric', '28/32 · 500 · -0.02em · Plex Mono', '4,812'],
  ['--type-title', '22/28 · 500 · -0.01em', 'Review queue'],
  ['--type-section', '18/24 · 500 · -0.01em', 'Channel performance'],
  ['--type-subhead', '15/22 · 500', 'Spring collection launch'],
  [
    '--type-body',
    '14/21 · 400 — the default',
    'Body is 14px. This is software people live in for hours.',
  ],
  ['--type-body-strong', '14/21 · 500', 'Approve and schedule'],
  ['--type-secondary', '13/19 · 400', 'Generated 4 minutes ago by the campaign planner'],
  ['--type-caption', '12/16 · 400', 'Last synced 09:41'],
  ['--type-label', '11/14 · 500 · 0.06em · uppercase', 'Needs review'],
]

const STATUSES: {
  label: string
  hue: string
  rail: 'none' | 'solid' | 'dashed' | 'pulse'
  meaning: string
}[] = [
  { label: 'Draft', hue: 'slate', rail: 'none', meaning: 'Started, not submitted' },
  {
    label: 'AI draft',
    hue: 'iris',
    rail: 'solid',
    meaning: 'Written by the AI, nobody has looked',
  },
  { label: 'Needs review', hue: 'amber', rail: 'solid', meaning: 'Waiting on a human decision' },
  { label: 'Needs changes', hue: 'amber', rail: 'dashed', meaning: 'Sent back for a revision' },
  { label: 'Approved', hue: 'jade', rail: 'solid', meaning: 'Vetted, ready to schedule' },
  { label: 'Scheduled', hue: 'cobalt', rail: 'solid', meaning: 'Queued for a publish time' },
  { label: 'Publishing', hue: 'cobalt', rail: 'solid', meaning: 'The worker is pushing it out' },
  { label: 'Live', hue: 'jade', rail: 'pulse', meaning: 'Out in the world right now' },
  {
    label: 'Rejected',
    hue: 'crimson',
    rail: 'solid',
    meaning: 'Turned down, feeds the next prompt',
  },
  { label: 'Failed', hue: 'crimson', rail: 'solid', meaning: 'The platform refused it' },
  { label: 'Completed', hue: 'slate', rail: 'none', meaning: 'Finished and archived' },
]

const DENSITY = [
  ['Table row', '44px comfortable / 36px compact'],
  ['Input, select, button', '36px default · 32px small · 44px large'],
  ['Sidebar item', '36px'],
  ['Top bar', '56px'],
  ['Sidebar width', '244px expanded / 60px collapsed'],
  ['Card padding', '20px'],
  ['Page gutter', '24px'],
]

function Swatch({ token, use }: { token: string; use: string }) {
  return (
    <div className="ds-swatch">
      <div className="chip" style={{ background: `var(${token})` }} />
      <div className="meta">
        <div className="name">{use}</div>
        <div className="value">{token}</div>
      </div>
    </div>
  )
}

function Triad({ hue, use }: { hue: string; use: string }) {
  return (
    <div className="ds-triad">
      <div className="mark" style={{ background: `var(--${hue}-600)` }} />
      <div>
        <span
          className="pair"
          style={{ background: `var(--${hue}-100)`, color: `var(--${hue}-800)` }}
        >
          {hue}-800 on {hue}-100
        </span>
        <div className="use">{use}</div>
      </div>
    </div>
  )
}

function StatusRow({ status }: { status: (typeof STATUSES)[number] }) {
  const railStyle =
    status.rail === 'none'
      ? { borderLeftColor: 'transparent' }
      : {
          borderLeftColor: `var(--${status.hue}-600)`,
          borderLeftStyle: status.rail === 'dashed' ? ('dashed' as const) : ('solid' as const),
        }
  return (
    <tr>
      <td>
        <div className="ds-railed" style={railStyle}>
          <span
            className="ds-pill"
            style={{
              background: `var(--${status.hue}-100)`,
              color: status.hue === 'slate' ? 'var(--text-secondary)' : `var(--${status.hue}-800)`,
            }}
          >
            {status.rail === 'pulse' ? <span className="ds-dot" /> : null}
            {status.label}
          </span>
        </div>
      </td>
      <td className="num">{status.hue}</td>
      <td className="num">
        {status.rail === 'none'
          ? '—'
          : status.rail === 'dashed'
            ? '3px dashed'
            : status.rail === 'pulse'
              ? '3px + pulse dot'
              : '3px'}
      </td>
      <td style={{ color: 'var(--text-secondary)' }}>{status.meaning}</td>
    </tr>
  )
}

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    setTheme(document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light')
  }, [])

  function flipTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    if (next === 'dark') document.documentElement.dataset['theme'] = 'dark'
    else delete document.documentElement.dataset['theme']
    try {
      window.localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }

  return (
    <main className="ds-page">
      <header className="ds-head">
        <div>
          <h1 className="type-title">Design system</h1>
          <p className="ds-note" style={{ marginTop: 8 }}>
            Every token in <code className="mono">globals.css</code>, rendered from the token
            itself. This is the reference the product is built against — if something here looks
            wrong, the token is wrong, not the page.
          </p>
        </div>
        <button className="btn" onClick={flipTheme}>
          View in {theme === 'dark' ? 'light' : 'dark'}
        </button>
      </header>

      <section className="ds-section">
        <h2>The three rules</h2>
        <p className="ds-note">
          The product is a decision surface. The AI does the work; the human&apos;s job is judgment.
          Everything below serves that.
        </p>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--iris-600)' }}>
              Rule 1
            </div>
            <p className="type-body" style={{ marginTop: 8 }}>
              AI output looks provisional until a human approves it — iris surface, 3px iris rail,
              an &quot;AI draft&quot; label. Approval resolves it to white with a jade rail.
            </p>
          </div>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--text-secondary)' }}>
              Rule 2
            </div>
            <p className="type-body" style={{ marginTop: 8 }}>
              Colour means status. Nothing else. Channel glyphs are monochrome; a coloured pixel
              always means something.
            </p>
          </div>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--amber-600)' }}>
              Rule 3
            </div>
            <p className="type-body" style={{ marginTop: 8 }}>
              Amber means &quot;you need to decide&quot;, and appears nowhere else — not on
              warnings, not on charts.
            </p>
          </div>
        </div>

        <div className={`ds-draft ${approved ? 'approved' : ''}`} style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <span
                className="ds-pill"
                style={
                  approved
                    ? { background: 'var(--jade-100)', color: 'var(--jade-800)' }
                    : { background: 'var(--iris-100)', color: 'var(--iris-800)' }
                }
              >
                {approved ? 'Approved' : 'AI draft'}
              </span>
              <div className="type-subhead" style={{ marginTop: 10 }}>
                Spring collection — launch post
              </div>
              <div className="type-secondary" style={{ color: 'var(--text-secondary)' }}>
                {approved
                  ? 'Approved by you. Ready to schedule.'
                  : 'Written by the campaign planner. Nobody has reviewed it yet.'}
              </div>
            </div>
            <button className="btn primary" onClick={() => setApproved((v) => !v)}>
              {approved ? 'Undo' : 'Approve'}
            </button>
          </div>
        </div>
      </section>

      <section className="ds-section">
        <h2>Surfaces</h2>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {SURFACES.map(([token, use]) => (
            <Swatch key={token} token={token!} use={use!} />
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2>Borders and text</h2>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {BORDERS.map(([token, use]) => (
            <Swatch key={token} token={token!} use={use!} />
          ))}
          {TEXT.map(([token, use]) => (
            <Swatch key={token} token={token!} use={use!} />
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2>Semantic ramp</h2>
        <p className="ds-note">
          One meaning each. Every <code className="mono">-600</code> on its matching{' '}
          <code className="mono">-100</code> tint clears WCAG AA at 14px. Never put a{' '}
          <code className="mono">-600</code> on white for body copy, and never put white on a{' '}
          <code className="mono">-100</code>.
        </p>
        <div className="ds-panel" style={{ marginTop: 20 }}>
          {RAMP.map(([hue, use]) => (
            <Triad key={hue} hue={hue!} use={use!} />
          ))}
          <div className="ds-triad">
            <div className="mark" style={{ background: 'var(--slate-600)' }} />
            <div>
              <span
                className="pair"
                style={{ background: 'var(--slate-100)', color: 'var(--text-secondary)' }}
              >
                text-secondary on slate-100
              </span>
              <div className="use">Draft, paused, archived, neutral</div>
            </div>
          </div>
        </div>
      </section>

      <section className="ds-section">
        <h2>Chart ramp</h2>
        <p className="ds-note">
          Categorical, used only inside charts and never in UI chrome. Series must also differ by
          dash pattern or marker shape, not colour alone.
        </p>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Swatch key={n} token={`--chart-${n}`} use={`Series ${n}`} />
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2>Type</h2>
        <p className="ds-note">
          Two families, self-hosted: General Sans for the interface, IBM Plex Mono for every metric,
          currency, ID, timestamp and percentage. Body is 14px.
        </p>
        <div className="ds-panel" style={{ marginTop: 20 }}>
          {TYPE_RAMP.map(([token, spec, sample]) => (
            <div key={token} className="ds-specimen">
              <div className="spec">
                {token}
                <br />
                {spec}
              </div>
              <div className={`type-${token!.replace('--type-', '')}`}>{sample}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2>Status vocabulary</h2>
        <p className="ds-note">
          Used identically everywhere. Phase 3 turns this table into{' '}
          <code className="mono">StatusPill</code> and <code className="mono">StatusRail</code> —
          after that, no screen hand-rolls a status again.
        </p>
        <table className="ds-table">
          <thead>
            <tr>
              <th>State</th>
              <th>Hue</th>
              <th>Rail</th>
              <th>Means</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((s) => (
              <StatusRow key={s.label} status={s} />
            ))}
          </tbody>
        </table>
      </section>

      <section className="ds-section">
        <h2>Space, radius, elevation</h2>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--text-tertiary)' }}>
              Space — 4px base
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div key={n} className="row" style={{ gap: 12 }}>
                  <span
                    style={{
                      height: 8,
                      width: `var(--space-${n})`,
                      background: 'var(--cobalt-600)',
                    }}
                  />
                  <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
                    --space-{n}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--text-tertiary)' }}>
              Radius
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {[
                ['sm', 'Pills, badges, tags'],
                ['md', 'Inputs, buttons'],
                ['lg', 'Cards, panels'],
                ['xl', 'Modals, drawers'],
              ].map(([k, use]) => (
                <div key={k} className="row" style={{ gap: 12 }}>
                  <span
                    style={{
                      width: 44,
                      height: 30,
                      border: '1px solid var(--border-default)',
                      borderRadius: `var(--radius-${k})`,
                      background: 'var(--surface-sunken)',
                      flexShrink: 0,
                    }}
                  />
                  <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                    {use}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ds-panel">
            <div className="type-label" style={{ color: 'var(--text-tertiary)' }}>
              Elevation
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
              {[
                ['1', 'Raised card'],
                ['2', 'Dropdown, popover'],
                ['3', 'Modal, drawer'],
              ].map(([k, use]) => (
                <div
                  key={k}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--surface-raised)',
                    boxShadow: `var(--elev-${k})`,
                  }}
                >
                  <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
                    --elev-{k}
                  </span>
                  <div className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                    {use}
                  </div>
                </div>
              ))}
              <p className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                Never more than two floating layers at once. A third means it should have been a
                full page.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ds-section">
        <h2>Density</h2>
        <table className="ds-table">
          <thead>
            <tr>
              <th>Element</th>
              <th>Height</th>
            </tr>
          </thead>
          <tbody>
            {DENSITY.map(([element, height]) => (
              <tr key={element}>
                <td>{element}</td>
                <td className="num">{height}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ds-section">
        <h2>Motion</h2>
        <p className="ds-note">
          Three moments are allowed to be expressive because each carries information: assets
          arriving as generation finishes, the iris rail wiping to jade on approval, and a
          per-channel publish line ticking to jade. Everywhere else: opacity and 2–4px transforms,
          all wrapped in <code className="mono">prefers-reduced-motion</code>.
        </p>
        <table className="ds-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Value</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">--dur-fast</td>
              <td className="num">120ms</td>
              <td style={{ color: 'var(--text-secondary)' }}>Hover, focus</td>
            </tr>
            <tr>
              <td className="num">--dur-base</td>
              <td className="num">200ms</td>
              <td style={{ color: 'var(--text-secondary)' }}>Dropdown, tab switch</td>
            </tr>
            <tr>
              <td className="num">--dur-slow</td>
              <td className="num">320ms</td>
              <td style={{ color: 'var(--text-secondary)' }}>Drawer, modal, page transition</td>
            </tr>
            <tr>
              <td className="num">--ease-out</td>
              <td className="num">cubic-bezier(.2,0,0,1)</td>
              <td style={{ color: 'var(--text-secondary)' }}>Everything</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  )
}
