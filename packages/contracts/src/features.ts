import { z } from 'zod'

/**
 * The Feature Registry.
 *
 * This is the source of truth for *what a feature is*. Whether a given
 * organisation *has* a feature is data (`FeatureAssignment` in the database);
 * this file is the immutable, code-reviewed definition that data points at.
 *
 * The split is the whole design. A feature's code has to exist — a "Contacts"
 * page is a real controller and a real route — so the definition lives in code
 * and is git-reviewable and type-safe. But which client gets it, on what plan, at
 * what limit, is configuration a platform owner edits without a deploy. Onboarding
 * a client with any combination of *existing* features is therefore code-free; a
 * genuinely new module is one plugin manifest registered here, after which it is
 * assignable like any other — the core never changes.
 *
 * Every manifest is synced into a `feature` table at deploy time so assignments
 * have referential integrity, and a boot assertion rejects any assignment whose
 * key has no manifest — you can never enable a feature whose code isn't present.
 */

/** Top-level grouping, so the UI renders expandable sections not a flat list. */
export const FEATURE_CATEGORIES = [
  'CRM',
  'Marketing',
  'AI',
  'Automation',
  'Analytics',
  'Communication',
  'Commerce',
  'Support',
  'Documents',
] as const

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number]

/**
 * How a feature is billed. Referenced by the billing engine so pricing is a
 * property of the feature, not a hardcoded plan table.
 */
export type BillingCategory = 'included' | 'seat' | 'usage' | 'addon' | 'enterprise'

/** A navigation entry the frontend renders when the feature is enabled. */
export interface NavEntry {
  readonly label: string
  readonly path: string
  readonly icon: string
  /** Sort key within the category. Lower comes first. */
  readonly order: number
  /**
   * Section header the entry groups under in the sidebar. Distinct from the
   * billing/registry category so navigation grouping can differ from billing.
   */
  readonly section: string
}

export interface FeatureManifest {
  /** Stable, namespaced id: `<category>.<name>`. Never renamed once shipped. */
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: FeatureCategory
  readonly version: number
  /**
   * Features that must also be enabled for this one to function. Enabling this
   * feature validates the closure; disabling a depended-on feature is refused
   * while a dependent is still enabled.
   */
  readonly dependencies: readonly string[]
  /** Whether a new organisation gets this before any plan is applied. */
  readonly defaultEnabled: boolean
  readonly billingCategory: BillingCategory
  /** Present when the feature adds a sidebar entry. Omitted for invisible features. */
  readonly navEntry?: NavEntry
  /** Permissions a user needs to use it. Enforced by the RBAC guard, listed here so the UI can hide affordances. */
  readonly requiredPermissions: readonly string[]
  /** API route prefixes this feature owns. Used to attach the feature guard and for documentation. */
  readonly apiRoutes: readonly string[]
  /** Frontend routes gated on this feature. Consumed by the router guard. */
  readonly frontendRoutes: readonly string[]
  /** The backend module that implements it. Must correspond to real code. */
  readonly backendModule: string
  /** True for modules built for a single client via a plugin package. */
  readonly custom?: boolean
}

const f = (m: FeatureManifest): FeatureManifest => m

// ─── CRM ─────────────────────────────────────────────────────────────────────

const crm: readonly FeatureManifest[] = [
  f({
    id: 'crm.contacts',
    name: 'Contacts',
    description: 'Store and manage people, with consent tracking per channel.',
    category: 'CRM',
    version: 1,
    dependencies: [],
    defaultEnabled: true,
    billingCategory: 'included',
    navEntry: { label: 'Contacts', path: '/crm/contacts', icon: 'users', order: 10, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/contacts'],
    frontendRoutes: ['/crm/contacts'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.companies',
    name: 'Companies',
    description: 'Organisations that contacts and deals belong to.',
    category: 'CRM',
    version: 1,
    dependencies: [],
    defaultEnabled: true,
    billingCategory: 'included',
    navEntry: { label: 'Companies', path: '/crm/companies', icon: 'building', order: 20, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/companies'],
    frontendRoutes: ['/crm/companies'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.leads',
    name: 'Leads',
    description: 'Prospects with scoring and qualification.',
    category: 'CRM',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: true,
    billingCategory: 'included',
    navEntry: { label: 'Leads', path: '/crm/leads', icon: 'target', order: 30, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/leads'],
    frontendRoutes: ['/crm/leads'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.pipelines',
    name: 'Pipelines',
    description: 'Configurable deal stages.',
    category: 'CRM',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'included',
    navEntry: { label: 'Pipelines', path: '/crm/pipelines', icon: 'columns', order: 40, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/pipelines'],
    frontendRoutes: ['/crm/pipelines'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.deals',
    name: 'Deals',
    description: 'Opportunities moving through a pipeline.',
    category: 'CRM',
    version: 1,
    // A deal has no meaning without a pipeline to sit in. The dependency is
    // enforced, not documentary.
    dependencies: ['crm.pipelines'],
    defaultEnabled: false,
    billingCategory: 'included',
    navEntry: { label: 'Deals', path: '/crm/deals', icon: 'handshake', order: 50, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/deals'],
    frontendRoutes: ['/crm/deals'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.tasks',
    name: 'Tasks',
    description: 'To-dos linked to CRM records.',
    category: 'CRM',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'included',
    navEntry: { label: 'Tasks', path: '/crm/tasks', icon: 'check-square', order: 60, section: 'CRM' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/tasks'],
    frontendRoutes: ['/crm/tasks'],
    backendModule: 'crm',
  }),
  f({
    id: 'crm.notes',
    name: 'Notes',
    description: 'Free-form notes on contacts and deals.',
    category: 'CRM',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'included',
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/notes'],
    frontendRoutes: [],
    backendModule: 'crm',
  }),
]

// ─── Marketing ───────────────────────────────────────────────────────────────

const marketing: readonly FeatureManifest[] = [
  f({
    id: 'marketing.campaigns',
    name: 'Campaigns',
    description: 'AI-generated campaigns and the content review queue.',
    category: 'Marketing',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Campaigns', path: '/marketing/campaigns', icon: 'megaphone', order: 35, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/campaign-assets'],
    frontendRoutes: ['/marketing/campaigns'],
    backendModule: 'marketing',
  }),
  f({
    id: 'marketing.email',
    name: 'Email Campaigns',
    description: 'Bulk and sequenced email with open/click tracking.',
    category: 'Marketing',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Email', path: '/marketing/email', icon: 'mail', order: 10, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/email'],
    frontendRoutes: ['/marketing/email'],
    backendModule: 'messaging',
  }),
  f({
    id: 'marketing.sms',
    name: 'SMS',
    description: 'Outbound SMS campaigns.',
    category: 'Marketing',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'SMS', path: '/marketing/sms', icon: 'message-square', order: 20, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/sms'],
    frontendRoutes: ['/marketing/sms'],
    backendModule: 'messaging',
  }),
  f({
    id: 'marketing.whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp Business messaging and broadcasts.',
    category: 'Marketing',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'WhatsApp', path: '/marketing/whatsapp', icon: 'message-circle', order: 30, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/whatsapp'],
    frontendRoutes: ['/marketing/whatsapp'],
    backendModule: 'messaging',
  }),
  f({
    id: 'marketing.social',
    name: 'Social Media',
    description: 'Schedule and publish to social platforms.',
    category: 'Marketing',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Social', path: '/marketing/social', icon: 'share-2', order: 40, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/social'],
    frontendRoutes: ['/marketing/social'],
    backendModule: 'social',
  }),
  f({
    id: 'marketing.seo',
    name: 'SEO',
    description: 'Keyword research and content briefs.',
    category: 'Marketing',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'SEO', path: '/marketing/seo', icon: 'search', order: 50, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/seo'],
    frontendRoutes: ['/marketing/seo'],
    backendModule: 'content',
  }),
  f({
    id: 'marketing.landing_pages',
    name: 'Landing Pages',
    description: 'Build and host landing pages.',
    category: 'Marketing',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Landing Pages', path: '/marketing/pages', icon: 'layout', order: 60, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/landing-pages'],
    frontendRoutes: ['/marketing/pages'],
    backendModule: 'content',
  }),
  f({
    id: 'marketing.forms',
    name: 'Lead Capture Forms',
    description: 'Hosted and embeddable forms that create CRM leads.',
    category: 'Marketing',
    version: 1,
    dependencies: ['crm.leads'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Forms', path: '/marketing/forms', icon: 'clipboard', order: 15, section: 'Marketing' },
    requiredPermissions: ['content:read'],
    apiRoutes: ['/v1/lead-forms'],
    frontendRoutes: ['/marketing/forms'],
    backendModule: 'marketing',
  }),
]

// ─── AI ──────────────────────────────────────────────────────────────────────

const ai: readonly FeatureManifest[] = [
  f({
    id: 'ai.chat',
    name: 'AI Chat',
    description: 'Conversational assistant over the workspace.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'AI Chat', path: '/ai/chat', icon: 'message-square', order: 10, section: 'AI' },
    requiredPermissions: ['agents:run'],
    apiRoutes: ['/v1/ai/chat'],
    frontendRoutes: ['/ai/chat'],
    backendModule: 'agents',
  }),
  f({
    id: 'ai.copywriter',
    name: 'AI Copywriter',
    description: 'Generate marketing copy in the brand voice.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Copywriter', path: '/ai/copywriter', icon: 'pen-tool', order: 20, section: 'AI' },
    requiredPermissions: ['content:write', 'agents:run'],
    apiRoutes: ['/v1/ai/content'],
    frontendRoutes: ['/ai/copywriter'],
    backendModule: 'agents',
  }),
  f({
    id: 'ai.image',
    name: 'AI Image Generation',
    description: 'Generate on-brand imagery.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Image Studio', path: '/ai/images', icon: 'image', order: 30, section: 'AI' },
    requiredPermissions: ['media:write', 'agents:run'],
    apiRoutes: ['/v1/ai/images'],
    frontendRoutes: ['/ai/images'],
    backendModule: 'media',
  }),
  f({
    id: 'ai.video',
    name: 'AI Video Generation',
    description: 'Generate short-form video.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Video Studio', path: '/ai/video', icon: 'video', order: 40, section: 'AI' },
    requiredPermissions: ['media:write', 'agents:run'],
    apiRoutes: ['/v1/ai/video'],
    frontendRoutes: ['/ai/video'],
    backendModule: 'media',
  }),
  f({
    id: 'ai.voice_calling',
    name: 'AI Voice Calling',
    description: 'Outbound AI phone calls.',
    category: 'AI',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Voice AI', path: '/ai/voice', icon: 'phone', order: 50, section: 'AI' },
    requiredPermissions: ['voice:call', 'agents:run'],
    apiRoutes: ['/v1/voice'],
    frontendRoutes: ['/ai/voice'],
    backendModule: 'telephony',
  }),
  f({
    id: 'ai.voice_receptionist',
    name: 'AI Voice Receptionist',
    description: 'Inbound AI call handling.',
    category: 'AI',
    version: 1,
    dependencies: ['ai.voice_calling'],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Receptionist', path: '/ai/receptionist', icon: 'headphones', order: 60, section: 'AI' },
    requiredPermissions: ['voice:call', 'agents:run'],
    apiRoutes: ['/v1/voice/inbound'],
    frontendRoutes: ['/ai/receptionist'],
    backendModule: 'telephony',
  }),
  f({
    id: 'ai.meeting_assistant',
    name: 'AI Meeting Assistant',
    description: 'Transcribe and summarise meetings.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Meeting Assistant', path: '/ai/meetings', icon: 'mic', order: 70, section: 'AI' },
    requiredPermissions: ['agents:run'],
    apiRoutes: ['/v1/ai/meetings'],
    frontendRoutes: ['/ai/meetings'],
    backendModule: 'agents',
  }),
  f({
    id: 'ai.knowledge_base',
    name: 'AI Knowledge Base',
    description: 'RAG corpus the agents cite from.',
    category: 'AI',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Knowledge', path: '/ai/knowledge', icon: 'book-open', order: 80, section: 'AI' },
    requiredPermissions: ['knowledge:read'],
    apiRoutes: ['/v1/knowledge'],
    frontendRoutes: ['/ai/knowledge'],
    backendModule: 'knowledge',
  }),
  f({
    id: 'ai.analytics',
    name: 'AI Analytics',
    description: 'AI-computed performance analysis.',
    category: 'AI',
    version: 1,
    dependencies: ['analytics.dashboard'],
    defaultEnabled: false,
    billingCategory: 'addon',
    requiredPermissions: ['analytics:read', 'agents:run'],
    apiRoutes: ['/v1/ai/analytics'],
    frontendRoutes: [],
    backendModule: 'analytics',
  }),
  f({
    id: 'ai.insights',
    name: 'AI Insights',
    description: 'Proactive recommendations.',
    category: 'AI',
    version: 1,
    dependencies: ['analytics.dashboard'],
    defaultEnabled: false,
    billingCategory: 'addon',
    requiredPermissions: ['analytics:read', 'agents:run'],
    apiRoutes: ['/v1/ai/insights'],
    frontendRoutes: [],
    backendModule: 'analytics',
  }),
]

// ─── Automation ──────────────────────────────────────────────────────────────

const automation: readonly FeatureManifest[] = [
  f({
    id: 'automation.workflows',
    name: 'Workflow Builder',
    description: 'Trigger → condition → action graphs.',
    category: 'Automation',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Workflows', path: '/automation/workflows', icon: 'git-branch', order: 10, section: 'Automation' },
    requiredPermissions: ['automation:read'],
    apiRoutes: ['/v1/automation/workflows'],
    frontendRoutes: ['/automation/workflows'],
    backendModule: 'automation',
  }),
  f({
    id: 'automation.scheduled_jobs',
    name: 'Scheduled Jobs',
    description: 'Cron-scheduled automations.',
    category: 'Automation',
    version: 1,
    dependencies: ['automation.workflows'],
    defaultEnabled: false,
    billingCategory: 'addon',
    requiredPermissions: ['automation:read'],
    apiRoutes: ['/v1/automation/schedules'],
    frontendRoutes: [],
    backendModule: 'automation',
  }),
  f({
    id: 'automation.ai_automation',
    name: 'AI Automation',
    description: 'Agent-driven automation steps.',
    category: 'Automation',
    version: 1,
    dependencies: ['automation.workflows', 'ai.chat'],
    defaultEnabled: false,
    billingCategory: 'usage',
    requiredPermissions: ['automation:write', 'agents:run'],
    apiRoutes: ['/v1/automation/ai'],
    frontendRoutes: [],
    backendModule: 'automation',
  }),
  f({
    id: 'automation.webhooks',
    name: 'Webhooks',
    description: 'Outbound event delivery to customer endpoints.',
    category: 'Automation',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'included',
    navEntry: { label: 'Webhooks', path: '/automation/webhooks', icon: 'webhook', order: 20, section: 'Automation' },
    requiredPermissions: ['automation:read'],
    apiRoutes: ['/v1/webhooks'],
    frontendRoutes: ['/automation/webhooks'],
    backendModule: 'platform',
  }),
]

// ─── Analytics ───────────────────────────────────────────────────────────────

const analytics: readonly FeatureManifest[] = [
  f({
    id: 'analytics.dashboard',
    name: 'Dashboard',
    description: 'Headline KPIs computed from real data.',
    category: 'Analytics',
    version: 1,
    dependencies: [],
    defaultEnabled: true,
    billingCategory: 'included',
    navEntry: { label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard', order: 1, section: 'Overview' },
    requiredPermissions: ['analytics:read'],
    apiRoutes: ['/v1/analytics/dashboard'],
    frontendRoutes: ['/dashboard'],
    backendModule: 'analytics',
  }),
  f({
    id: 'analytics.kpi',
    name: 'KPIs',
    description: 'Configurable key metrics.',
    category: 'Analytics',
    version: 1,
    dependencies: ['analytics.dashboard'],
    defaultEnabled: true,
    billingCategory: 'included',
    requiredPermissions: ['analytics:read'],
    apiRoutes: ['/v1/analytics/channels'],
    frontendRoutes: [],
    backendModule: 'analytics',
  }),
  f({
    id: 'analytics.reports',
    name: 'Reports',
    description: 'Exportable performance reports.',
    category: 'Analytics',
    version: 1,
    dependencies: ['analytics.dashboard'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Reports', path: '/analytics/reports', icon: 'bar-chart-2', order: 10, section: 'Analytics' },
    requiredPermissions: ['analytics:read'],
    apiRoutes: ['/v1/analytics/reports'],
    frontendRoutes: ['/analytics/reports'],
    backendModule: 'analytics',
  }),
  f({
    id: 'analytics.revenue',
    name: 'Revenue Analytics',
    description: 'Revenue attribution and forecasting.',
    category: 'Analytics',
    version: 1,
    dependencies: ['analytics.dashboard', 'crm.deals'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Revenue', path: '/analytics/revenue', icon: 'trending-up', order: 20, section: 'Analytics' },
    requiredPermissions: ['analytics:read'],
    apiRoutes: ['/v1/analytics/revenue'],
    frontendRoutes: ['/analytics/revenue'],
    backendModule: 'analytics',
  }),
]

// ─── Communication ───────────────────────────────────────────────────────────

const communication: readonly FeatureManifest[] = [
  f({
    id: 'comms.gmail',
    name: 'Gmail',
    description: 'Two-way Gmail sync.',
    category: 'Communication',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'included',
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/integrations/gmail'],
    frontendRoutes: [],
    backendModule: 'messaging',
  }),
  f({
    id: 'comms.outlook',
    name: 'Outlook',
    description: 'Two-way Outlook sync.',
    category: 'Communication',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'included',
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/integrations/outlook'],
    frontendRoutes: [],
    backendModule: 'messaging',
  }),
  f({
    id: 'comms.live_chat',
    name: 'Live Chat',
    description: 'Website live chat widget.',
    category: 'Communication',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Live Chat', path: '/inbox/chat', icon: 'message-square', order: 10, section: 'Inbox' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/live-chat'],
    frontendRoutes: ['/inbox/chat'],
    backendModule: 'messaging',
  }),
]

// ─── Commerce ────────────────────────────────────────────────────────────────

const commerce: readonly FeatureManifest[] = [
  f({
    id: 'commerce.billing',
    name: 'Billing',
    description: 'Subscription and plan management.',
    category: 'Commerce',
    version: 1,
    dependencies: [],
    defaultEnabled: true,
    billingCategory: 'included',
    // No client-facing nav: this is a pure service platform with no in-product
    // billing. Feature retained only as an inert entitlement record.
    requiredPermissions: ['billing:read'],
    apiRoutes: [],
    frontendRoutes: [],
    backendModule: 'billing',
  }),
  f({
    id: 'commerce.invoices',
    name: 'Invoices',
    description: 'Generate and track invoices.',
    category: 'Commerce',
    version: 1,
    dependencies: ['commerce.billing'],
    defaultEnabled: false,
    billingCategory: 'addon',
    // Removed from the client interface — no money/payments surfaces in-product.
    requiredPermissions: ['billing:read'],
    apiRoutes: [],
    frontendRoutes: [],
    backendModule: 'billing',
  }),
  f({
    id: 'commerce.payments',
    name: 'Payments',
    description: 'Collect payments from customers.',
    category: 'Commerce',
    version: 1,
    dependencies: ['commerce.billing'],
    defaultEnabled: false,
    billingCategory: 'usage',
    requiredPermissions: ['billing:manage'],
    apiRoutes: ['/v1/payments'],
    frontendRoutes: [],
    backendModule: 'billing',
  }),
  f({
    id: 'commerce.stripe',
    name: 'Stripe',
    description: 'Stripe payment provider.',
    category: 'Commerce',
    version: 1,
    dependencies: ['commerce.payments'],
    defaultEnabled: false,
    billingCategory: 'usage',
    requiredPermissions: ['billing:manage'],
    apiRoutes: ['/v1/payments/stripe'],
    frontendRoutes: [],
    backendModule: 'billing',
  }),
]

// ─── Support ─────────────────────────────────────────────────────────────────

const support: readonly FeatureManifest[] = [
  f({
    id: 'support.ticketing',
    name: 'Ticketing',
    description: 'Customer support tickets.',
    category: 'Support',
    version: 1,
    dependencies: ['crm.contacts'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Tickets', path: '/support/tickets', icon: 'life-buoy', order: 10, section: 'Support' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/tickets'],
    frontendRoutes: ['/support/tickets'],
    backendModule: 'support',
  }),
  f({
    id: 'support.helpdesk',
    name: 'Help Desk',
    description: 'Knowledge articles and self-service.',
    category: 'Support',
    version: 1,
    dependencies: ['support.ticketing'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Help Desk', path: '/support/helpdesk', icon: 'help-circle', order: 20, section: 'Support' },
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/helpdesk'],
    frontendRoutes: ['/support/helpdesk'],
    backendModule: 'support',
  }),
  f({
    id: 'support.customer_portal',
    name: 'Customer Portal',
    description: 'Branded portal for a client\'s own customers.',
    category: 'Support',
    version: 1,
    dependencies: ['support.ticketing'],
    defaultEnabled: false,
    billingCategory: 'enterprise',
    requiredPermissions: ['crm:read'],
    apiRoutes: ['/v1/portal'],
    frontendRoutes: [],
    backendModule: 'support',
  }),
]

// ─── Documents ───────────────────────────────────────────────────────────────

const documents: readonly FeatureManifest[] = [
  f({
    id: 'documents.storage',
    name: 'File Storage',
    description: 'Store and share files.',
    category: 'Documents',
    version: 1,
    dependencies: [],
    defaultEnabled: false,
    billingCategory: 'usage',
    navEntry: { label: 'Files', path: '/documents/files', icon: 'folder', order: 10, section: 'Documents' },
    requiredPermissions: ['media:read'],
    apiRoutes: ['/v1/files'],
    frontendRoutes: ['/documents/files'],
    backendModule: 'media',
  }),
  f({
    id: 'documents.contracts',
    name: 'Contracts',
    description: 'Contract templates and e-signature.',
    category: 'Documents',
    version: 1,
    dependencies: ['documents.storage'],
    defaultEnabled: false,
    billingCategory: 'addon',
    navEntry: { label: 'Contracts', path: '/documents/contracts', icon: 'file-signature', order: 20, section: 'Documents' },
    requiredPermissions: ['media:read'],
    apiRoutes: ['/v1/contracts'],
    frontendRoutes: ['/documents/contracts'],
    backendModule: 'media',
  }),
  f({
    id: 'documents.knowledge_base',
    name: 'Knowledge Base',
    description: 'Internal documentation.',
    category: 'Documents',
    version: 1,
    dependencies: ['documents.storage'],
    defaultEnabled: false,
    billingCategory: 'addon',
    requiredPermissions: ['knowledge:read'],
    apiRoutes: ['/v1/kb'],
    frontendRoutes: [],
    backendModule: 'knowledge',
  }),
]

/** The complete registry. Order within a category is by `navEntry.order`. */
export const FEATURES: readonly FeatureManifest[] = [
  ...crm,
  ...marketing,
  ...ai,
  ...automation,
  ...analytics,
  ...communication,
  ...commerce,
  ...support,
  ...documents,
]

const FEATURES_BY_ID = new Map(FEATURES.map((feature) => [feature.id, feature]))

export function findFeature(id: string): FeatureManifest | undefined {
  return FEATURES_BY_ID.get(id)
}

export function isKnownFeature(id: string): boolean {
  return FEATURES_BY_ID.has(id)
}

export function featuresByCategory(category: FeatureCategory): readonly FeatureManifest[] {
  return FEATURES.filter((feature) => feature.category === category)
}

export const DEFAULT_ENABLED_FEATURES: readonly string[] = FEATURES.filter(
  (feature) => feature.defaultEnabled,
).map((feature) => feature.id)

/**
 * Expands a set of feature ids to include every dependency.
 *
 * Enabling *Deals* must pull in *Pipelines* or the deal has nowhere to live. The
 * platform-admin UI shows the closure so the operator sees exactly what a
 * selection implies, rather than discovering a broken feature after Save.
 */
export function resolveDependencies(featureIds: readonly string[]): {
  readonly resolved: readonly string[]
  readonly added: readonly string[]
  readonly unknown: readonly string[]
} {
  const wanted = new Set<string>()
  const unknown: string[] = []

  const visit = (id: string): void => {
    if (wanted.has(id)) return
    const manifest = FEATURES_BY_ID.get(id)
    if (!manifest) {
      unknown.push(id)
      return
    }
    wanted.add(id)
    for (const dependency of manifest.dependencies) visit(dependency)
  }

  for (const id of featureIds) visit(id)

  const original = new Set(featureIds)
  const added = [...wanted].filter((id) => !original.has(id))

  return { resolved: [...wanted], added, unknown }
}

/**
 * Features that would break if `featureId` were disabled.
 *
 * The platform-admin UI warns before disabling a feature others depend on, so a
 * disable never silently leaves a dependent feature non-functional.
 */
export function dependentsOf(featureId: string): readonly string[] {
  return FEATURES.filter((feature) => feature.dependencies.includes(featureId)).map(
    (feature) => feature.id,
  )
}

/** Validates the registry itself. Called at boot; a broken registry is fatal. */
export function assertFeatureRegistryValid(): void {
  const problems: string[] = []

  for (const feature of FEATURES) {
    for (const dependency of feature.dependencies) {
      if (!FEATURES_BY_ID.has(dependency)) {
        problems.push(`${feature.id} depends on unknown feature ${dependency}`)
      }
    }
    // A default-enabled feature whose dependency is not default-enabled would
    // leave a fresh organisation with a broken feature before any plan applies.
    if (feature.defaultEnabled) {
      for (const dependency of feature.dependencies) {
        const dep = FEATURES_BY_ID.get(dependency)
        if (dep && !dep.defaultEnabled) {
          problems.push(
            `${feature.id} is default-enabled but its dependency ${dependency} is not — ` +
              'a new organisation would get it in a broken state',
          )
        }
      }
    }
  }

  // No two features may claim the same nav path, or the sidebar renders duplicates.
  const paths = new Map<string, string>()
  for (const feature of FEATURES) {
    if (feature.navEntry) {
      const existing = paths.get(feature.navEntry.path)
      if (existing) {
        problems.push(`${feature.id} and ${existing} both claim nav path ${feature.navEntry.path}`)
      }
      paths.set(feature.navEntry.path, feature.id)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Feature registry is invalid:\n  - ${problems.join('\n  - ')}`)
  }
}

/** Zod schema for a feature manifest, used when a plugin registers a custom feature. */
export const featureManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'id must be <category>.<name>'),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(FEATURE_CATEGORIES),
  version: z.number().int().positive(),
  dependencies: z.array(z.string()),
  defaultEnabled: z.boolean(),
  billingCategory: z.enum(['included', 'seat', 'usage', 'addon', 'enterprise']),
  requiredPermissions: z.array(z.string()),
  apiRoutes: z.array(z.string()),
  frontendRoutes: z.array(z.string()),
  backendModule: z.string(),
  custom: z.boolean().optional(),
})
