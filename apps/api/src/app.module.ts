import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'

import type { AppLogger } from '@vsp/observability'

import { ProblemExceptionFilter } from './common/filters/problem.filter.js'
import { PermissionsGuard } from './common/guards/permissions.guard.js'
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor.js'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js'
import { TenantInterceptor } from './common/interceptors/tenant.interceptor.js'
import { DatabaseModule, LOGGER } from './infrastructure/database.module.js'
import { AgentRunsController } from './modules/agents/agent-runs.controller.js'
import { AnalyticsController, AuditController } from './modules/analytics/analytics.controller.js'
import { CampaignsController } from './modules/campaigns/campaigns.controller.js'
import { ContactsController } from './modules/crm/contacts.controller.js'
import {
  CompaniesController,
  DealsController,
  LeadsController,
} from './modules/crm/crm.controllers.js'
import { HealthController } from './modules/health/health.controller.js'
import { MembersController } from './modules/members/members.controller.js'
import { OrganizationsController } from './modules/organizations/organizations.controller.js'
import { RealtimeGateway } from './modules/realtime/realtime.gateway.js'

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
    CampaignsController,
    AgentRunsController,
    AnalyticsController,
    AuditController,
  ],
  providers: [
    {
      provide: APP_FILTER,
      inject: [LOGGER],
      useFactory: (logger: AppLogger) => new ProblemExceptionFilter(logger),
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
    // Authentication is middleware rather than a guard so the principal exists
    // before guards run. It is wired in Phase 6 alongside Better Auth; until then
    // no principal is attached, and the global guard therefore rejects every
    // non-public route. That is the correct posture for a partially built API —
    // it fails closed rather than serving unauthenticated traffic.
  }
}
