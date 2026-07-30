import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { from, Observable } from 'rxjs'

import { withTenant } from '@vsp/database'
import { withLogContext, type AppLogger } from '@vsp/observability'

import type { Principal } from '../auth/principal.js'

/**
 * Opens the tenant context for the lifetime of a request.
 *
 * This is the single point where a request becomes tenant-scoped. Everything
 * downstream — repositories, command handlers, tools invoked by an agent — reads
 * the context rather than being handed an organisation id, so there is no
 * parameter for anyone to forget to pass.
 *
 * It is an interceptor rather than middleware because middleware in NestJS runs
 * before guards, and the tenant comes from the authenticated principal. Opening
 * the context before authentication would mean opening it from an unverified
 * header, which is the whole vulnerability class this exists to prevent.
 *
 * A route with no principal (a public one) runs with no tenant context. The
 * Prisma extension then refuses any tenant-scoped query, so a public endpoint
 * cannot accidentally read customer data.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      principal?: Principal
      id?: string
      log?: AppLogger
    }>()

    const principal = request.principal

    if (!principal) {
      return next.handle()
    }

    const requestId = request.id ?? 'unknown'

    // A logger bound to the tenant, so every record emitted while handling this
    // request answers "which customer" without the call site remembering to.
    request.log = withLogContext(this.logger, {
      organizationId: principal.organizationId,
      // Built conditionally rather than assigning undefined: with
      // exactOptionalPropertyTypes an explicit undefined differs from an absent
      // key, and the logger should omit what it does not know.
      ...(principal.type === 'user' ? { userId: principal.id } : {}),
      requestId,
    })

    // `from(...)` bridges the promise back into the Observable pipeline. The
    // await must happen *inside* withTenant — Prisma promises are lazy, and
    // resolving one after the context exits would run the query unscoped.
    return from(
      withTenant(
        {
          organizationId: principal.organizationId,
          ...(principal.type === 'user' ? { userId: principal.id } : {}),
          requestId,
        },
        async () => {
          // firstValueFrom would be tidier, but importing it here pulls the
          // operator surface in for a single use; awaiting the promise directly
          // keeps the dependency narrow and the semantics identical for the
          // single-value HTTP case.
          const result = await new Promise((resolve, reject) => {
            let latest: unknown
            next.handle().subscribe({
              next: (value) => {
                latest = value
              },
              error: reject,
              complete: () => resolve(latest),
            })
          })
          return result
        },
      ),
    )
  }
}
