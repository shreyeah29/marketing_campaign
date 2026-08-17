import type { IconName } from '@/components/icon'

export const CHIPS = [
  'Social Media Campaign',
  'Meta Ads',
  'Google Ads',
  'LinkedIn Campaign',
  'Email Marketing',
  'Content Calendar',
  'Product Launch',
  'Brand Awareness',
  'Lead Generation',
  'Seasonal Campaign',
  'Website Content',
  'Landing Page',
  'Blog Articles',
  'Marketing Strategy',
  'Complete 360° Campaign',
]

/** Command Center suggestion rows — chip label → editable full sentence. */
export const SUGGESTION_ROWS: {
  id: string
  label: string
  items: { label: string; sentence: string }[]
}[] = [
  {
    id: 'launch',
    label: 'Launch',
    items: [
      {
        label: 'Product launch',
        sentence:
          'Launch my new product to the right audience with a mix of awareness ads, social proof content, and a clear call to buy.',
      },
      {
        label: 'Festive campaign',
        sentence:
          'Run a festive campaign that feels seasonal and gift-ready, with offers, social posts, and paid ads timed for peak shopping days.',
      },
      {
        label: 'Brand awareness',
        sentence:
          'Build brand awareness with consistent storytelling across social and paid, focused on reach and memorable creative.',
      },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    items: [
      {
        label: 'Get more leads',
        sentence:
          'Generate more qualified leads with lead magnets, retargeting, and clear CTAs that push people into our CRM.',
      },
      {
        label: 'Increase traffic',
        sentence:
          'Increase website traffic with SEO-friendly content, social distribution, and paid campaigns aimed at high-intent searches.',
      },
      {
        label: 'Improve sales',
        sentence:
          'Improve sales this month with conversion-focused creatives, email follow-ups, and remarketing to warm audiences.',
      },
    ],
  },
  {
    id: 'channel',
    label: 'Channel',
    items: [
      {
        label: 'Instagram campaign',
        sentence:
          'Create an Instagram campaign with posts, Reels, and Stories that match my brand tone and drive profile visits and leads.',
      },
      {
        label: 'Meta ads',
        sentence:
          'Plan Meta ads with clear audiences, creative variants, and a budget split between prospecting and retargeting.',
      },
      {
        label: 'Google ads',
        sentence:
          'Set up Google ads focused on high-intent keywords, strong landing pages, and measurable cost per lead.',
      },
      {
        label: 'Email campaign',
        sentence:
          'Write an email campaign sequence that nurtures subscribers from awareness to conversion with clear next steps.',
      },
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse',
    items: [
      {
        label: 'Competitor analysis',
        sentence:
          'Analyse my top competitors’ positioning, channels, and creative angles, then recommend where we can win.',
      },
      {
        label: 'Improve last campaign',
        sentence:
          'Review my last campaign’s performance and propose a follow-up plan that fixes weak spots and doubles down on what worked.',
      },
      {
        label: 'Content for next month',
        sentence:
          'Plan a month of content across my channels with themes, formats, and a posting cadence I can approve and schedule.',
      },
    ],
  },
]

export const SECTIONS: {
  id: string
  label: string
  icon: IconName
  kinds?: string[]
  statuses?: string[]
  scheduled?: boolean
}[] = [
  { id: 'overview', label: 'Overview', icon: 'layout' },
  { id: 'strategy', label: 'Strategy', icon: 'target' },
  { id: 'calendar', label: 'Content Calendar', icon: 'calendar', scheduled: true },
  {
    id: 'social',
    label: 'Social Posts',
    icon: 'megaphone',
    kinds: ['POST', 'CAPTION', 'STORY', 'REEL'],
  },
  {
    id: 'ads',
    label: 'Advertisements',
    icon: 'zap',
    kinds: ['AD_COPY', 'AD_HEADLINE', 'AD_DESCRIPTION'],
  },
  { id: 'email', label: 'Email Campaign', icon: 'mail', kinds: ['EMAIL'] },
  { id: 'landing', label: 'Landing Page', icon: 'layout', kinds: ['LANDING'] },
  { id: 'blog', label: 'Blog Content', icon: 'file-text', kinds: ['BLOG', 'ARTICLE'] },
  { id: 'media', label: 'Media Assets', icon: 'image', kinds: ['IMAGE_PROMPT', 'VIDEO_PROMPT'] },
  {
    id: 'review',
    label: 'Review Queue',
    icon: 'check-square',
    statuses: ['GENERATED', 'NEEDS_REVIEW', 'DRAFT'],
  },
  { id: 'publishing', label: 'Publishing', icon: 'send', statuses: ['SCHEDULED', 'PUBLISHED'] },
  { id: 'analytics', label: 'Analytics', icon: 'bar-chart' },
]

export const REVIEW_STATUSES = ['GENERATED', 'NEEDS_REVIEW', 'DRAFT'] as const

export const LIVE_ASSET_STATUSES = ['PUBLISHED', 'SCHEDULED'] as const

export const ENDED_CAMPAIGN_STATUSES = ['COMPLETED', 'ARCHIVED', 'ENDED'] as const

export const TEMPLATE_CATEGORY = 'Campaign template'

/** Brief Part 3 §5 — one question per screen, this order. */
export const INTAKE_STEPS = ['objective', 'channels', 'audience', 'duration'] as const
export type IntakeStep = (typeof INTAKE_STEPS)[number]

export const INTAKE_OBJECTIVES: {
  id: string
  label: string
  consequence: string
  icon: IconName
  recommendChannels: string[]
}[] = [
  {
    id: 'sales',
    label: 'Sales',
    consequence: 'Optimised for conversion, ad spend weighted to retargeting.',
    icon: 'dollar-sign',
    recommendChannels: ['Instagram', 'Facebook', 'Google', 'Email'],
  },
  {
    id: 'leads',
    label: 'Leads',
    consequence: 'Forms and CTAs first; nurture sequences after the click.',
    icon: 'filter',
    recommendChannels: ['Instagram', 'Facebook', 'LinkedIn', 'Email'],
  },
  {
    id: 'awareness',
    label: 'Awareness',
    consequence: 'Reach and frequency over conversion; broad creative tests.',
    icon: 'megaphone',
    recommendChannels: ['Instagram', 'Facebook', 'YouTube', 'X'],
  },
  {
    id: 'traffic',
    label: 'Traffic',
    consequence: 'Site visits and landing engagement; SEO + paid search lean.',
    icon: 'external-link',
    recommendChannels: ['Google', 'Instagram', 'Facebook', 'Email'],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    consequence: 'Comments, shares, and community — social-native formats.',
    icon: 'message-square',
    recommendChannels: ['Instagram', 'Facebook', 'LinkedIn', 'X'],
  },
  {
    id: 'retention',
    label: 'Retention',
    consequence: 'Keep customers active with email, CRM, and remarketing.',
    icon: 'refresh',
    recommendChannels: ['Email', 'Facebook', 'Instagram', 'WhatsApp'],
  },
]

export const INTAKE_CHANNELS = [
  { id: 'Instagram', platform: 'INSTAGRAM', meta: true },
  { id: 'Facebook', platform: 'FACEBOOK', meta: true },
  { id: 'LinkedIn', platform: 'LINKEDIN', meta: false },
  { id: 'X', platform: 'X', meta: false },
  { id: 'Google', platform: 'GOOGLE', meta: false },
  { id: 'Email', platform: 'EMAIL', meta: false },
  { id: 'YouTube', platform: 'YOUTUBE', meta: false },
  { id: 'WhatsApp', platform: 'WHATSAPP', meta: true },
] as const

export const INTAKE_LOCATIONS = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'Jaipur',
  'Chandigarh',
  'India — nationwide',
  'United States',
  'United Kingdom',
  'UAE',
  'Singapore',
]

export const INTAKE_INTEREST_SUGGESTIONS = [
  'Skincare',
  'Fitness',
  'Luxury fashion',
  'Parenting',
  'SaaS buyers',
  'Home décor',
  'Food & dining',
  'Travel',
  'Personal finance',
  'Wellness',
  'B2B decision makers',
  'Students',
]

export const INTAKE_LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Marathi', 'Bengali']

export const INTAKE_DURATIONS = [7, 15, 30, 90] as const

/**
 * How hard a campaign pushes, as a share of the monthly ad allowance.
 *
 * This replaced a rupee budget field. A client typing ₹25,000 stopped meaning
 * anything the moment we began funding the media: the allowance governs what a
 * flight can spend, so a number they type is either ignored or contradicts it.
 *
 * The generator still needs a signal — deliverable counts key off it, and a heavy
 * push wants more concepts than a light one — so the question is asked in the one
 * unit a client is allowed to see. The rupee figure is derived from the share and
 * kept operator-visible, so nothing downstream that expects a budget breaks.
 */
export const CAMPAIGN_PACES = [
  {
    id: 'light',
    label: 'Light',
    sharePct: 15,
    blurb: 'A steady presence. Fewer concepts, spread across the month.',
  },
  {
    id: 'standard',
    label: 'Standard',
    sharePct: 35,
    blurb: 'The default. Enough reach to read the results.',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    sharePct: 60,
    blurb: 'A hard push for a short window — a launch or a sale weekend.',
  },
] as const

export type CampaignPaceId = (typeof CAMPAIGN_PACES)[number]['id']

export const DEFAULT_PACE: CampaignPaceId = 'standard'

export function paceById(id: string | undefined): (typeof CAMPAIGN_PACES)[number] {
  return CAMPAIGN_PACES.find((p) => p.id === id) ?? CAMPAIGN_PACES[1]
}

/**
 * Whether a pace fits in what is left of the month.
 *
 * Compared in percentage points, never in currency: `usedPct` is the only
 * allowance figure the tenant plane receives, and a share is the same unit. A
 * pace that does not fit is refused rather than silently trimmed — a campaign
 * that quietly runs at half the push someone chose is worse than being told why
 * it cannot.
 */
export function paceFits(sharePct: number, allowanceUsedPct: number): boolean {
  return sharePct <= Math.max(0, 100 - allowanceUsedPct)
}

/** @deprecated Old drafts may still store a tone string. */
export const INTAKE_TONES = [
  'Professional',
  'Friendly',
  'Bold',
  'Elegant',
  'Playful',
  'Urgent',
] as const

export function normalizeIntakeStep(raw: string | null | undefined): IntakeStep {
  if (raw === 'tone') return 'duration'
  if (raw && (INTAKE_STEPS as readonly string[]).includes(raw)) return raw as IntakeStep
  return 'objective'
}
