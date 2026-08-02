'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { fetchAssets, fetchCampaignById } from './api'
import type { Asset, Campaign } from './types'
import { ENDED_CAMPAIGN_STATUSES, LIVE_ASSET_STATUSES } from './constants'

interface CampaignContextValue {
  campaignId: string
  campaign: Campaign | null
  assets: Asset[] | null
  loading: boolean
  error: string | null
  reload: () => void
  showPerformance: boolean
  showReport: boolean
}

const CampaignContext = createContext<CampaignContextValue | null>(null)

export function CampaignProvider({
  campaignId,
  children,
}: {
  campaignId: string
  children: ReactNode
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchCampaignById(campaignId), fetchAssets(campaignId)])
      .then(([c, a]) => {
        if (!c) {
          setCampaign({ id: campaignId, name: 'Campaign' })
          setError('Campaign not found in list — showing a minimal shell.')
        } else {
          setCampaign(c)
        }
        setAssets(a)
      })
      .catch(() => {
        setError('Could not load this campaign')
        setCampaign(null)
        setAssets([])
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(reload, [reload])

  const showPerformance = useMemo(() => {
    const status = (campaign?.status ?? '').toUpperCase()
    if (['LIVE', 'ACTIVE', 'RUNNING', 'PUBLISHED'].includes(status)) return true
    return (assets ?? []).some((a) => (LIVE_ASSET_STATUSES as readonly string[]).includes(a.status))
  }, [campaign, assets])

  const showReport = useMemo(() => {
    const status = (campaign?.status ?? '').toUpperCase()
    return (ENDED_CAMPAIGN_STATUSES as readonly string[]).includes(status)
  }, [campaign])

  const value: CampaignContextValue = {
    campaignId,
    campaign,
    assets,
    loading,
    error,
    reload,
    showPerformance,
    showReport,
  }

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext)
  if (!ctx) throw new Error('useCampaign must be used within CampaignProvider')
  return ctx
}
