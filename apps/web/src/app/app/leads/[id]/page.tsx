'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader } from '@/components/kit'
import { Spinner } from '@/components/ui'
import { FadeIn } from '@/components/motion'
import { Chip } from '@/components/status'

interface BoardLead {
  id: string
  status: string
  source: string | null
  medium: string | null
  score: number
  value: string | null
  tags: string[]
  createdAt: string
  lastContactedAt: string | null
  contact: { name: string; email: string | null; phone: string | null } | null
  campaign: { id: string; name: string } | null
}

/**
 * Lead detail — no GET /leads/:id in the contract; list-find from GET /leads/board.
 */
export default function LeadDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [lead, setLead] = useState<BoardLead | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<BoardLead[]>('/leads/board')
      .then((rows) => {
        const found = rows.find((r) => r.id === params.id) ?? null
        setLead(found)
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : 'Failed to load leads')
        setLead(null)
      })
  }, [params.id])

  if (error) {
    return (
      <>
        <PageHeader title="Lead" />
        <ErrorState message={error} onRetry={() => router.refresh()} />
      </>
    )
  }

  if (lead === undefined) {
    return (
      <div className="row" style={{ gap: 8, padding: 24 }}>
        <Spinner />
        <span className="dim">Loading…</span>
      </div>
    )
  }

  if (!lead) {
    return (
      <EmptyState
        icon="users"
        title="Lead not found"
        hint="There is no GET /leads/:id — this page finds the lead on the board list. It may have been removed or is outside this workspace."
        action={
          <Link className="btn" href="/app/leads">
            Back to leads
          </Link>
        }
      />
    )
  }

  return (
    <FadeIn>
      <PageHeader
        title={lead.contact?.name ?? 'Lead'}
        subtitle="From the board list (no dedicated detail endpoint)."
        actions={
          <Link className="btn ghost sm" href="/app/crm/leads">
            Open board
          </Link>
        }
      />
      <div className="card" style={{ padding: 20, maxWidth: 560 }}>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Status
            </div>
            <Chip>{lead.status}</Chip>
          </div>
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Score
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{lead.score}</div>
          </div>
          {lead.contact?.email ? (
            <div>
              <div className="dim" style={{ fontSize: 12 }}>
                Email
              </div>
              <div>{lead.contact.email}</div>
            </div>
          ) : null}
          {lead.contact?.phone ? (
            <div>
              <div className="dim" style={{ fontSize: 12 }}>
                Phone
              </div>
              <div>{lead.contact.phone}</div>
            </div>
          ) : null}
          {lead.source ? (
            <div>
              <div className="dim" style={{ fontSize: 12 }}>
                Source
              </div>
              <div>{lead.source}</div>
            </div>
          ) : null}
          {lead.campaign ? (
            <div>
              <div className="dim" style={{ fontSize: 12 }}>
                Campaign
              </div>
              <Link href={`/app/campaigns/${lead.campaign.id}/assets`}>{lead.campaign.name}</Link>
            </div>
          ) : null}
          <div>
            <div className="dim" style={{ fontSize: 12 }}>
              Created
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              {new Date(lead.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
