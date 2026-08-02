'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { getPlatformToken } from '@/lib/api'
import { Icon } from '@/components/icon'
import { platform } from '@/lib/platform'

const SIDEBAR_KEY = 'vsp:platform:sidebar:collapsed'

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/platform') return pathname === '/platform'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The platform-owner shell.
 *
 * This realm is never visible to a client organisation — it is the operator's
 * console for provisioning and managing every org. The layout gates on the
 * platform token: the login page renders bare, everything else requires a token
 * and gets the operator sidebar.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/platform/login'
  const [ready, setReady] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  useEffect(() => {
    setCollapsed(readCollapsed())
  }, [])

  useEffect(() => {
    const token = getPlatformToken()
    if (!token && !isLogin) {
      router.replace('/platform/login')
      return
    }
    if (token && isLogin) {
      router.replace('/platform')
      return
    }
    setReady(true)
  }, [isLogin, router])

  if (isLogin) return <>{children}</>
  if (!ready) return null

  const nav = [
    {
      href: '/platform',
      label: 'Organizations',
      icon: 'building' as const,
    },
    {
      href: '/platform/analytics',
      label: 'Analytics',
      icon: 'bar-chart' as const,
    },
    {
      href: '/platform/organizations/new',
      label: 'New organization',
      icon: 'plus' as const,
    },
  ]

  return (
    <div className="shell" {...(collapsed ? { 'data-collapsed': '' } : {})}>
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
          <span className="dot" />
          <span>VSP Platform</span>
        </div>
      </header>

      {navOpen ? <div className="nav-backdrop" onClick={() => setNavOpen(false)} /> : null}

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="dot" />
          <span className="brand-name">VSP Platform</span>
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
          onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            writeCollapsed(next)
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>

        <div className="nav-section">
          <div className="label">Operator console</div>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActivePath(pathname, item.href) ? 'active' : ''}`}
              title={item.label}
            >
              <Icon name={item.icon} size={16} style={{ opacity: 0.9 }} />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <button
            className="nav-item"
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
            title="Sign out"
            onClick={() => {
              platform.logout()
              // Signing out returns to the front door.
              router.replace('/')
            }}
          >
            <Icon name="log-out" size={16} style={{ opacity: 0.9 }} />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="shell-content">
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
