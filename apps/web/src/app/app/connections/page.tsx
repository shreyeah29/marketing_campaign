'use client'

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { MetaConnectCard } from '@/components/meta-connect'
import { PageHeader, EmptyState } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip } from '@/components/status'
import { Spinner } from '@/components/ui'

interface SocialAccount {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
}

export default function ConnectionsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null)

  useEffect(() => {
    api
      .get<SocialAccount[]>('/social/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, [])

  return (
    <FadeIn>
      <PageHeader
        title="Connections"
        subtitle="Connected ad and social accounts for this workspace."
      />

      <div className="stack" style={{ gap: 24, maxWidth: 720 }}>
        <MetaConnectCard />

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Social accounts</h2>
          {accounts === null ? (
            <Spinner />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon="plug"
              title="No social accounts yet"
              hint="Connect channels under Marketing → Social, or finish Meta setup above."
            />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <PlatformIcon platform={a.platform} size={20} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {a.displayName ?? a.handle ?? a.platform}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {a.platform}
                      {a.handle ? ` · ${a.handle}` : ''}
                    </div>
                  </div>
                  <Chip>{a.status}</Chip>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </FadeIn>
  )
}
