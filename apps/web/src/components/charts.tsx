'use client'

/* ────────────────────────────────────────────────────────────────────────────
 * Dependency-free charts.
 *
 * Every chart here is hand-rolled inline SVG — no charting library, no runtime
 * dependency. They are sized with a `viewBox` and stretch to their container, so
 * they are responsive and never overflow horizontally. Colours come from the
 * design-system CSS variables (`--color-primary`, `--text`, `--text-muted`,
 * `--border`) so a chart re-skins with the tenant's branding and stays legible
 * against the dark surface. Values are the caller's; these components invent
 * nothing — an empty series renders an honest empty state, not a fake line.
 * ──────────────────────────────────────────────────────────────────────────── */

const PRIMARY = 'var(--color-primary)'
const AXIS = 'var(--border-strong, var(--border))'
const GRID = 'var(--border)'
const MUTED = 'var(--text-muted)'

function EmptyChart({ height = 200, label = 'No data' }: { height?: number; label?: string }) {
  return (
    <div
      className="dim"
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
      }}
    >
      {label}
    </div>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

// ── Line chart ──────────────────────────────────────────────────────────────
export function LineChart({
  data,
  height = 220,
  color = PRIMARY,
  valueFormat,
}: {
  data: { label: string; value: number }[]
  height?: number | undefined
  color?: string | undefined
  valueFormat?: ((v: number) => string) | undefined
}) {
  if (data.length === 0) return <EmptyChart height={height} />

  const W = 600
  const H = 220
  const padL = 44
  const padR = 16
  const padT = 14
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const values = data.map((d) => d.value)
  const max = niceMax(Math.max(...values, 0))
  const n = data.length
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => padT + plotH - (v / max) * plotH

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(2)},${(padT + plotH).toFixed(2)} L${x(0).toFixed(2)},${(padT + plotH).toFixed(2)} Z`

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const fmt = valueFormat ?? ((v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)))
  const last = data[n - 1]
  const gradId = `lc-grad-${Math.round(max)}-${n}`

  // Show at most ~7 x labels to avoid collisions.
  const labelEvery = Math.max(1, Math.ceil(n / 7))

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridLines.map((g) => {
          const gy = padT + plotH - g * plotH
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={GRID} strokeWidth={1} />
              <text x={padL - 8} y={gy + 3} textAnchor="end" fontSize={10} fill={MUTED}>
                {fmt(max * g)}
              </text>
            </g>
          )
        })}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {last ? (
          <>
            <circle cx={x(n - 1)} cy={y(last.value)} r={3.5} fill={color} />
            <text x={Math.min(x(n - 1), W - padR - 2)} y={Math.max(y(last.value) - 8, 12)} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--text)">
              {fmt(last.value)}
            </text>
          </>
        ) : null}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d.label + String(i)} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={MUTED}>
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

// ── Bar chart ───────────────────────────────────────────────────────────────
export function BarChart({
  data,
  height = 220,
  color = PRIMARY,
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
}) {
  if (data.length === 0) return <EmptyChart height={height} />

  const W = 600
  const H = 220
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const n = data.length
  const slot = plotW / n
  const barW = Math.min(46, slot * 0.62)
  const y = (v: number) => padT + plotH - (v / max) * plotH

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((g) => {
          const gy = padT + plotH - g * plotH
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={GRID} strokeWidth={1} />
              <text x={padL - 8} y={gy + 3} textAnchor="end" fontSize={10} fill={MUTED}>
                {Math.round(max * g).toLocaleString()}
              </text>
            </g>
          )
        })}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke={AXIS} strokeWidth={1} />

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2
          const bh = Math.max(0, padT + plotH - y(d.value))
          return (
            <g key={d.label + String(i)}>
              <rect x={cx - barW / 2} y={y(d.value)} width={barW} height={bh} rx={4} fill={color} opacity={0.9} />
              {d.value > 0 ? (
                <text x={cx} y={y(d.value) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text)">
                  {d.value.toLocaleString()}
                </text>
              ) : null}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill={MUTED}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Sparkline ───────────────────────────────────────────────────────────────
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = PRIMARY,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length === 0) return null
  const W = 100
  const H = 30
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const n = values.length
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => H - 3 - ((v - min) / range) * (H - 6)
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={height} preserveAspectRatio="none" role="img" style={{ display: 'block' }}>
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ── Donut chart ─────────────────────────────────────────────────────────────
const DONUT_COLORS = [
  'var(--color-primary)',
  'var(--color-accent)',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#f87171',
]

export function DonutChart({
  segments,
  size = 200,
  centerLabel = 'Total',
}: {
  segments: { label: string; value: number; color?: string }[]
  size?: number
  centerLabel?: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total <= 0) return <EmptyChart height={size} />

  const R = 60
  const C = 2 * Math.PI * R
  const stroke = 22
  let offset = 0

  return (
    <div className="row" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 80 80)">
          <circle cx={80} cy={80} r={R} fill="none" stroke={GRID} strokeWidth={stroke} />
          {segments.map((seg, i) => {
            const frac = seg.value / total
            const len = frac * C
            const el = (
              <circle
                key={seg.label + String(i)}
                cx={80}
                cy={80}
                r={R}
                fill="none"
                stroke={seg.color ?? DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x={80} y={74} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--text)">
          {total.toLocaleString()}
        </text>
        <text x={80} y={94} textAnchor="middle" fontSize={11} fill={MUTED}>
          {centerLabel}
        </text>
      </svg>

      <div className="stack" style={{ gap: 8, minWidth: 140 }}>
        {segments.map((seg, i) => (
          <div key={seg.label + String(i)} className="spread" style={{ gap: 12, fontSize: 12.5 }}>
            <span className="row" style={{ gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: seg.color ?? DONUT_COLORS[i % DONUT_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text)' }}>{seg.label}</span>
            </span>
            <span className="dim">{seg.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
