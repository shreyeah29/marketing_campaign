'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError } from '@/lib/api'
import { authClient, type AuthSession } from '@/lib/auth-client'
import type { Workspace } from '@/lib/types'
import { applyBranding, workspace as workspaceApi } from '@/lib/workspace'
import { Banner, Spinner } from '@/components/ui'
import { ToastProvider } from '@/components/kit'

/** Maps feature-registry icon names to glyphs (no icon-font dependency). */
const NAV_ICONS: Record<string, string> = {
  dashboard: '▦', users: '👥', 'user-plus': '➕', building: '🏢', target: '🎯',
  filter: '⑃', 'dollar-sign': '💲', 'check-square': '☑', mail: '✉', 'message-square': '💬',
  smartphone: '📱', share: '🔗', search: '⌕', 'file-text': '📄', bot: '🤖', 'pen-tool': '✎',
  image: '🖼', video: '🎬', phone: '📞', mic: '🎙', calendar: '📅', book: '📖',
  workflow: '⚙', zap: '⚡', 'bar-chart': '📊', 'trending-up': '📈', 'credit-card': '💳',
  receipt: '🧾', 'life-buoy': '🛟', inbox: '📥', folder: '📁', shield: '🛡', settings: '⚙',
  globe: '🌐', megaphone: '📣', edit: '✎', layout: '▧', activity: '📶',
}
function navIcon(name?: string): string {
  return (name && NAV_ICONS[name]) || '•'
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
    return parsed.workspace && parsed.session ? { workspace: parsed.workspace, session: parsed.session } : null
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
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  const load = useCallback(async () => {
    // Render the last known-good shell immediately (optimistic), then revalidate.
    const cached = readShellCache()
    if (cached) {
      applyBranding(cached.workspace.branding)
      setStatus({ kind: 'ready', data: { ...cached, reload: () => void load() } })
    }

    try {
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
      // No session → sign in. Any other failure is surfaced — unless we already
      // rendered a cached shell, in which case we keep it (the API may be waking).
      if (err instanceof ApiError && err.status === 401) {
        clearShellCache()
        router.replace('/login?next=/app')
        return
      }
      if (!cached) {
        setStatus({ kind: 'error', message: err instanceof ApiError ? err.message : 'Failed to load workspace' })
      }
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  if (status.kind === 'loading') return <ShellBooting />
  if (status.kind === 'error')
    return (
      <div className="center-screen">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <Banner kind="error">{status.message}</Banner>
          <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    )
  if (status.kind === 'no-org') return <NoOrganization session={status.session} />

  const { workspace: ws, session } = status.data
  const brandName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'

  return (
    <WorkspaceContext.Provider value={status.data}>
      <ToastProvider>
      <div className="shell">
        {/* Mobile top bar — only shown below the sidebar breakpoint. */}
        <header className="mobile-topbar">
          <button
            className="hamburger"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
          >
            ☰
          </button>
          <div className="brand" style={{ padding: 0 }}>
            <span className="dot" />
            <span>{brandName}</span>
          </div>
        </header>

        {/* Backdrop behind the off-canvas sidebar on mobile. */}
        {navOpen ? <div className="nav-backdrop" onClick={() => setNavOpen(false)} /> : null}

        <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
          <div className="brand">
            <span className="dot" />
            <span>{brandName}</span>
            <button
              className="sidebar-close"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation menu"
            >
              ✕
            </button>
          </div>

          <OrgSwitcher session={session} activeId={ws.organization?.id ?? null} onSwitched={() => void load()} />

          {/* Dynamic navigation — sections and items straight from the API. */}
          {ws.navigation.map((group) => (
            <div key={group.section} className="nav-section">
              <div className="label">{group.section}</div>
              {group.items.map((item) => {
                const href = `/app${item.path}`
                const active = pathname === href
                return (
                  <Link key={item.path} href={href} className={`nav-item ${active ? 'active' : ''}`}>
                    <span className="ico">{navIcon(item.icon)}</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div className="nav-item" style={{ cursor: 'default' }}>
              <span className="ico">◍</span>
              <span>
                <div style={{ fontSize: 13 }}>{ws.user.name || ws.user.email}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {ws.user.role} · {ws.plan?.name ?? 'No plan'}
                </div>
              </span>
            </div>
            <SignOutButton />
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
      </ToastProvider>
    </WorkspaceContext.Provider>
  )
}

function OrgSwitcher({
  session,
  activeId,
  onSwitched,
}: {
  session: AuthSession
  activeId: string | null
  onSwitched: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = session.organizations.find((o) => o.organizationId === activeId)

  // Only worth showing a switcher when there is more than one workspace.
  if (session.organizations.length <= 1) return null

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
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between' }}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {busy ? 'Switching…' : (active?.name ?? 'Select workspace')}
        </span>
        <span className="dim">▾</span>
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 6, marginTop: 4 }}
        >
          {session.organizations.map((o) => (
            <button
              key={o.organizationId}
              className={`nav-item ${o.organizationId === activeId ? 'active' : ''}`}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none' }}
              disabled={!o.isActive}
              onClick={() => void pick(o.organizationId)}
            >
              <span className="ico">{o.organizationId === activeId ? '●' : '○'}</span>
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
      )}
    </div>
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
      onClick={async () => {
        setBusy(true)
        clearShellCache()
        try {
          await authClient.signOut()
        } finally {
          router.replace('/login')
        }
      }}
    >
      <span className="ico">⏻</span>
      {busy ? 'Signing out…' : 'Sign out'}
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
            router.replace('/login')
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
            Waking up the server… the first request after a period of inactivity can take up to a minute on the
            current hosting tier. It stays fast after that.
          </p>
        ) : null}
      </div>
    </div>
  )
}
