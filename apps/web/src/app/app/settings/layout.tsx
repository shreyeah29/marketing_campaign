'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/components/icon'
import { useWorkspace } from '../layout'

/**
 * Settings navigation.
 *
 * Settings has six pages and, until this existed, exactly one of them was
 * reachable: the sidebar linked straight to Organization and nothing pointed at
 * the rest. The Brand kit — which decides what gets printed on every poster —
 * could only be opened by typing its URL or finding it in the command palette.
 *
 * Brand kit sits directly after Organization rather than in alphabetical order,
 * because it is the page a new workspace has to fill in before anything it
 * generates is usable.
 */

interface Section {
  href: string
  label: string
  icon: IconName
  /** Hidden unless the member holds this permission. */
  permission?: string
}

const SECTIONS: Section[] = [
  { href: '/app/settings/organization', label: 'Organization', icon: 'building' },
  { href: '/app/settings/branding', label: 'Brand kit', icon: 'pen-tool' },
  { href: '/app/settings/users', label: 'Users', icon: 'users', permission: 'members:read' },
  { href: '/app/settings/roles', label: 'Roles', icon: 'shield', permission: 'members:read' },
  { href: '/app/settings/ai', label: 'AI', icon: 'sparkles' },
  { href: '/app/settings/features', label: 'Features', icon: 'grid' },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const workspace = useWorkspace()
  const held = new Set(workspace.user.permissions)

  // A link that leads straight to a permission error is worse than no link.
  // Members with a wildcard grant (owners, admins) see everything.
  const visible = SECTIONS.filter((s) => !s.permission || held.has(s.permission) || held.has('*'))

  return (
    <>
      <nav className="settings-nav" aria-label="Settings sections">
        {visible.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`settings-nav__link${pathname === s.href ? ' is-on' : ''}`}
            aria-current={pathname === s.href ? 'page' : undefined}
          >
            <Icon name={s.icon} size={14} />
            {s.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  )
}
