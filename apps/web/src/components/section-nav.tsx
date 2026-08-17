'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon, type IconName } from '@/components/icon'

/**
 * Sub-navigation within a top-level section.
 *
 * The sidebar deliberately stays at five items — nine top-level destinations is
 * how the duplication we spent a day removing got there in the first place. New
 * surfaces nest under the item they belong to and appear here instead.
 *
 * Same underlined-tab treatment as the studio rail, the library and settings, so
 * a strip of tabs means one thing everywhere in the app.
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

/** The Campaigns group: the campaigns themselves and the catalogue they draw on. */
export const CAMPAIGN_SECTION: readonly SectionLink[] = [
  { href: '/app/campaigns', label: 'Campaigns', icon: 'megaphone' },
  { href: '/app/products', label: 'Products', icon: 'grid' },
  { href: '/app/creatives', label: 'Creatives', icon: 'image' },
]

/** The Library group. Mirrors the sidebar's Library entries, so the sub-tabs and
 *  the rail cannot describe the same area differently. */
export const LIBRARY_SECTION: readonly SectionLink[] = [
  { href: '/app/ai/images', label: 'Images & video', icon: 'images' },
  { href: '/app/content', label: 'Copy & captions', icon: 'file-text' },
  { href: '/app/templates', label: 'Templates', icon: 'layout' },
]
