/**
 * Which models are tenant-scoped, and how.
 *
 * Single source of truth, consumed by the Prisma extension, the isolation tests,
 * and reviewers of the RLS migration. Keeping one list means the three cannot
 * drift apart: a new tenant-scoped model missing from here fails its test.
 */

/** Models carrying `organizationId` directly. The extension scopes these. */
export const TENANT_SCOPED_MODELS = [
  'OrganizationSettings',
  'Membership',
  'Invitation',
  'ApiKey',
  'Subscription',
  'UsageRecord',
  'Company',
  'Contact',
  'Lead',
  'Pipeline',
  'Deal',
  'Activity',
  'Task',
  'Appointment',
  'Note',
  'Campaign',
  'ContentDocument',
  'MediaAsset',
  'Product',
  'CampaignProduct',
  'Creative',
  'BatchJob',
  // Operator-only in practice — the app role's grant is revoked and nothing on
  // the tenant plane reads it. Registered anyway: this list is what makes the
  // extension scope a query, and a table left off it runs UNSCOPED if a grant is
  // ever restored. Three locks on the ledger, and this is the cheapest.
  'AdSpendLedger',
  'BrandKit',
  'EmailCampaign',
  'EmailSequence',
  'EmailSend',
  'Conversation',
  'Message',
  'MessageTemplate',
  'PhoneNumber',
  'Call',
  'SocialAccount',
  'SocialPost',
  'Workflow',
  'WorkflowRun',
  'AgentRun',
  'AiUsage',
  'Prompt',
  'KnowledgeBase',
  'KnowledgeDocument',
  'KnowledgeChunk',
  'MetricDaily',
  'AttributionTouch',
  'Template',
  'TemplateInstall',
  'ProviderCredential',
  'IntegrationConnection',
  'OutboxEvent',
  'Webhook',
  'AuditLog',
  'Notification',
  'IdempotencyKey',
  // Modular platform — per-organisation configuration tables.
  'FeatureAssignment',
  'OrganizationLimit',
  'ProviderConfiguration',
  'AgentAssignment',
  'CustomAgent',
  'Branding',
  // AI marketing automation — campaign assets & review queue.
  'CampaignAsset',
  'CampaignAssetComment',
  // Lead capture, landing pages & support.
  'LeadForm',
  'FormSubmission',
  'LandingPage',
  'SupportTicket',
  'SupportTicketComment',
  // Meta ads + WhatsApp lead engine.
  'MetaConnection',
  'AdCampaign',
  'AdSet',
  'AdCreative',
  'Ad',
  'MetaLeadForm',
  'AdInsight',
  'AdInsightBreakdown',
  'ChatbotFlow',
  'ChatbotSession',
] as const

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number]

/**
 * Models reached only through a parent. They have no tenant column, so the
 * extension cannot scope them; PostgreSQL does, with an `EXISTS` policy against
 * the parent (see the row_level_security migration).
 */
export const PARENT_SCOPED_MODELS = [
  'PipelineStage',
  'CampaignChannel',
  'ContentRevision',
  'ContentApproval',
  'EmailSequenceStep',
  'EmailSequenceEnrollment',
  'SocialPostTarget',
  'WorkflowVersion',
  'WorkflowRunStep',
  'AgentRunStep',
  'ToolCall',
  'PromptVersion',
  'WebhookDelivery',
] as const

export type ParentScopedModel = (typeof PARENT_SCOPED_MODELS)[number]

/**
 * Global identity models. A user belongs to many organisations, so these are
 * intentionally not tenant-scoped; access is mediated through `Membership`.
 * `Organization` is here because it is the tenant, not a tenant-owned row.
 */
export const GLOBAL_MODELS = ['User', 'Session', 'Account', 'Verification', 'Organization'] as const

export type GlobalModel = (typeof GLOBAL_MODELS)[number]

/** Transaction-local setting read by every row-level security policy. */
export const TENANT_SETTING = 'app.organization_id' as const
