'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { getPlatformToken } from '@/lib/api'
import { Icon } from '@/components/icon'
import { platform } from '@/lib/platform'

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
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

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
      icon: '▦',
      match: (p: string) => p === '/platform',
    },
    {
      href: '/platform/organizations/new',
      label: 'New organization',
      icon: '＋',
      match: (p: string) => p.startsWith('/platform/organizations/new'),
    },
  ]

  return (
    <div className="shell">
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
          <span>VSP Platform</span>
          <button
            className="sidebar-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="nav-section">
          <div className="label">Operator console</div>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${item.match(pathname) ? 'active' : ''}`}
            >
              <span className="ico">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 'auto' }}>
          <button
            className="nav-item"
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
            onClick={() => {
              platform.logout()
              router.replace('/platform/login')
            }}
          >
            <span className="ico">⏻</span>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
