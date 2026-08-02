export interface Asset {
  id: string
  platform: string
  kind: string
  status: string
  title?: string | null
  body: string
  caption?: string | null
  hashtags?: string[]
  cta?: string | null
  scheduledFor?: string | null
  mediaUrl?: string | null
  aiVersions?: { variants?: string[] } | null
}

export interface Campaign {
  id: string
  name: string
  objective?: string | null
  status?: string | null
  strategy?: { summary?: string; goals?: string[]; schedule?: string | null } | null
  targetAudience?: { description?: string | null } | null
  budgetTotal?: number | null
  createdAt?: string
}

export interface CampaignPlan {
  campaignName: string
  objective: string
  audience: string
  strategy: string
  platforms: string[]
  durationDays: number
  suggestedBudget: number
  deliverables: string[]
  estimatedAssets: number
}

export interface CreateDraft {
  id: string
  brief: string
  prompt?: string | undefined
  selectedChips?: string[] | undefined
  plan?: CampaignPlan | undefined
  step?: string | undefined
  /** Guided intake fields (browser-only). */
  objective?: string | undefined
  audience?: string | undefined
  channels?: string[] | undefined
  tone?: string | undefined
  updatedAt: string
}
