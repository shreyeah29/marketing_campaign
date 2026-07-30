'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError } from '@/lib/api'
import { authClient, type AuthSession } from '@/lib/auth-client'
import type { Workspace } from '@/lib/types'
import { applyBranding, workspace as workspaceApi } from '@/lib/workspace'
import { Banner, LoadingScreen } from '@/components/ui'
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

  const load = useCallback(async () => {
    try {
      const session = await authClient.session()
      if (session.needsOrganization) {
        setStatus({ kind: 'no-org', session })
        return
      }
      const ws = await workspaceApi.bootstrap()
      applyBranding(ws.branding)
      setStatus({ kind: 'ready', data: { workspace: ws, session, reload: () => void load() } })
    } catch (err) {
      // No session → sign in. Any other failure is surfaced.
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login?next=/app')
        return
      }
      setStatus({ kind: 'error', message: err instanceof ApiError ? err.message : 'Failed to load workspace' })
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  if (status.kind === 'loading') return <LoadingScreen />
  if (status.kind === 'error') return <Banner kind="error">{status.message}</Banner>
  if (status.kind === 'no-org') return <NoOrganization session={status.session} />

  const { workspace: ws, session } = status.data
  const brandName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'

  return (
    <WorkspaceContext.Provider value={status.data}>
      <ToastProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="dot" />
            <span>{brandName}</span>
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
