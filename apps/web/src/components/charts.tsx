'use client'

/* ────────────────────────────────────────────────────────────────────────────
 * Dependency-free charts.
 *
 * Every chart here is hand-rolled inline SVG — no charting library, no runtime
 * dependency. They are sized with a `viewBox` and stretch to their container, so
 * they are responsive and never overflow horizontally. Colours come from the
 * design-system CSS variables. Series colour comes from the categorical chart
 * ramp (`--chart-1` … `--chart-6`, design brief 1.2), which exists only inside
 * charts — never in UI chrome, and never carrying status meaning. Values are the
 * caller's; these components invent nothing — an empty series renders an honest
 * empty state, not a fake line.
 *
 * Multi-series charts differ by dash pattern / marker (or hatch), not colour
 * alone. SVG numerals use mono + tabular figures. Every chart SVG carries a
 * `<title>` and `aria-label`, and exposes an export control that downloads the
 * current SVG markup.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useId, useRef, type CSSProperties, type ReactNode } from 'react'

import { Icon } from '@/components/icon'

const PRIMARY = 'var(--chart-1)'
const AXIS = 'var(--border-strong, var(--border))'
const GRID = 'var(--border)'
const MUTED = 'var(--text-muted)'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const

/** Dash patterns — series must differ by more than colour (brief 1.2). */
const SERIES_DASH = ['none', '6 4', '2 3', '8 3 2 3', '1 2.5', '10 3 2 3'] as const

type MarkerKind = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross' | 'plus'

const SERIES_MARKERS: MarkerKind[] = ['circle', 'square', 'diamond', 'triangle', 'cross', 'plus']

const NUM_STYLE: CSSProperties = {
  fontFamily: 'var(--font-code)',
  fontVariantNumeric: 'tabular-nums',
}

export type ChartPoint = { label: string; value: number }

export type ChartSeries = {
  name: string
  data: ChartPoint[]
  color?: string | undefined
}

function EmptyChart({
  height = 200,
  label = 'No data',
}: {
  height?: number | undefined
  label?: string | undefined
}) {
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

function defaultFmt(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)
}

function downloadSvg(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  const markup = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function slugFilename(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'chart'}.svg`
}

function ChartExportShell({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', overflowX: 'hidden' }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Export ${title} as SVG`}
        title="Export SVG"
        onClick={() => {
          const svg = ref.current?.querySelector('svg')
          if (svg) downloadSvg(svg, slugFilename(title))
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1,
          opacity: 0.55,
        }}
      >
        <Icon name="download" size={14} />
      </button>
      {children}
    </div>
  )
}

function SeriesMarker({
  kind,
  cx,
  cy,
  color,
  size = 3.5,
}: {
  kind: MarkerKind
  cx: number
  cy: number
  color: string
  size?: number | undefined
}) {
  const s = size
  switch (kind) {
    case 'square':
      return <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill={color} />
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - s * 1.3} ${cx + s * 1.3},${cy} ${cx},${cy + s * 1.3} ${cx - s * 1.3},${cy}`}
          fill={color}
        />
      )
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - s * 1.4} ${cx + s * 1.3},${cy + s} ${cx - s * 1.3},${cy + s}`}
          fill={color}
        />
      )
    case 'cross':
      return (
        <g stroke={color} strokeWidth={1.5} strokeLinecap="round">
          <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
          <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} />
        </g>
      )
    case 'plus':
      return (
        <g stroke={color} strokeWidth={1.5} strokeLinecap="round">
          <line x1={cx - s} y1={cy} x2={cx + s} y2={cy} />
          <line x1={cx} y1={cy - s} x2={cx} y2={cy + s} />
        </g>
      )
    default:
      return <circle cx={cx} cy={cy} r={s} fill={color} />
  }
}

function normalizeSeries(
  data: ChartPoint[] | undefined,
  series: ChartSeries[] | undefined,
  color: string | undefined,
): ChartSeries[] {
  if (series && series.length > 0) return series
  if (data && data.length > 0) {
    return [{ name: 'Series', data, color: color ?? PRIMARY }]
  }
  return []
}

function sharedLabels(series: ChartSeries[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const s of series) {
    for (const p of s.data) {
      if (!seen.has(p.label)) {
        seen.add(p.label)
        labels.push(p.label)
      }
    }
  }
  return labels
}

function valueAt(series: ChartSeries, label: string): number {
  const hit = series.data.find((d) => d.label === label)
  return hit?.value ?? 0
}

// ── Line chart ──────────────────────────────────────────────────────────────
export function LineChart({
  data,
  series,
  height = 220,
  color = PRIMARY,
  valueFormat,
  title = 'Line chart',
}: {
  data?: ChartPoint[] | undefined
  series?: ChartSeries[] | undefined
  height?: number | undefined
  color?: string | undefined
  valueFormat?: ((v: number) => string) | undefined
  title?: string | undefined
}) {
  const uid = useId().replace(/:/g, '')
  const resolved = normalizeSeries(data, series, color)
  if (resolved.length === 0 || resolved.every((s) => s.data.length === 0)) {
    return <EmptyChart height={height} />
  }

  const W = 600
  const H = 220
  const padL = 44
  const padR = 16
  const padT = 14
  const padB = resolved.length > 1 ? 42 : 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const labels = sharedLabels(resolved)
  const n = labels.length
  const allValues = resolved.flatMap((s) => s.data.map((d) => d.value))
  const max = niceMax(Math.max(...allValues, 0))
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => padT + plotH - (v / max) * plotH

  const fmt = valueFormat ?? defaultFmt
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(n / 7))
  const multi = resolved.length > 1
  const ariaLabel = `${title}: ${resolved.map((s) => s.name).join(', ')}`

  return (
    <ChartExportShell title={title}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{title}</title>
        <defs>
          {resolved.map((s, si) => {
            const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]
            const gradId = `lc-grad-${uid}-${si}`
            return (
              <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={multi ? 0.12 : 0.28} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>

        {gridLines.map((g) => {
          const gy = padT + plotH - g * plotH
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={GRID} strokeWidth={1} />
              <text
                x={padL - 8}
                y={gy + 3}
                textAnchor="end"
                fontSize={10}
                fill={MUTED}
                style={NUM_STYLE}
              >
                {fmt(max * g)}
              </text>
            </g>
          )
        })}

        {resolved.map((s, si) => {
          const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]!
          const dash = SERIES_DASH[si % SERIES_DASH.length]!
          const marker = SERIES_MARKERS[si % SERIES_MARKERS.length]!
          const pts = labels.map((label, i) => ({ i, v: valueAt(s, label) }))
          const line = pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`)
            .join(' ')
          // Area fill only for the first / sole series to keep overlays readable.
          const area =
            si === 0
              ? `${line} L${x(n - 1).toFixed(2)},${(padT + plotH).toFixed(2)} L${x(0).toFixed(2)},${(padT + plotH).toFixed(2)} Z`
              : null

          return (
            <g key={s.name + String(si)}>
              {area ? <path d={area} fill={`url(#lc-grad-${uid}-${si})`} /> : null}
              <path
                d={line}
                fill="none"
                stroke={c}
                strokeWidth={2}
                strokeDasharray={dash === 'none' ? undefined : dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((p) =>
                multi || p.i === n - 1 ? (
                  <SeriesMarker
                    key={`${s.name}-${p.i}`}
                    kind={marker}
                    cx={x(p.i)}
                    cy={y(p.v)}
                    color={c}
                    size={multi ? 3 : 3.5}
                  />
                ) : null,
              )}
              {!multi && pts.length > 0 ? (
                <text
                  x={Math.min(x(n - 1), W - padR - 2)}
                  y={Math.max(y(pts[n - 1]!.v) - 8, 12)}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--text)"
                  style={NUM_STYLE}
                >
                  {fmt(pts[n - 1]!.v)}
                </text>
              ) : null}
            </g>
          )
        })}

        {labels.map((label, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={label + String(i)}
              x={x(i)}
              y={H - (multi ? 22 : 8)}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              style={NUM_STYLE}
            >
              {label}
            </text>
          ) : null,
        )}

        {multi
          ? resolved.map((s, si) => {
              const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]!
              const dash = SERIES_DASH[si % SERIES_DASH.length]!
              const marker = SERIES_MARKERS[si % SERIES_MARKERS.length]!
              const lx = padL + si * Math.min(120, plotW / resolved.length)
              const ly = H - 8
              return (
                <g key={`legend-${s.name}`}>
                  <line
                    x1={lx}
                    y1={ly - 3}
                    x2={lx + 16}
                    y2={ly - 3}
                    stroke={c}
                    strokeWidth={2}
                    strokeDasharray={dash === 'none' ? undefined : dash}
                  />
                  <SeriesMarker kind={marker} cx={lx + 8} cy={ly - 3} color={c} size={2.5} />
                  <text x={lx + 22} y={ly} fontSize={10} fill={MUTED}>
                    {s.name}
                  </text>
                </g>
              )
            })
          : null}
      </svg>
    </ChartExportShell>
  )
}

// ── Bar chart ───────────────────────────────────────────────────────────────
export function BarChart({
  data,
  series,
  height = 220,
  color = PRIMARY,
  title = 'Bar chart',
}: {
  data?: ChartPoint[] | undefined
  series?: ChartSeries[] | undefined
  height?: number | undefined
  color?: string | undefined
  title?: string | undefined
}) {
  const uid = useId().replace(/:/g, '')
  const resolved = normalizeSeries(data, series, color)
  if (resolved.length === 0 || resolved.every((s) => s.data.length === 0)) {
    return <EmptyChart height={height} />
  }

  const W = 600
  const H = 220
  const multi = resolved.length > 1
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = multi ? 40 : 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const labels = sharedLabels(resolved)
  const n = labels.length
  const allValues = resolved.flatMap((s) => s.data.map((d) => d.value))
  const max = niceMax(Math.max(...allValues, 0))
  const slot = plotW / n
  const groupW = Math.min(46, slot * 0.72)
  const barW = multi ? groupW / resolved.length : groupW
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ariaLabel = `${title}: ${resolved.map((s) => s.name).join(', ')}`

  return (
    <ChartExportShell title={title}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{title}</title>
        <defs>
          {resolved.map((s, si) => {
            // Hatch patterns differentiate series beyond colour (brief 1.2).
            const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]!
            const pid = `bar-hatch-${uid}-${si}`
            const patterns = [
              null, // solid
              { d: 'M0,0 l4,4', w: 4 },
              { d: 'M4,0 l-4,4', w: 4 },
              { d: 'M0,2 h4', w: 4 },
              { d: 'M2,0 v4', w: 4 },
              { d: 'M0,0 l4,4 M4,0 l-4,4', w: 4 },
            ] as const
            const pat = patterns[si % patterns.length]
            if (!pat) return null
            return (
              <pattern
                key={pid}
                id={pid}
                width={pat.w}
                height={pat.w}
                patternUnits="userSpaceOnUse"
              >
                <rect width={pat.w} height={pat.w} fill={c} opacity={0.25} />
                <path d={pat.d} stroke={c} strokeWidth={1.2} />
              </pattern>
            )
          })}
        </defs>

        {[0, 0.5, 1].map((g) => {
          const gy = padT + plotH - g * plotH
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={GRID} strokeWidth={1} />
              <text
                x={padL - 8}
                y={gy + 3}
                textAnchor="end"
                fontSize={10}
                fill={MUTED}
                style={NUM_STYLE}
              >
                {Math.round(max * g).toLocaleString()}
              </text>
            </g>
          )
        })}
        <line
          x1={padL}
          y1={padT + plotH}
          x2={W - padR}
          y2={padT + plotH}
          stroke={AXIS}
          strokeWidth={1}
        />

        {labels.map((label, i) => {
          const cx = padL + slot * i + slot / 2
          const groupLeft = cx - groupW / 2
          return (
            <g key={label + String(i)}>
              {resolved.map((s, si) => {
                const v = valueAt(s, label)
                const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]!
                const bx = multi ? groupLeft + si * barW : groupLeft
                const bh = Math.max(0, padT + plotH - y(v))
                const hatchId = `bar-hatch-${uid}-${si}`
                const useHatch = si > 0
                return (
                  <g key={s.name + String(si)}>
                    <rect
                      x={bx}
                      y={y(v)}
                      width={Math.max(1, barW - (multi ? 1 : 0))}
                      height={bh}
                      rx={3}
                      fill={useHatch ? `url(#${hatchId})` : c}
                      stroke={useHatch ? c : undefined}
                      strokeWidth={useHatch ? 1 : 0}
                      opacity={useHatch ? 1 : 0.9}
                    />
                    {!multi && v > 0 ? (
                      <text
                        x={cx}
                        y={y(v) - 5}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill="var(--text)"
                        style={NUM_STYLE}
                      >
                        {v.toLocaleString()}
                      </text>
                    ) : null}
                  </g>
                )
              })}
              <text
                x={cx}
                y={H - (multi ? 22 : 10)}
                textAnchor="middle"
                fontSize={10}
                fill={MUTED}
                style={NUM_STYLE}
              >
                {label}
              </text>
            </g>
          )
        })}

        {multi
          ? resolved.map((s, si) => {
              const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length]!
              const lx = padL + si * Math.min(120, plotW / resolved.length)
              const ly = H - 8
              return (
                <g key={`legend-${s.name}`}>
                  <rect x={lx} y={ly - 8} width={10} height={10} rx={2} fill={c} />
                  <text x={lx + 14} y={ly} fontSize={10} fill={MUTED}>
                    {s.name}
                  </text>
                </g>
              )
            })
          : null}
      </svg>
    </ChartExportShell>
  )
}

// ── Horizontal bar chart (funnel / comparison) ──────────────────────────────
export function HorizontalBarChart({
  data,
  height,
  color = PRIMARY,
  valueFormat,
  title = 'Horizontal bar chart',
}: {
  data: ChartPoint[]
  height?: number | undefined
  color?: string | undefined
  valueFormat?: ((v: number) => string) | undefined
  title?: string | undefined
}) {
  if (data.length === 0) return <EmptyChart height={height ?? 160} />

  const fmt = valueFormat ?? ((v: number) => v.toLocaleString())
  const rowH = 28
  const padT = 8
  const padB = 8
  const padL = 0
  const padR = 8
  const labelW = 96
  const valueW = 52
  const gap = 10
  const W = 400
  const H = height ?? padT + padB + data.length * rowH
  const barX = padL + labelW + gap
  const barMaxW = W - barX - valueW - gap - padR
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const ariaLabel = `${title}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}`

  return (
    <ChartExportShell title={title}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{title}</title>
        {data.map((d, i) => {
          const cy = padT + i * rowH + rowH / 2
          const bw = max > 0 ? (d.value / max) * barMaxW : 0
          const barColor = CHART_COLORS[i % CHART_COLORS.length] ?? color
          return (
            <g key={d.label + String(i)}>
              <text
                x={padL + labelW}
                y={cy + 3.5}
                textAnchor="end"
                fontSize={12}
                fill="var(--text)"
              >
                {d.label}
              </text>
              <rect
                x={barX}
                y={cy - 5}
                width={Math.max(bw, d.value > 0 ? 2 : 0)}
                height={10}
                rx={3}
                fill={barColor}
                opacity={0.9}
              />
              <text
                x={barX + barMaxW + gap}
                y={cy + 3.5}
                textAnchor="start"
                fontSize={12}
                fontWeight={600}
                fill="var(--text)"
                style={NUM_STYLE}
              >
                {fmt(d.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </ChartExportShell>
  )
}

// ── Sparkline ───────────────────────────────────────────────────────────────
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = PRIMARY,
  title = 'Sparkline',
}: {
  values: number[]
  width?: number | undefined
  height?: number | undefined
  color?: string | undefined
  title?: string | undefined
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
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={title}
      style={{ display: 'block' }}
    >
      <title>{title}</title>
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ── Donut chart ─────────────────────────────────────────────────────────────
/** Category colours stay on the dataviz ramp only — never status amber/hex. */
const DONUT_COLORS = CHART_COLORS

export function DonutChart({
  segments,
  size = 200,
  centerLabel = 'Total',
  title = 'Donut chart',
}: {
  segments: { label: string; value: number; color?: string | undefined }[]
  size?: number | undefined
  centerLabel?: string | undefined
  title?: string | undefined
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total <= 0) return <EmptyChart height={size} />

  const R = 60
  const C = 2 * Math.PI * R
  const stroke = 22
  let offset = 0

  // Always resolve to the chart ramp. Caller `color` is accepted only when it
  // already references `--chart-N`; otherwise the ramp index wins (no hex).
  function segmentColor(seg: { color?: string | undefined }, i: number): string {
    const c = seg.color
    if (c && /^var\(\s*--chart-[1-6]\s*\)$/.test(c)) return c
    return DONUT_COLORS[i % DONUT_COLORS.length]!
  }

  const ariaLabel = `${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`

  return (
    <ChartExportShell title={title}>
      <div className="row" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <svg
          viewBox="0 0 160 160"
          width={size}
          height={size}
          role="img"
          aria-label={ariaLabel}
          style={{ flexShrink: 0 }}
        >
          <title>{title}</title>
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
                  stroke={segmentColor(seg, i)}
                  strokeWidth={stroke}
                  strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += len
              return el
            })}
          </g>
          <text
            x={80}
            y={74}
            textAnchor="middle"
            fontSize={22}
            fontWeight={700}
            fill="var(--text)"
            style={NUM_STYLE}
          >
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
                    background: segmentColor(seg, i),
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'var(--text)' }}>{seg.label}</span>
              </span>
              <span className="dim" style={NUM_STYLE}>
                {seg.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartExportShell>
  )
}
