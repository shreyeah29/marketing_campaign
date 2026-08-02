'use client'

import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { api } from '@/lib/api'
import { Icon } from '@/components/icon'

/** Dispatch to open the palette from chrome (desktop top bar, etc.). */
export function openCommandPalette(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('vsp:command-palette'))
}

type PaletteItem = {
  id: string
  label: string
  hint?: string | undefined
  href: string
  group: string
}

type CampaignRow = { id: string; name: string }
type BoardLead = {
  id: string
  status: string
  contact: { name: string; email: string | null; phone: string | null } | null
}

function unwrapList<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

const SETTINGS: PaletteItem[] = [
  {
    id: 'settings-org',
    label: 'Organization settings',
    href: '/app/settings/organization',
    group: 'Settings',
  },
  {
    id: 'settings-branding',
    label: 'Branding',
    href: '/app/settings/branding',
    group: 'Settings',
  },
  { id: 'settings-users', label: 'Users', href: '/app/settings/users', group: 'Settings' },
  { id: 'settings-roles', label: 'Roles', href: '/app/settings/roles', group: 'Settings' },
  {
    id: 'settings-features',
    label: 'Features',
    href: '/app/settings/features',
    group: 'Settings',
  },
  { id: 'settings-ai', label: 'AI settings', href: '/app/settings/ai', group: 'Settings' },
]

const VERBS: PaletteItem[] = [
  {
    id: 'verb-create',
    label: 'Create campaign',
    hint: 'Open Command Center',
    href: '/app/create',
    group: 'Actions',
  },
  {
    id: 'verb-connect-ig',
    label: 'Connect Instagram',
    hint: 'Connections',
    href: '/app/connections',
    group: 'Actions',
  },
]

function matches(q: string, label: string, hint?: string): boolean {
  if (!q) return true
  const hay = `${label} ${hint ?? ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part))
}

/**
 * ⌘K / Ctrl+K command palette — campaigns, leads, settings, and verb commands.
 * Empty results are fine; never invents fixtures.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [campaigns, setCampaigns] = useState<PaletteItem[]>([])
  const [leads, setLeads] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('vsp:command-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('vsp:command-palette', onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const [campRes, leadRes] = await Promise.allSettled([
        api.get<CampaignRow[] | { data: CampaignRow[] }>('/campaigns'),
        api.get<BoardLead[]>('/leads/board'),
      ])
      if (cancelled) return
      if (campRes.status === 'fulfilled') {
        setCampaigns(
          unwrapList(campRes.value).map((c) => ({
            id: `campaign-${c.id}`,
            label: c.name || 'Untitled campaign',
            hint: 'Campaign',
            href: `/app/campaigns/${c.id}/assets`,
            group: 'Campaigns',
          })),
        )
      } else {
        setCampaigns([])
      }
      if (leadRes.status === 'fulfilled') {
        setLeads(
          leadRes.value.map((l) => ({
            id: `lead-${l.id}`,
            label: l.contact?.name || l.contact?.email || 'Lead',
            hint: l.status,
            href: '/app/crm/leads',
            group: 'Leads',
          })),
        )
      } else {
        setLeads([])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const items = useMemo(() => {
    const q = query.trim()
    const all = [...VERBS, ...campaigns, ...leads, ...SETTINGS]
    return all.filter((item) => matches(q, item.label, item.hint))
  }, [query, campaigns, leads])

  useEffect(() => {
    setActive(0)
  }, [query, items.length])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item: PaletteItem) {
    close()
    router.push(item.href)
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[active]
      if (item) go(item)
    }
  }

  if (!open) return null

  let lastGroup = ''

  return (
    <>
      <div className="overlay command-palette-overlay" onClick={close} />
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="command-palette-input-row">
          <Icon name="search" size={16} className="dim" />
          <input
            ref={inputRef}
            className="command-palette-input"
            placeholder="Search campaigns, leads, settings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={items[active] ? `cmd-${items[active]!.id}` : undefined}
          />
          <kbd className="command-palette-kbd">esc</kbd>
        </div>
        <div
          id="command-palette-list"
          className="command-palette-list"
          role="listbox"
          ref={listRef}
        >
          {loading && items.length === 0 ? (
            <div className="command-palette-empty muted">Loading…</div>
          ) : null}
          {!loading && items.length === 0 ? (
            <div className="command-palette-empty muted">No results</div>
          ) : null}
          {items.map((item, idx) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {showGroup ? <div className="command-palette-group label">{item.group}</div> : null}
                <button
                  type="button"
                  id={`cmd-${item.id}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  className={`command-palette-item ${idx === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(item)}
                >
                  <span className="command-palette-item-label">{item.label}</span>
                  {item.hint ? (
                    <span className="dim command-palette-item-hint">{item.hint}</span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
