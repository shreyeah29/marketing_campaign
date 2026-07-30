import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'

import type { AppLogger } from '@vsp/observability'

import { ProblemExceptionFilter } from './common/filters/problem.filter.js'
import { PermissionsGuard } from './common/guards/permissions.guard.js'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js'
import { TenantInterceptor } from './common/interceptors/tenant.interceptor.js'
import { DatabaseModule, LOGGER } from './infrastructure/database.module.js'
import { ContactsController } from './modules/crm/contacts.controller.js'
import { HealthController } from './modules/health/health.controller.js'

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
  controllers: [HealthController, ContactsController],
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
