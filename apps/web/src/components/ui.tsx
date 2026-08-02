'use client'

import type { ReactNode } from 'react'

export function Spinner() {
  return <span className="spinner" aria-label="loading" />
}

export function Banner({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info'
  children: ReactNode
}) {
  return <div className={`banner ${kind}`}>{children}</div>
}

/** Thin metric display — prefer MetricTile from kit for delta/sparkline. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-tile">
      <div className="metric-tile__label">{label}</div>
      <div className="metric-tile__value">{value}</div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

/** Full-screen centred loading state. */
export function LoadingScreen() {
  return (
    <div className="center-screen">
      <Spinner />
    </div>
  )
}
