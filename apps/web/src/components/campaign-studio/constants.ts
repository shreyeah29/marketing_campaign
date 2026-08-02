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
