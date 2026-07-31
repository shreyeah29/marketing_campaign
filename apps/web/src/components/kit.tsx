'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Icon, isIconName } from '@/components/icon'

/* ────────────────────────────────────────────────────────────────────────────
 * The shared UI kit. Every feature page is built from these primitives, so the
 * product looks and behaves consistently and no page has to reinvent a table,
 * a drawer, or its loading/empty/error states.
 * ──────────────────────────────────────────────────────────────────────────── */

// ── Page header ────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string | undefined
  actions?: ReactNode | undefined
}) {
  return (
    <div className="topbar">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  )
}

// ── States ─────────────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'inbox',
  title,
  hint,
  action,
}: {
  icon?: string | undefined
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="state">
      <div className="state-badge">
        {isIconName(icon) ? <Icon name={icon} size={22} /> : icon}
      </div>
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
      {action ? <div className="mt">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state-badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <Icon name="alert-triangle" size={22} />
      </div>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry ? (
        <button className="btn mt" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                  <div className="skeleton" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── "Provider not configured" — the graceful AI/email degradation ──────────────
export function ProviderNotConfigured({
  what = 'This feature',
}: {
  what?: string
  // Retained so existing call sites stay valid; providers are operator-managed, so
  // the message never tells a customer to configure anything.
  capability?: string
}) {
  return (
    <div className="banner info" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Icon name="plug" size={18} style={{ color: 'var(--color-primary)' }} />
      <span>
        <strong>{what} is temporarily unavailable.</strong> Please try again shortly.
      </span>
    </div>
  )
}

// ── Search input ───────────────────────────────────────────────────────────────
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="search">
      <span className="ico"><Icon name="search" size={15} /></span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Data table ─────────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortable?: boolean
  width?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  selectable,
  selected,
  onSelectionChange,
  actions,
  sort,
  onSort,
}: {
  columns: Column<T>[]
  rows: T[]
  onRowClick?: ((row: T) => void) | undefined
  selectable?: boolean | undefined
  selected?: Set<string> | undefined
  onSelectionChange?: ((ids: Set<string>) => void) | undefined
  actions?: ((row: T) => ReactNode) | undefined
  sort?: { key: string; dir: 'asc' | 'desc' } | undefined
  onSort?: ((key: string) => void) | undefined
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(r.id))
  function toggleAll() {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }
  function toggle(id: string) {
    if (!onSelectionChange || !selected) return
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {selectable ? (
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected ?? false} onChange={toggleAll} />
              </th>
            ) : null}
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.sortable ? 'sortable' : ''}
                style={c.width ? { width: c.width } : undefined}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
              >
                {c.header}
                {sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            {actions ? <th style={{ width: 80 }} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={onRowClick ? 'row-link' : ''}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {selectable ? (
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected?.has(row.id) ?? false}
                    onChange={() => toggle(row.id)}
                  />
                </td>
              ) : null}
              {columns.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
              {actions ? (
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  {actions(row)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Drawer (create/edit side panel) ────────────────────────────────────────────
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">{children}</div>
        {footer ? <div className="foot">{footer}</div> : null}
      </aside>
    </>
  )
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <>
      <div className="overlay" onClick={onCancel} />
      <div className="modal" role="alertdialog">
        <div className="head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="body">
          <p className="muted">{message}</p>
        </div>
        <div className="foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Toasts ─────────────────────────────────────────────────────────────────────
interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}
const ToastCtx = createContext<{ push: (kind: Toast['kind'], message: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  return (
    ctx ?? {
      // A no-op fallback so a component used outside the provider never crashes.
      push: (_k: Toast['kind'], _m: string) => {},
    }
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  delta,
}: {
  label: string
  value: ReactNode
  delta?: { dir: 'up' | 'down'; text: string }
}) {
  return (
    <div className="card kpi">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {delta ? <div className={`delta ${delta.dir}`}>{delta.text}</div> : null}
    </div>
  )
}
