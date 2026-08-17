'use client'

/**
 * Grouped sidebar navigation.
 *
 * Five flat links become five labelled rails holding twelve groups and forty-six
 * destinations. Every route below was checked to exist as a page before it was
 * listed — a nav item pointing at a 404 is worse than no nav item, because the
 * user concludes the feature is broken rather than absent.
 *
 * Styling lives in the Ink & Signal override layer at the end of globals.css:
 * `.nav-rail-label`, `.nav-group-label`, `.nav-subitem`.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Icon, type IconName } from '@/components/icon'

const NAV_GROUPS_KEY = 'mos:nav:groups'

type Indicator = 'assets' | 'leads' | 'inbox' | 'connection'

interface NavChild {
  label: string
  href: string
  indicator?: Indicator
  /** Renders the count as the lime attention pill rather than a grey number. */
  attention?: boolean
}

interface NavGroupDef {
  id: string
  label: string
  icon: IconName
  /** Set instead of children to render a single flat link. */
  href?: string
  children?: NavChild[]
  /** Rail heading printed above this group. */
  rail?: string
}

export const NAV_GROUPS: NavGroupDef[] = [
  { id: 'today', label: 'Today', icon: 'home', href: '/app/dashboard' },

  {
    id: 'studio',
    label: 'Studio',
    icon: 'sparkles',
    rail: 'Work',
    children: [
      { label: 'New brief', href: '/app/create' },
      { label: 'Products', href: '/app/products' },
      { label: 'Design templates', href: '/app/templates' },
      { label: 'Brand kit', href: '/app/settings/branding' },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: 'megaphone',
    children: [
      { label: 'All campaigns', href: '/app/campaigns' },
      { label: 'Content calendar', href: '/app/calendar' },
      // Filtered view of the creatives page — no new route required.
      {
        label: 'Review queue',
        href: '/app/creatives?status=needs_review',
        indicator: 'assets',
        attention: true,
      },
      { label: 'Publishing', href: '/app/marketing/social' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    icon: 'images',
    children: [
      { label: 'Images & video', href: '/app/ai/images' },
      { label: 'Poster creatives', href: '/app/creatives' },
      { label: 'Copy & captions', href: '/app/content' },
      { label: 'Uploads', href: '/app/documents/files' },
    ],
  },

  {
    id: 'channels',
    label: 'Channels',
    icon: 'broadcast',
    rail: 'Reach',
    children: [
      { label: 'All connections', href: '/app/connections', indicator: 'connection' },
      { label: 'Meta Ads manager', href: '/app/marketing/facebook' },
      { label: 'Messenger bot', href: '/app/marketing/instagram' },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    icon: 'browser',
    children: [
      { label: 'Landing pages', href: '/app/marketing/pages' },
      { label: 'Lead forms', href: '/app/marketing/forms' },
      { label: 'SEO', href: '/app/marketing/seo' },
    ],
  },
  {
    id: 'auto',
    label: 'Automations',
    icon: 'flow-arrow',
    children: [
      { label: 'Workflows', href: '/app/automation/workflows' },
      { label: 'Webhooks & runs', href: '/app/automation/webhooks' },
    ],
  },

  { id: 'inbox', label: 'Inbox', icon: 'chats', href: '/app/inbox/chat', rail: 'People' },
  {
    id: 'crm',
    label: 'CRM',
    icon: 'users',
    children: [
      { label: 'Leads board', href: '/app/leads/pipeline', indicator: 'leads' },
      { label: 'Contacts', href: '/app/crm/contacts' },
      { label: 'Companies', href: '/app/crm/companies' },
      { label: 'Deals pipeline', href: '/app/crm/deals' },
      { label: 'Tasks & notes', href: '/app/crm/tasks' },
      { label: 'Support tickets', href: '/app/support/tickets' },
    ],
  },

  {
    id: 'ai',
    label: 'AI Studio',
    icon: 'robot',
    rail: 'Intelligence',
    children: [
      { label: 'Chat', href: '/app/ai/chat' },
      { label: 'Copywriter', href: '/app/ai/copywriter' },
      { label: 'Image generation', href: '/app/ai/images' },
      { label: 'Video generation', href: '/app/ai/video' },
      { label: 'Voice', href: '/app/ai/voice' },
      { label: 'Prompt library', href: '/app/ai/prompts' },
      { label: 'Knowledge base', href: '/app/ai/knowledge' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: 'chart-line-up',
    children: [
      { label: 'Overview', href: '/app/analytics/overview' },
      { label: 'Campaign performance', href: '/app/analytics/campaigns' },
      { label: 'Channels', href: '/app/analytics/channels' },
      { label: 'Audience', href: '/app/analytics/audience' },
      { label: 'Leads funnel', href: '/app/analytics/leads' },
      { label: 'Revenue', href: '/app/analytics/revenue' },
      { label: 'Reports', href: '/app/analytics/reports' },
    ],
  },
]

/** Pinned to the bottom of the sidebar, as Settings is today. */
export const ADMIN_GROUPS: NavGroupDef[] = [
  {
    id: 'admin',
    label: 'Settings',
    icon: 'settings',
    rail: 'Admin',
    children: [
      { label: 'Workspace', href: '/app/settings/organization' },
      { label: 'Team & roles', href: '/app/settings/users' },
      { label: 'Feature access', href: '/app/settings/features' },
      { label: 'Branding', href: '/app/settings/branding' },
      { label: 'Connections', href: '/app/connections', indicator: 'connection' },
      { label: 'AI providers', href: '/app/settings/ai' },
      { label: 'Documents', href: '/app/documents/contracts' },
    ],
  },
]

function isActivePath(pathname: string, href: string): boolean {
  const path = href.split('?')[0] ?? href
  return pathname === path || pathname.startsWith(`${path}/`)
}

function groupOwnsRoute(group: NavGroupDef, pathname: string): boolean {
  if (group.href && isActivePath(pathname, group.href)) return true
  return (group.children ?? []).some((c) => isActivePath(pathname, c.href))
}

function readOpenGroups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(NAV_GROUPS_KEY) ?? '{}') as Record<
      string,
      boolean
    >
  } catch {
    return {}
  }
}

function writeOpenGroups(next: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next))
  } catch {
    /* best-effort */
  }
}

export interface NavIndicatorCounts {
  newLeads: number
  assetsNeedingReview: number
  openConversations?: number
  connectionIssue: boolean
}

/**
 * The sidebar navigation.
 *
 * Studio and Campaigns start expanded; whichever group owns the current route
 * expands too; open groups persist under `mos:nav:groups`, mirroring the
 * existing `mos:sidebar:collapsed`.
 *
 * `collapsed` is not in the handoff but is required by it: at 60px the
 * sub-items are text-only and would render as invisible slivers, and a group
 * button that toggles a list nobody can see is a control that does nothing. So
 * collapsed, each group becomes a single icon link to its first destination.
 */
export function SidebarNav({
  pathname,
  indicators,
  collapsed = false,
}: {
  pathname: string
  indicators: NavIndicatorCounts
  collapsed?: boolean
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ studio: true, campaigns: true })

  useEffect(() => {
    const stored = { studio: true, campaigns: true, ...readOpenGroups() }
    const owner = [...NAV_GROUPS, ...ADMIN_GROUPS].find((g) => groupOwnsRoute(g, pathname))
    setOpen(owner ? { ...stored, [owner.id]: true } : stored)
  }, [pathname])

  function toggle(id: string) {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeOpenGroups(next)
      return next
    })
  }

  function countFor(indicator: Indicator | undefined): number {
    if (indicator === 'assets') return indicators.assetsNeedingReview
    if (indicator === 'leads') return indicators.newLeads
    if (indicator === 'inbox') return indicators.openConversations ?? 0
    return 0
  }

  /** The count a collapsed group still needs to surface, summed over its children. */
  function groupCount(group: NavGroupDef): number {
    return (group.children ?? []).reduce((n, c) => n + countFor(c.indicator), 0)
  }

  function groupHasIssue(group: NavGroupDef): boolean {
    return (
      indicators.connectionIssue && (group.children ?? []).some((c) => c.indicator === 'connection')
    )
  }

  function renderGroup(group: NavGroupDef) {
    const rail = group.rail ? (
      <div className="nav-rail-label" key={`${group.id}-rail`}>
        {group.rail.toUpperCase()}
      </div>
    ) : null

    // Flat link (Today, Inbox), and every group when the rail is collapsed.
    if (!group.children || collapsed) {
      const href = group.href ?? group.children?.[0]?.href ?? '#'
      const count = group.children
        ? groupCount(group)
        : countFor(group.id === 'inbox' ? 'inbox' : undefined)
      const active = group.children ? groupOwnsRoute(group, pathname) : isActivePath(pathname, href)
      return (
        <div key={group.id}>
          {rail}
          <Link href={href} className={`nav-item ${active ? 'active' : ''}`} title={group.label}>
            <Icon name={group.icon} size={16} className="ico" />
            <span className="nav-label">{group.label}</span>
            {count > 0 ? (
              <span className="nav-count" data-attention>
                {count}
              </span>
            ) : null}
            {group.children && groupHasIssue(group) ? (
              <span className="nav-dot-danger" aria-label="A connection needs attention" />
            ) : null}
          </Link>
        </div>
      )
    }

    const expanded = open[group.id] ?? false
    return (
      <div key={group.id}>
        {rail}
        <button
          type="button"
          className="nav-group-label"
          onClick={() => toggle(group.id)}
          aria-expanded={expanded}
          aria-controls={`nav-group-${group.id}`}
        >
          <Icon name={group.icon} size={16} className="ico" />
          <span className="nav-label">{group.label}</span>
          <span className="nav-group-caret" aria-hidden>
            {expanded ? '−' : '+'}
          </span>
        </button>
        {expanded ? (
          <div id={`nav-group-${group.id}`}>
            {group.children.map((child) => {
              const count = countFor(child.indicator)
              const danger = child.indicator === 'connection' && indicators.connectionIssue
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`nav-subitem ${isActivePath(pathname, child.href) ? 'active' : ''}`}
                  title={child.label}
                >
                  <span className="nav-label">{child.label}</span>
                  {count > 0 ? (
                    <span
                      className="nav-count"
                      {...(child.attention ? { 'data-attention': '' } : {})}
                    >
                      {count}
                    </span>
                  ) : null}
                  {danger ? (
                    <span
                      className="nav-dot-danger"
                      style={{ marginLeft: 'auto' }}
                      aria-label="Needs attention"
                    />
                  ) : null}
                </Link>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <nav>{NAV_GROUPS.map(renderGroup)}</nav>
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>{ADMIN_GROUPS.map(renderGroup)}</div>
    </>
  )
}
