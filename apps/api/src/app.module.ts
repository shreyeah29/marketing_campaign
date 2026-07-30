import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'

import type { AppLogger } from '@vsp/observability'

import { EncryptionService } from './common/crypto/encryption.service.js'
import { EntitlementService } from './common/entitlements/entitlement.service.js'
import { LimitService } from './common/entitlements/limit.service.js'
import { ProblemExceptionFilter } from './common/filters/problem.filter.js'
import { EntitlementGuard } from './common/guards/entitlement.guard.js'
import { PermissionsGuard } from './common/guards/permissions.guard.js'
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor.js'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js'
import { TenantInterceptor } from './common/interceptors/tenant.interceptor.js'
import { DatabaseModule, LOGGER } from './infrastructure/database.module.js'
import { AuthService } from './modules/auth/auth.service.js'
import { AuthGuard } from './modules/auth/auth.guard.js'
import { IdentityService } from './modules/auth/identity.service.js'
import { AuthController } from './modules/auth/auth.controller.js'
import { EMAIL_PORT, LogEmailTransport } from './modules/auth/email.port.js'
import { AgentRunsController } from './modules/agents/agent-runs.controller.js'
import { ConfigController } from './modules/config/config.controller.js'
import { AnalyticsController, AuditController } from './modules/analytics/analytics.controller.js'
import { CampaignsController } from './modules/campaigns/campaigns.controller.js'
import { ContactsController } from './modules/crm/contacts.controller.js'
import { CompaniesController } from './modules/crm/companies.controller.js'
import { LeadsController } from './modules/crm/leads.controller.js'
import { DealsController } from './modules/crm/deals.controller.js'
import { TasksController } from './modules/crm/tasks.controller.js'
import { NotesController } from './modules/crm/notes.controller.js'
import { PipelinesController } from './modules/crm/pipelines.controller.js'
import { EmailCampaignsController } from './modules/marketing/email-campaigns.controller.js'
import { MessageTemplatesController } from './modules/marketing/message-templates.controller.js'
import { SocialPostsController } from './modules/marketing/social-posts.controller.js'
import { WorkflowsController } from './modules/automation/workflows.controller.js'
import { WebhooksController } from './modules/automation/webhooks.controller.js'
import { AiController } from './modules/ai/ai.controller.js'
import { AiService } from './modules/ai/ai.service.js'
import { PromptsController } from './modules/ai/prompts.controller.js'
import { KnowledgeController } from './modules/ai/knowledge.controller.js'
import { ApiKeysController } from './modules/settings/api-keys.controller.js'
import { ConversationsController } from './modules/comms/conversations.controller.js'
import { NotificationsController } from './modules/notifications/notifications.controller.js'
import { HealthController } from './modules/health/health.controller.js'
import { MembersController } from './modules/members/members.controller.js'
import { OrganizationsController } from './modules/organizations/organizations.controller.js'
import { RealtimeGateway } from './modules/realtime/realtime.gateway.js'
import { PlatformController } from './modules/platform/platform.controller.js'
import { PlatformAuthService } from './modules/platform/platform-auth.service.js'
import { ProvisioningService } from './modules/platform/provisioning.service.js'
import { PlatformAdminGuard } from './modules/platform/platform-admin.guard.js'
import { WorkspaceController } from './modules/workspace/workspace.controller.js'

/**
 * Root module.
 *
 * Cross-cutting concerns are registered globally rather than per controller, so a
 * new controller inherits them by existing. That direction matters: the previous
 * implementation required each controller to opt *in* to authorisation, and a
 * controller that forgot was silently public.
 *
 * Interceptor order is significant. Nest runs global interceptors in registration
 * order, so logging wraps the tenant context and therefore records the outcome
 * even when the tenant layer itself throws.
 */
@Module({
  imports: [DatabaseModule, CqrsModule.forRoot()],
  controllers: [
    HealthController,
    OrganizationsController,
    MembersController,
    ContactsController,
    CompaniesController,
    LeadsController,
    DealsController,
    TasksController,
    NotesController,
    PipelinesController,
    EmailCampaignsController,
    MessageTemplatesController,
    SocialPostsController,
    WorkflowsController,
    WebhooksController,
    AiController,
    PromptsController,
    KnowledgeController,
    ApiKeysController,
    ConversationsController,
    NotificationsController,
    CampaignsController,
    AgentRunsController,
    AnalyticsController,
    AuditController,
    WorkspaceController,
    ConfigController,
    PlatformController,
    AuthController,
  ],
  providers: [
    // Entitlement resolution and limit enforcement, injectable across the app.
    EntitlementService,
    LimitService,
    EncryptionService,
    // Tenant authentication and identity (Better Auth + org/role resolution).
    { provide: EMAIL_PORT, useClass: LogEmailTransport },
    AuthService,
    IdentityService,
    AuthGuard,
    AiService,
    PlatformAuthService,
    ProvisioningService,
    PlatformAdminGuard,
    {
      provide: APP_FILTER,
      inject: [LOGGER],
      useFactory: (logger: AppLogger) => new ProblemExceptionFilter(logger),
    },
    {
      // The FIRST global guard: resolves the Better Auth session into a principal
      // and attaches it to the request, before any guard that reads one. It never
      // rejects — "who are you" is separate from "may you", which the guards below
      // decide. Nest runs global guards in registration order, so this is first.
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
    {
      // Runs BEFORE the permission guard, matching the pipeline order:
      // subscription active → feature enabled → permission granted. Nest executes
      // global guards in registration order, so this provider is listed first.
      provide: APP_GUARD,
      inject: [Reflector, EntitlementService],
      useFactory: (reflector: Reflector, entitlements: EntitlementService) =>
        new EntitlementGuard(reflector, entitlements),
    },
    {
      // Deny by default. Every route requires authentication unless it is
      // explicitly @Public(), so forgetting a decorator makes a route
      // unreachable rather than unprotected.
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [LOGGER],
      useFactory: (logger: AppLogger) => new LoggingInterceptor(logger),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [LOGGER],
      useFactory: (logger: AppLogger) => new TenantInterceptor(logger),
    },
    {
      // After the tenant interceptor: the idempotency record is tenant-scoped, so
      // it needs the context open before it can read or write one.
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    RealtimeGateway,
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {
    // Authentication resolves through the global `AuthGuard` registered first,
    // rather than middleware: with the Fastify adapter a first-registered guard
    // runs before the entitlement/permission guards and the tenant interceptor,
    // and attaches the principal to the same request object they read. The Better
    // Auth endpoints themselves (`/api/auth/*`) are mounted directly on Fastify in
    // `main.ts`, outside this pipeline, so reaching them never requires a session.
  }
}
