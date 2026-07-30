import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'

import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../auth/principal.js'

/**
 * Logs one line per request, on completion.
 *
 * One line rather than two (start and finish): a start line doubles log volume
 * and carries no information the finish line lacks, except for requests that
 * never finish — and those are better found from a timeout metric than from
 * unmatched pairs.
 *
 * Deliberately absent: the request body and the response body. Both routinely
 * contain contact details and message content, and logs are the least-guarded
 * copy of production data. Shapes and sizes are logged; contents are not.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<{
      method?: string
      url?: string
      id?: string
      principal?: Principal
    }>()
    const reply = http.getResponse<{ statusCode?: number }>()

    const startedAt = process.hrtime.bigint()

    const emit = (outcome: 'ok' | 'error', error?: unknown): void => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000

      const record = {
        method: request.method,
        // The route pattern, not the concrete path — `/v1/contacts/:id` rather
        // than a distinct label per id, so this is groupable.
        route: context.getHandler().name,
        url: request.url,
        status: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        requestId: request.id,
        organizationId: request.principal?.organizationId,
        userId: request.principal?.type === 'user' ? request.principal.id : undefined,
        ...(error === undefined ? {} : { err: error }),
      }

      if (outcome === 'error') {
        this.logger.warn(record, 'request failed')
      } else if (durationMs > 1_000) {
        // Slow but successful. Warn so it surfaces without being an error —
        // these are the requests that become incidents under load.
        this.logger.warn(record, 'slow request')
      } else {
        this.logger.info(record, 'request')
      }
    }

    return next.handle().pipe(
      tap({
        next: () => emit('ok'),
        error: (error: unknown) => emit('error', error),
      }),
    )
  }
}
