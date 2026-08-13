'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { PageHeader } from '@/components/kit'
import { fetchCampaigns, type Campaign } from '@/components/campaign-studio'

type AnalyticsFilters = {
  days: string
  campaignId: string
  setDays: (d: string) => void
  setCampaignId: (id: string) => void
  campaigns: Campaign[]
}

const Ctx = createContext<AnalyticsFilters | null>(null)

export function useAnalyticsFilters(): AnalyticsFilters {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAnalyticsFilters requires analytics layout')
  return v
}

const TABS = [
  { href: '/app/analytics/overview', label: 'Overview' },
  { href: '/app/analytics/channels', label: 'Channels' },
  { href: '/app/analytics/audience', label: 'Audience' },
  { href: '/app/analytics/revenue', label: 'Revenue' },
]

const STORAGE = 'mos:analytics-filters:v1'

/**
 * Analytics shell — four tabs with persisted date + campaign filter (brief §14).
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const search = useSearchParams()
  const [days, setDaysState] = useState('30')
  const [campaignId, setCampaignState] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE)
      if (raw) {
        const parsed = JSON.parse(raw) as { days?: string; campaignId?: string }
        if (parsed.days) setDaysState(parsed.days)
        if (parsed.campaignId) setCampaignState(parsed.campaignId)
      }
    } catch {
      /* ignore */
    }
    const qDays = search.get('days')
    const qCamp = search.get('campaignId')
    if (qDays) setDaysState(qDays)
    if (qCamp) setCampaignState(qCamp)
    void fetchCampaigns().then(setCampaigns)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persist(next: { days: string; campaignId: string }) {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function setDays(d: string) {
    setDaysState(d)
    persist({ days: d, campaignId })
  }

  function setCampaignId(id: string) {
    setCampaignState(id)
    persist({ days, campaignId: id })
  }

  const value = useMemo(
    () => ({ days, campaignId, setDays, setCampaignId, campaigns }),
    [days, campaignId, campaigns],
  )

  // Extra IA routes redirect into the four-tab shell.
  useEffect(() => {
    if (pathname === '/app/analytics/leads') router.replace('/app/analytics/overview')
    if (pathname === '/app/analytics/campaigns') router.replace('/app/analytics/channels')
    if (pathname === '/app/analytics/reports') router.replace('/app/analytics/overview')
    if (pathname === '/app/analytics/ai-usage') router.replace('/app/analytics/overview')
  }, [pathname, router])

  return (
    <Ctx.Provider value={value}>
      <PageHeader
        title="Analytics"
        subtitle="Overview, channels, audience, and revenue — filters persist across tabs."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select
              className="input"
              style={{ width: 'auto' }}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-label="Date range"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
            <select
              className="input"
              style={{ width: 'auto', minWidth: 160 }}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="Campaign filter"
            >
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <nav className="an-tabs" aria-label="Analytics">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`an-tabs__tab${active ? ' is-active' : ''}`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </Ctx.Provider>
  )
}
