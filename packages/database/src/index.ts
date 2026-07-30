/**
 * `@vsp/database` is the only module permitted to import `@prisma/client`.
 * Everything else imports from here — enforced as an ESLint error in
 * `packages/config/eslint/base.js`.
 *
 * The reason is tenant isolation. The client exported here is wrapped in an
 * extension that injects `organizationId` into every query and throws when no
 * tenant context is present. A module holding a raw `PrismaClient` would sidestep
 * that, so the raw constructor never leaves this package except through
 * `createAdminClient`, which is named to be conspicuous in review.
 */

export {
  assertRowLevelSecurityEnforced,
  assertTenantRegistryComplete,
  createAdminClient,
  createDatabaseClient,
  getTenantContext,
  requireTenantContext,
  tenantInput,
  withTenantTransaction,
  type DatabaseClient,
  type DatabaseClientOptions,
  type TenantCreateInput,
  type TenantTransactionClient,
} from './client.js'

export {
  getTenantContext as peekTenantContext,
  withTenant,
  withoutTenant,
  type TenantContext,
} from './tenant-context.js'

export {
  claimOutboxBatch,
  publishEvent,
  requeueOutboxEvent,
  type PublishOptions,
} from './outbox.js'

export {
  MissingTenantContextError,
  RowLevelSecurityNotEnforcedError,
  TenantMismatchError,
  UnscopableOperationError,
} from './errors.js'

export {
  GLOBAL_MODELS,
  PARENT_SCOPED_MODELS,
  TENANT_SCOPED_MODELS,
  TENANT_SETTING,
  type GlobalModel,
  type ParentScopedModel,
  type TenantScopedModel,
} from './model-registry.js'

export { Prisma, PrismaClient } from '../generated/client/index.js'

export type {
  Account,
  Activity,
  AgentRun,
  AgentRunStep,
  AiUsage,
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
