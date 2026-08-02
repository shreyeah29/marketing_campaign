'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import type { PortfolioAnalytics, PortfolioOrg } from '@/lib/types'
import { Badge, Banner, LoadingScreen } from '@/components/ui'
import { StatCard } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

function money(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

/** Dormant = no recorded activity in 14 days. The operator's early-warning flag. */
function isDormant(org: PortfolioOrg): boolean {
  if (!org.lastActivityAt) return true
  return Date.now() - new Date(org.lastActivityAt).getTime() > 14 * 86_400_000
}

export default function PortfolioAnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<PortfolioAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    platform
      .analytics()
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/platform/login')
          return
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load analytics')
      })
  }, [router])

  if (error) return <Banner kind="error">{error}</Banner>
  if (!data) return <LoadingScreen />

  const dormant = data.organizations.filter(isDormant)

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Portfolio analytics</h1>
          <p className="page-sub">
            Every client, their usage, and what your service is producing for them.
          </p>
        </div>
      </div>

      <Stagger className="cols-4 grid" interval={0.05} style={{ marginBottom: 22 }}>
        <StaggerItem>
          <StatCard label="Clients" value={data.totals.organizations} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Active" value={data.totals.active} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Leads · 30d" value={data.totals.leads30d.toLocaleString()} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Client revenue won" value={money(data.totals.revenueWonUsd)} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Campaigns" value={data.totals.campaigns.toLocaleString()} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Assets generated" value={data.totals.assetsGenerated.toLocaleString()} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Seats" value={data.totals.members.toLocaleString()} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="AI cost (yours)" value={money(data.totals.aiCostUsd)} />
        </StaggerItem>
      </Stagger>

      {dormant.length > 0 ? (
        <FadeIn delay={0.15}>
          <div
            className="banner"
            style={{ borderColor: 'color-mix(in srgb, var(--warn) 45%, transparent)' }}
          >
            <strong>
              {dormant.length} client{dormant.length === 1 ? '' : 's'} dormant
            </strong>{' '}
            — no activity in 14+ days: {dormant.map((o) => o.name).join(', ')}
          </div>
        </FadeIn>
      ) : null}

      <FadeIn delay={0.2} className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th>Modules</th>
              <th>Leads (30d / all)</th>
              <th>Campaigns</th>
              <th>Assets</th>
              <th>Revenue won</th>
              <th>AI cost</th>
              <th>Fee / margin</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {data.organizations.map((org) => (
              <tr
                key={org.id}
                className="row-link"
                onClick={() => router.push(`/platform/organizations/${org.id}`)}
              >
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    {org.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={org.logoUrl}
                        alt=""
                        style={{
                          width: 28,
                          height: 28,
                          objectFit: 'contain',
                          borderRadius: 7,
                          background: '#fff',
                          border: '1px solid var(--border)',
                        }}
                      />
                    ) : (
                      <span className="avatar">{org.name.charAt(0).toUpperCase()}</span>
                    )}
                    <span>
                      <div style={{ fontWeight: 600 }}>{org.name}</div>
                      <div className="dim mono" style={{ fontSize: 11 }}>
                        {org.slug}
                      </div>
                    </span>
                  </div>
                </td>
                <td>
                  <Badge status={org.status}>{org.status}</Badge>
                </td>
                <td>{org.modules.length}</td>
                <td>
                  <strong>{org.leads30d}</strong>
                  <span className="dim"> / {org.leadsTotal}</span>
                </td>
                <td>{org.campaigns}</td>
                <td>{org.assetsGenerated}</td>
                <td>{money(org.revenueWonUsd)}</td>
                <td className="dim">{money(org.aiCostUsd)}</td>
                <td>
                  {org.monthlyFeeUsd !== null ? (
                    <>
                      {money(String(org.monthlyFeeUsd))}
                      <span
                        style={{
                          color: Number(org.marginUsd) >= 0 ? 'var(--ok)' : 'var(--danger)',
                          fontWeight: 600,
                          marginLeft: 6,
                        }}
                      >
                        {Number(org.marginUsd) >= 0 ? '+' : ''}
                        {money(org.marginUsd ?? '0')}
                      </span>
                    </>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </td>
                <td className={isDormant(org) ? '' : 'dim'}>
                  {isDormant(org) ? (
                    <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                      {ago(org.lastActivityAt)}
                    </span>
                  ) : (
                    ago(org.lastActivityAt)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FadeIn>
    </>
  )
}
