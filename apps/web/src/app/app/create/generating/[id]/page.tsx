'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import {
  SkeletonList,
  fetchAssets,
  fetchCampaignById,
  type Asset,
  type Campaign,
} from '@/components/campaign-studio'

/**
 * Generation progress — polls assets for the new campaign id, then offers
 * "Review assets →" into the campaign container.
 */
export default function GeneratingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = params.id

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [ticks, setTicks] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      const [c, a] = await Promise.all([fetchCampaignById(campaignId), fetchAssets(campaignId)])
      if (cancelled) return
      if (c) setCampaign(c)
      else setCampaign({ id: campaignId, name: 'Campaign' })
      setAssets(a)
      setTicks((t) => t + 1)
    }
    void tick()
    const id = window.setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [campaignId])

  const ready = (assets?.length ?? 0) > 0
  const reviewHref = `/app/campaigns/${campaignId}/assets`

  return (
    <FadeIn style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 48px' }}>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="sparkles" size={18} style={{ color: 'var(--iris-600)' }} />
        <div
          className="dim"
          style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Generating assets
        </div>
      </div>
      <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}>
        {campaign?.name ?? 'Your campaign'}
      </h1>
      <p className="muted" style={{ marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        {ready
          ? `${assets!.length} asset${assets!.length === 1 ? '' : 's'} ready for review.`
          : 'The AI is drafting your first set of assets. This screen refreshes automatically.'}
      </p>

      {assets === null || (!ready && ticks < 8) ? (
        <>
          <SkeletonList />
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <Spinner />
            <span className="dim" style={{ fontSize: 13 }}>
              Generating…
            </span>
          </div>
        </>
      ) : ready ? (
        <div className="stack" style={{ gap: 10 }}>
          {assets!.slice(0, 6).map((a) => (
            <div key={a.id} className="card" style={{ padding: 14 }}>
              <div className="spread" style={{ alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {a.platform} · {a.kind}
                </div>
                <span className="dim" style={{ fontSize: 12 }}>
                  {a.status}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {a.body.slice(0, 140)}
                {a.body.length > 140 ? '…' : ''}
              </div>
            </div>
          ))}
          {(assets?.length ?? 0) > 6 ? (
            <div className="dim" style={{ fontSize: 12 }}>
              +{(assets?.length ?? 0) - 6} more
            </div>
          ) : null}
        </div>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <p className="muted" style={{ fontSize: 14 }}>
            No assets yet. Generation can take a moment — you can open the campaign workspace and
            refresh there.
          </p>
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 28, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => router.push('/app/create')}>
          Back to Create
        </button>
        <Link className={`btn primary ${ready ? '' : ''}`.trim()} href={reviewHref}>
          Review assets →
        </Link>
      </div>
    </FadeIn>
  )
}
