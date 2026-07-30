'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { ApiError } from '@/lib/api'
import type { Workspace } from '@/lib/types'
import { applyBranding, workspace as workspaceApi } from '@/lib/workspace'
import { Banner, LoadingScreen } from '@/components/ui'

const WorkspaceContext = createContext<Workspace | null>(null)

/** Access the loaded workspace inside the tenant shell. */
export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within the tenant shell')
  return ctx
}

/**
 * The tenant application shell.
 *
 * The sidebar is built from `workspace.navigation` — the API returns the sections
 * and items this user may see, computed from the org's enabled features
 * intersected with the user's permissions. This component renders whatever comes
 * back and nothing more: there is no hardcoded menu here, which is the whole
 * point of the modular platform on the client.
 */
export default function TenantLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    workspaceApi
      .bootstrap()
      .then((w) => {
        setWs(w)
        applyBranding(w.branding)
      })
      .catch((err: unknown) => {
        // Tenant auth is Phase 6 — a 401 here is expected, not a failure.
        if (err instanceof ApiError && err.status === 401) {
          setAuthPending(true)
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load workspace')
      })
  }, [])

  if (authPending) {
    return (
      <div className="center-screen">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div className="brand" style={{ justifyContent: 'center', padding: '0 0 16px' }}>
            <span className="dot" />
            <strong>VSP</strong>
          </div>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Sign-in required</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            The tenant workspace loads once a member signs in. Tenant authentication is delivered in
            Phase 6; the operator console is available now at{' '}
            <Link href="/platform" style={{ color: 'var(--color-primary)' }}>
              /platform
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  if (error) return <Banner kind="error">{error}</Banner>
  if (!ws) return <LoadingScreen />

  const brandName = ws.branding?.displayName ?? ws.organization?.name ?? 'Workspace'

  return (
    <WorkspaceContext.Provider value={ws}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="dot" />
            <span>{brandName}</span>
          </div>

          {/* Dynamic navigation — sections and items straight from the API. */}
          {ws.navigation.map((group) => (
            <div key={group.section} className="nav-section">
              <div className="label">{group.section}</div>
              {group.items.map((item) => {
                const href = `/app${item.route}`
                const active = pathname === href
                return (
                  <Link key={item.route} href={href} className={`nav-item ${active ? 'active' : ''}`}>
                    <span className="ico">{item.icon ?? '•'}</span>
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
                  {ws.plan?.name ?? 'No plan'}
                </div>
              </span>
            </div>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </WorkspaceContext.Provider>
  )
}
