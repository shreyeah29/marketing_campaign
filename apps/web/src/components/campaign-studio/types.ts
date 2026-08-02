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
  /** Guided intake — objective id from INTAKE_OBJECTIVES. */
  objective?: string | undefined
  /** Free-text audience summary (built from structured fields). */
  audience?: string | undefined
  channels?: string[] | undefined
  /** @deprecated Replaced by duration step; kept for old browser drafts. */
  tone?: string | undefined
  audienceAgeMin?: number | undefined
  audienceAgeMax?: number | undefined
  audienceGender?: string | undefined
  audienceLocations?: string[] | undefined
  audienceInterests?: string[] | undefined
  audienceLanguages?: string[] | undefined
  audienceOccupation?: string | undefined
  durationDays?: number | undefined
  customStart?: string | undefined
  customEnd?: string | undefined
  budget?: number | undefined
  planApproved?: boolean | undefined
  /** Content formats: posts, stories, reels, ads */
  formats?: string[] | undefined
  /** Generate AI image posters (Runway via generate-media). */
  wantPosters?: boolean | undefined
  /** Generate AI video concepts (Runway). */
  wantVideos?: boolean | undefined
  /** Visual direction / look & feel. */
  lookFeel?: string | undefined
  updatedAt: string
}
