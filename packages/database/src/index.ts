/**
 * `@vsp/database` is the only module permitted to import `@prisma/client`.
 * Everything else in the workspace imports from here — enforced as an ESLint
 * error in `packages/config/eslint/base.js`.
 *
 * The reason is tenant isolation. In Phase 4 the exported client is wrapped in an
 * extension that injects `organizationId` into every query and throws when no
 * tenant context is present. A module holding a raw `PrismaClient` would sidestep
 * that, so the raw constructor never leaves this package.
 */

export { Prisma, PrismaClient } from '../generated/client/index.js'

export type {
  Account,
  Activity,
  AgentRun,
  AgentRunStep,
  ApiKey,
  Appointment,
  AttributionTouch,
  AuditLog,
  BrandKit,
  Call,
  Campaign,
  CampaignChannel,
  Company,
  Contact,
  ContentApproval,
  ContentDocument,
  ContentRevision,
  Conversation,
  Deal,
  EmailCampaign,
  EmailSend,
  EmailSequence,
  EmailSequenceEnrollment,
  EmailSequenceStep,
  IdempotencyKey,
  IntegrationConnection,
  Invitation,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  Lead,
  MediaAsset,
  Membership,
  Message,
  MessageTemplate,
  MetricDaily,
  Note,
  Notification,
  Organization,
  OrganizationSettings,
  OutboxEvent,
  PhoneNumber,
  Pipeline,
  PipelineStage,
  Prompt,
  PromptVersion,
  ProviderCredential,
  Session,
  SocialAccount,
  SocialPost,
  SocialPostTarget,
  Subscription,
  Task,
  Template,
  TemplateInstall,
  ToolCall,
  UsageRecord,
  User,
  Verification,
  Webhook,
  WebhookDelivery,
  Workflow,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowVersion,
  AiUsage,
} from '../generated/client/index.js'

export {
  ActorType,
  AgentId,
  AgentStepType,
  AiProvider,
  AppointmentStatus,
  CallDirection,
  CallStatus,
  CampaignStatus,
  ChannelType,
  ContentStatus,
  ContentType,
  ConversationChannel,
  DealStatus,
  EmailSendStatus,
  GenerationStatus,
  IntegrationProvider,
  IntegrationStatus,
  InvitationStatus,
  KnowledgeSourceType,
  LeadStatus,
  MediaType,
  MemberRole,
  MessageDirection,
  MessageStatus,
  NotificationLevel,
  OutboxStatus,
  PlanTier,
  Priority,
  ProviderKind,
  RunStatus,
  SocialPostStatus,
  SubscriptionStatus,
  TaskStatus,
  UsageMetric,
  WebhookDeliveryStatus,
  WorkflowStatus,
} from '../generated/client/index.js'

/**
 * Tables that carry `organizationId` directly and are therefore subject to
 * automatic tenant scoping. Kept as a single source of truth so the Phase 4
 * client extension, the RLS migration, and the isolation tests cannot drift
 * apart: a new tenant-scoped model that is missing here will fail its test.
 */
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
] as const

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number]

/**
 * Models reached through a parent rather than a tenant column of their own.
 * Protected by an EXISTS policy in the RLS migration.
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

/**
 * Global identity models. A user belongs to many organisations, so these are
 * deliberately not tenant-scoped; access is mediated through Membership.
 */
export const GLOBAL_MODELS = ['User', 'Session', 'Account', 'Verification', 'Organization'] as const

/** Transaction-local GUC read by every row-level security policy. */
export const TENANT_SETTING = 'app.organization_id' as const
