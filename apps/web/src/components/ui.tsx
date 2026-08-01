'use client'

import type { ReactNode } from 'react'

/** A status badge whose colour is driven by the status class in globals.css. */
export function Badge({ status, children }: { status?: string | undefined; children: ReactNode }) {
  return <span className={`badge ${status ?? ''}`}>{children}</span>
}

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

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
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
