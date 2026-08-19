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
  /**
   * Why generation gave up, when it did.
   *
   * Set by the API alongside `status: 'FAILED'`. Present so a tile can say what
   * went wrong instead of sitting empty — the state that used to be
   * indistinguishable from "still working".
   */
  failureReason?: string | null
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
  /**
   * How hard the campaign pushes — `light` | `standard` | `heavy`. Replaces the
   * rupee budget a client used to type; see CAMPAIGN_PACES for why.
   */
  pace?: string | undefined
  /**
   * Derived from `pace` and the organisation's allocation, in minor units.
   *
   * Kept so the brief, the plan and the ad flight still have a figure to work
   * with — but derived, never typed, and never rendered to a tenant. It is the
   * operator-visible half of the same decision.
   */
  budget?: number | undefined
  planApproved?: boolean | undefined
  /**
   * Set the moment generation is kicked off for this draft. Guards the
   * auto-start: revisiting the strategy screen must not create a second
   * campaign and bill for a second set of posters.
   */
  generatedCampaignId?: string | undefined
  /** Content formats: posts, stories, reels, ads */
  formats?: string[] | undefined
  /** Generate AI image posters (Runway via generate-media). */
  wantPosters?: boolean | undefined
  /** Generate AI video concepts (Runway). */
  wantVideos?: boolean | undefined
  /** Visual direction / look & feel. */
  lookFeel?: string | undefined
  /** Exact number of unique social post concepts (not per-platform). */
  postCount?: 1 | 2 | 3 | 5 | 10 | 20 | undefined
  /**
   * Words to typeset on the artwork, in the person's own hand.
   *
   * Separate from the brief because the brief describes the campaign and this is
   * literal output: what a reader will see printed on the picture. Inferring it
   * from prose is how "1+1 on Rakshabandhan" ended up in a caption and on no
   * poster at all.
   */
  posterText?: string | undefined
  /**
   * Which kinds of picture this campaign wants.
   *
   * Both may be on: a run of five concepts can be three photographs and two
   * designed posters. The choice decides which model draws each one — a
   * photographer that cannot spell, or a designer that can — and getting it
   * wrong is how "1+1 on Rakshabandhan" came back as a picture with the offer
   * missing.
   */
  wantPosterDesigns?: boolean | undefined
  wantPhotography?: boolean | undefined
  /** A stored URL for the poster whose look this campaign follows. */
  referenceImageUrl?: string | undefined
  /** Number of unique video concepts (0–3). */
  videoCount?: 0 | 1 | 2 | 3 | undefined
  /** Ad platforms to generate for. */
  adPlatforms?: string[] | undefined
  /** Generate email sequence copy. */
  wantEmails?: boolean | undefined
  /** Generate landing page copy. */
  wantLanding?: boolean | undefined
  updatedAt: string
}

/**
 * Client-only grouping of flat API assets into one creative concept
 * with platform adaptations. Not persisted — derived from Asset[].
 */
export interface ContentPiece {
  id: string
  index: number
  label: string
  /** Master IMAGE_PROMPT or VIDEO_PROMPT when present. */
  master: Asset | null
  /** Platform copy adaptations (POST, CAPTION, AD_*, etc.). */
  adaptations: Asset[]
  /** All assets in this piece (master first). */
  assets: Asset[]
}
