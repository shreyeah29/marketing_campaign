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

export const INTAKE_STEPS = ['objective', 'audience', 'channels', 'tone'] as const
export type IntakeStep = (typeof INTAKE_STEPS)[number]

export const INTAKE_CHANNELS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'X',
  'Google',
  'Email',
] as const

export const INTAKE_TONES = [
  'Professional',
  'Friendly',
  'Bold',
  'Elegant',
  'Playful',
  'Urgent',
] as const
