'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon, type IconName } from '@/components/icon'

/**
 * Sub-navigation within a top-level section.
 *
 * Used by Settings, and nowhere else any more. The Campaigns and Library strips
 * that used to live here listed the same destinations the sidebar already lists,
 * so every one of those pages had two doors — and the strip on the creatives
 * page was why asking for the review queue landed you on a screen titled
 * Creatives. A tab strip is right when a section has views the sidebar does not
 * carry; it is wrong when it is a second copy of the sidebar.
 */

export interface SectionLink {
  href: string
  label: string
  icon?: IconName
}

export function SectionNav({ links }: { links: readonly SectionLink[] }) {
  const pathname = usePathname()

  return (
    <nav className="settings-nav" aria-label="Section">
      {links.map((l) => {
        // Exact match only. A prefix match would light "Campaigns" up while you
        // are three levels into a single campaign's asset editor.
        const active = pathname === l.href
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`settings-nav__link${active ? ' is-on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {l.icon ? <Icon name={l.icon} size={14} /> : null}
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
