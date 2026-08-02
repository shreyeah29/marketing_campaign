'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError, api, getViewAsToken, setViewAsToken } from '@/lib/api'
import { authClient, type AuthSession } from '@/lib/auth-client'
import type { Workspace } from '@/lib/types'
import { applyBranding, workspace as workspaceApi } from '@/lib/workspace'
import { Banner, Spinner } from '@/components/ui'
import { ToastProvider } from '@/components/kit'
import { Icon } from '@/components/icon'
import { CommandPalette, openCommandPalette } from '@/components/command-palette'

const THEME_KEY = 'vsp:theme'
const SIDEBAR_KEY = 'vsp:sidebar:collapsed'

function toggleTheme(): 'light' | 'dark' {
  const root = document.documentElement
  const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark'
  if (next === 'dark') root.dataset['theme'] = 'dark'
  else delete root.dataset['theme']
  try {
    window.localStorage.setItem(THEME_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function unwrapList<T>(r: T[] | { data: T[] }): T[] {
  return Array.isArray(r) ? r : (r.data ?? [])
}

const CONNECTION_BAD = new Set(['EXPIRED', 'ERROR', 'TOKEN_EXPIRED'])

async function poolMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx]!)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

interface NavIndicators {
  newLeads: number
  assetsNeedingReview: number
  connectionIssue: boolean
}

/**
 * The shell (nav, branding, plan, user) is cached in sessionStorage so a reload or
 * a hard navigation renders the app instantly instead of blocking on the API — the
 * cached shell shows immediately while a fresh copy is fetched in the background.
 * This is what makes the app feel fast even when the API is cold-starting.
 */
const SHELL_CACHE_KEY = 'vsp:shell:v1'
function readShellCache(): { workspace: Workspace; session: AuthSession } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SHELL_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { workspace?: Workspace; session?: AuthSession }
    return parsed.workspace && parsed.session
      ? { workspace: parsed.workspace, session: parsed.session }
      : null
  } catch {
    return null
  }
}
function writeShellCache(session: AuthSession, workspace: Workspace): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SHELL_CACHE_KEY, JSON.stringify({ session, workspace }))
  } catch {
    /* storage full / disabled — caching is best-effort */
  }
}
function clearShellCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SHELL_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

interface ShellData {
  workspace: Workspace
  session: AuthSession
  reload: () => void
}

const WorkspaceContext = createContext<ShellData | null>(null)

/** Access the loaded workspace + session inside the tenant shell. */
export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within the tenant shell')
  return ctx.workspace
}

/**
 * The organisation's mark in the shell header.
 *
 * White-labelling is logo + display name: an uploaded logo renders as-is, and an
 * organisation without one gets a neutral tile carrying its initial. Neither path
 * introduces tenant colour — colour is reserved for status everywhere in the app.
 */
function BrandMark({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt=""
        width={28}
        height={28}
        style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', objectFit: 'contain' }}
      />
    )
  return (
    <span className="dot" aria-hidden style={{ display: 'grid', placeItems: 'center' }}>
      <span style={{ color: 'var(--text-inverse)', fontSize: 13, fontWeight: 600 }}>
        {name.trim().charAt(0).toUpperCase() || 'W'}
      </span>
    </span>
  )
}

type Status =
  | { kind: 'loading' }
  | { kind: 'no-org'; session: AuthSession }
  | { kind: 'ready'; data: ShellData }
  | { kind: 'error'; message: string }

/**
 * The tenant application shell.
 *
 * Session-first: it establishes *who* the user is before rendering anything. An
 * unauthenticated visitor is sent to sign in; an authenticated user with no active
 * organisation is shown a "no workspace yet" state (they were not yet invited or
 * provisioned); everyone else gets their organisation's shell — a sidebar built
 * entirely from `workspace.navigation`, an organisation switcher, and their
 * white-label branding applied at runtime.
 */
export default function TenantLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  // Mobile off-canvas navigation. Closed on every route change so tapping a link
  // dismisses the menu.
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [indicators, setIndicators] = useState<NavIndicators>({
    newLeads: 0,
    assetsNeedingReview: 0,
    connectionIssue: false,
  })

  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  useEffect(() => {
    setCollapsed(readSidebarCollapsed())
  }, [])

  const setCollapsedPersist = useCallback((next: boolean) => {
    setCollapsed(next)
    writeSidebarCollapsed(next)
  }, [])

  const load = useCallback(async () => {
    // Render the last known-good shell immediately (optimistic), then revalidate.
    // Never from cache in view-as mode — the cache belongs to whatever tenant
    // session this browser normally holds, not to the client being viewed.
    const cached = getViewAsToken() ? null : readShellCache()
    if (cached) {
      applyBranding(cached.workspace.branding)
      setStatus({ kind: 'ready', data: { ...cached, reload: () => void load() } })
    }

    try {
      // View-as mode: a platform admin looking around read-only. There is no
      // Better Auth identity to fetch — the bridge token IS the session, and
      // the workspace response carries everything the shell needs.
      if (getViewAsToken()) {
        const ws = await workspaceApi.bootstrap()
        applyBranding(ws.branding)
        const session: AuthSession = {
          user: { id: ws.user.id, email: ws.user.email, name: ws.user.name, emailVerified: true },
          organizations: [],
          activeOrganizationId: ws.organization?.id ?? null,
          needsOrganization: false,
        }
        setStatus({ kind: 'ready', data: { workspace: ws, session, reload: () => void load() } })
        return
      }

      // Fetch session + workspace concurrently so a cold API is paid once, not twice.
      const [sessionRes, wsRes] = await Promise.allSettled([
        authClient.session(),
        workspaceApi.bootstrap(),
      ])
      if (sessionRes.status === 'rejected') throw sessionRes.reason
      const session = sessionRes.value

      if (session.needsOrganization) {
        clearShellCache()
        setStatus({ kind: 'no-org', session })
        return
      }

      const ws = wsRes.status === 'fulfilled' ? wsRes.value : await workspaceApi.bootstrap()
      applyBranding(ws.branding)
      writeShellCache(session, ws)
      setStatus({ kind: 'ready', data: { workspace: ws, session, reload: () => void load() } })
    } catch (err) {
      // An expired view-as token → back to the platform console, not the
      // tenant sign-in: the visitor is the operator, not a member.
      if (getViewAsToken() && err instanceof ApiError && err.status === 401) {
        setViewAsToken(null)
        router.replace('/platform')
        return
      }
      // No session → sign in. Any other failure is surfaced — unless we already
      // rendered a cached shell, in which case we keep it (the API may be waking).
      if (err instanceof ApiError && err.status === 401) {
        clearShellCache()
        router.replace('/login?next=/app')
        return
      }
      if (!cached) {
        setStatus({
          kind: 'error',
          message: err instanceof ApiError ? err.message : 'Failed to load workspace',
        })
      }
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  // Amber dots + Connections crimson — existing endpoints only, best-effort.
  useEffect(() => {
    if (status.kind !== 'ready') return
    let cancelled = false
    void (async () => {
      const next: NavIndicators = {
        newLeads: 0,
        assetsNeedingReview: 0,
        connectionIssue: false,
      }

      const [leadsRes, campsRes, socialRes, metaRes] = await Promise.allSettled([
        api.get<{ id: string; status: string }[]>('/leads/board'),
        api.get<{ id: string }[] | { data: { id: string }[] }>('/campaigns'),
        api.get<{ id: string; status: string }[]>('/social/accounts'),
        api.get<{ status: string } | null>('/meta/connection'),
      ])

      if (cancelled) return

      if (leadsRes.status === 'fulfilled') {
        next.newLeads = leadsRes.value.filter((l) => l.status === 'NEW').length
      }

      if (campsRes.status === 'fulfilled') {
        const camps = unwrapList(campsRes.value)
        const counts = await poolMap(camps, 8, async (c) => {
          try {
            const r = await api.get<{ status: string }[] | { data: { status: string }[] }>(
              `/campaign-assets?campaignId=${encodeURIComponent(c.id)}`,
            )
            return unwrapList(r).filter(
              (a) => a.status === 'GENERATED' || a.status === 'NEEDS_REVIEW',
            ).length
          } catch {
            return 0
          }
        })
        if (cancelled) return
        next.assetsNeedingReview = counts.reduce((sum, n) => sum + n, 0)
      }

      if (socialRes.status === 'fulfilled') {
        next.connectionIssue = socialRes.value.some((a) => CONNECTION_BAD.has(a.status))
      }
      if (metaRes.status === 'fulfilled' && metaRes.value) {
        if (CONNECTION_BAD.has(metaRes.value.status)) next.connectionIssue = true
      }

      if (!cancelled) setIndicators(next)
    })()
    return () => {
      cancelled = true
    }
  }, [status.kind])

  if (status.kind === 'loading') return <ShellBooting />
  if (status.kind === 'error')
    return (
      <div className="center-screen">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <Banner kind="error">{status.message}</Banner>
          <button
            className="btn primary"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      </div>
    )
  if (status.kind === 'no-org') return <NoOrganization session={status.session} />

  const { workspace: ws, session } = status.data
  const brandName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'
  const pageContext = pageContextLabel(pathname)

  return (
    <WorkspaceContext.Provider value={status.data}>
      <ToastProvider>
        <div className="shell" {...(collapsed ? { 'data-collapsed': '' } : {})}>
          {/* Mobile top bar — only shown below the sidebar breakpoint. */}
          <header className="mobile-topbar">
            <button
              className="hamburger"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={navOpen}
            >
              <Icon name="menu" size={22} />
            </button>
            <div className="brand" style={{ padding: 0 }}>
              <BrandMark logoUrl={ws.branding?.logoUrl ?? null} name={brandName} />
              <span>{brandName}</span>
            </div>
          </header>

          {/* Backdrop behind the off-canvas sidebar on mobile. */}
          {navOpen ? <div className="nav-backdrop" onClick={() => setNavOpen(false)} /> : null}

          <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
            <div className="brand">
              <BrandMark logoUrl={ws.branding?.logoUrl ?? null} name={brandName} />
              <span className="brand-name">{brandName}</span>
              <button
                className="sidebar-close"
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation menu"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <button
              type="button"
              className="sidebar-collapse"
              onClick={() => setCollapsedPersist(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
            </button>

            {ws.viewOnly ? null : (
              <OrgSwitcher
                session={session}
                activeId={ws.organization?.id ?? null}
                identityName={brandName}
                collapsed={collapsed}
                onSwitched={() => void load()}
              />
            )}

            {/* Furniture: Create — primary workspace entry (Home removed — same destination). */}
            <Link
              href="/app/create"
              className={`nav-item nav-create ${isActivePath(pathname, '/app/create') ? 'active' : ''}`}
              title="Create"
            >
              <Icon name="sparkles" size={18} style={{ opacity: 0.9 }} />
              <span className="nav-label">Create</span>
            </Link>

            {/* Dynamic navigation — sections and items straight from the API. */}
            {ws.navigation.map((group) => (
              <div key={group.section} className="nav-section">
                <div className="label">{group.section}</div>
                {group.items.map((item) => {
                  const href = `/app${item.path}`
                  const active = isActivePath(pathname, href)
                  const isCampaign = /campaign/i.test(item.path)
                  const isLead = /lead/i.test(item.path)
                  const count = isCampaign
                    ? indicators.assetsNeedingReview
                    : isLead
                      ? indicators.newLeads
                      : 0
                  const amber = (isCampaign || isLead) && count > 0
                  return (
                    <Link
                      key={item.path}
                      href={href}
                      className={`nav-item ${active ? 'active' : ''}`}
                      title={item.label}
                    >
                      <Icon name={item.icon ?? 'dot'} size={17} style={{ opacity: 0.9 }} />
                      <span className="nav-label">{item.label}</span>
                      {count > 0 ? <span className="nav-count">{count}</span> : null}
                      {amber ? <span className="nav-dot" aria-hidden /> : null}
                    </Link>
                  )
                })}
              </div>
            ))}

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              {/* Connections — furniture near Settings; crimson when token bad. */}
              <Link
                href="/app/connections"
                className={`nav-item ${isActivePath(pathname, '/app/connections') ? 'active' : ''}`}
                title="Connections"
              >
                <Icon name="plug" size={17} style={{ opacity: 0.9 }} />
                <span className="nav-label">Connections</span>
                {indicators.connectionIssue ? (
                  <span className="nav-dot-danger" aria-label="Connection issue" />
                ) : null}
              </Link>
              {/* Settings is workspace furniture, not a module — always reachable. */}
              <Link
                href="/app/settings/organization"
                className={`nav-item ${pathname.startsWith('/app/settings') ? 'active' : ''}`}
                title="Settings"
              >
                <Icon name="settings" size={17} style={{ opacity: 0.9 }} />
                <span className="nav-label">Settings</span>
              </Link>
              <div
                className="nav-item"
                style={{ cursor: 'default' }}
                title={ws.user.name || ws.user.email}
              >
                <span className="avatar">
                  {(ws.user.name || ws.user.email || '?').charAt(0).toUpperCase()}
                </span>
                <span className="user-meta" style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ws.user.name || ws.user.email}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {ws.user.role}
                  </div>
                </span>
              </div>
              <ThemeToggle />
              {ws.viewOnly ? null : <SignOutButton />}
            </div>
          </aside>

          <div className="shell-content">
            <header className="topbar-desktop">
              <div className="dim" style={{ fontSize: 13, fontWeight: 500 }}>
                {pageContext}
              </div>
              <button
                type="button"
                className="topbar-desktop-hint"
                onClick={() => openCommandPalette()}
                aria-label="Open command palette"
              >
                <Icon name="search" size={14} />
                <span>Search</span>
                <kbd>⌘K</kbd>
              </button>
            </header>
            <main className="main">
              {ws.viewOnly ? <ViewOnlyBanner organizationName={ws.organization?.name} /> : null}
              {children}
            </main>
          </div>

          <CommandPalette />
        </div>
      </ToastProvider>
    </WorkspaceContext.Provider>
  )
}

function pageContextLabel(pathname: string): string {
  const parts = pathname
    .replace(/^\/app\/?/, '')
    .split('/')
    .filter(Boolean)
  if (parts.length === 0) return 'Home'
  const last = parts[parts.length - 1] ?? 'Home'
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * The strip that keeps a view-as session honest: always visible, names the
 * client being viewed, and offers the one action available — leaving.
 */
function ViewOnlyBanner({ organizationName }: { organizationName?: string | undefined }) {
  const router = useRouter()
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        margin: '0 0 16px',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-inverse)',
        color: 'var(--text-inverse)',
        fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon name="eye" size={15} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Viewing {organizationName ?? 'this workspace'} as the operator — read-only
        </span>
      </span>
      <button
        className="btn"
        style={{ flexShrink: 0 }}
        onClick={() => {
          setViewAsToken(null)
          clearShellCache()
          router.replace('/platform')
        }}
      >
        Exit view
      </button>
    </div>
  )
}

function OrgSwitcher({
  session,
  activeId,
  identityName,
  collapsed,
  onSwitched,
}: {
  session: AuthSession
  activeId: string | null
  identityName: string
  collapsed: boolean
  onSwitched: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = session.organizations.find((o) => o.organizationId === activeId)
  const canSwitch = session.organizations.length > 1
  const label = active?.name ?? identityName

  async function pick(orgId: string) {
    if (orgId === activeId) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      // Drop the cached shell so the switched org isn't shown stale on next load.
      clearShellCache()
      await authClient.switchOrganization(orgId)
      onSwitched()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative', margin: '4px 0 8px' }}>
      <button
        className="btn org-switcher-btn"
        style={{ width: '100%', justifyContent: 'space-between' }}
        onClick={() => {
          if (canSwitch) setOpen((v) => !v)
        }}
        disabled={busy || !canSwitch}
        title={label}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
      >
        <span
          className="org-switcher-label"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {busy ? 'Switching…' : label}
        </span>
        {collapsed ? (
          <Icon name="building" size={16} className="dim" />
        ) : canSwitch ? (
          <Icon name="chevron-down" size={15} className="dim" />
        ) : null}
      </button>
      {open && canSwitch ? (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            padding: 6,
            marginTop: 4,
            minWidth: collapsed ? 200 : undefined,
          }}
        >
          {session.organizations.map((o) => (
            <button
              key={o.organizationId}
              className={`nav-item ${o.organizationId === activeId ? 'active' : ''}`}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none' }}
              disabled={!o.isActive}
              onClick={() => void pick(o.organizationId)}
            >
              <Icon
                name={o.organizationId === activeId ? 'check' : 'dot'}
                size={15}
                className="dim"
              />
              <span>
                <div style={{ fontSize: 13 }}>{o.name}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {o.role}
                  {!o.isActive ? ' · unavailable' : ''}
                </div>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.dataset['theme'] === 'dark')
  }, [])
  const label = dark ? 'Light mode' : 'Dark mode'
  return (
    <button
      className="nav-item"
      style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
      onClick={() => setDark(toggleTheme() === 'dark')}
      aria-label="Toggle colour theme"
      title={label}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={16} style={{ opacity: 0.9 }} />
      <span className="nav-label">{label}</span>
    </button>
  )
}

function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="nav-item"
      style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
      disabled={busy}
      title={busy ? 'Signing out…' : 'Sign out'}
      onClick={async () => {
        setBusy(true)
        clearShellCache()
        try {
          await authClient.signOut()
        } finally {
          // Signing out returns to the front door, not another login form.
          router.replace('/')
        }
      }}
    >
      <Icon name="log-out" size={16} style={{ opacity: 0.9 }} />
      <span className="nav-label">{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  )
}

function NoOrganization({ session }: { session: AuthSession }) {
  const router = useRouter()
  return (
    <div className="center-screen">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center', padding: '0 0 16px' }}>
          <span className="dot" />
          <strong>VSP</strong>
        </div>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>No workspace yet</h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          You're signed in as <strong>{session.user.email}</strong>, but you don't belong to any
          workspace yet. Accept an invitation from your team, or ask an administrator to add you.
        </p>
        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={async () => {
            clearShellCache()
            await authClient.signOut()
            router.replace('/')
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/**
 * First-load screen. After a few seconds it explains the wait honestly — the API
 * cold-starts on the current hosting tier, so the very first request can be slow.
 * Repeat loads render from the shell cache and never reach this.
 */
function ShellBooting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="center-screen">
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <span className="dot" />
          <strong>VSP</strong>
        </div>
        <Spinner />
        {slow ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 16, lineHeight: 1.5 }}>
            Waking up the server… the first request after a period of inactivity can take up to a
            minute on the current hosting tier. It stays fast after that.
          </p>
        ) : null}
      </div>
    </div>
  )
}
