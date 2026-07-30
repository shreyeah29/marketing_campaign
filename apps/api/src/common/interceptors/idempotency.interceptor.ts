import { CallHandler, ConflictException, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { from, Observable } from 'rxjs'

import type { DatabaseClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../auth/principal.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'

/**
 * Idempotency-Key handling for unsafe requests.
 *
 * The problem: a client sends `POST /v1/contacts`, the response is lost to a
 * timeout or a dropped connection, and the client retries. Without protection the
 * contact is created twice. On an endpoint that sends an email or places a call,
 * the duplicate is not a tidy-up job — it reached a real person twice.
 *
 * The contract:
 *   · Same key, same request body → the stored response is replayed. The
 *     operation runs exactly once.
 *   · Same key, *different* body → 409. The client has a bug, and quietly
 *     returning the old response would hide it while appearing to succeed.
 *   · Concurrent requests with the same key → the second gets 409 rather than
 *     racing. Two in-flight duplicates is the case naive implementations miss,
 *     and it is the common one: a retry usually arrives before the first
 *     response.
 *
 * Records expire after 24 hours, which comfortably outlives any client retry
 * policy while keeping the table bounded.
 */

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const RETENTION_MS = 24 * 60 * 60 * 1000

interface IdempotentRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
  principal?: Principal
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<IdempotentRequest>()

    const method = request.method?.toUpperCase() ?? 'GET'
    if (!IDEMPOTENT_METHODS.has(method)) return next.handle()

    const header = request.headers?.['idempotency-key']
    const key = Array.isArray(header) ? header[0] : header
    // Optional by design. Making it mandatory would break every existing client
    // and every curl; the guarantee is available to callers that want it.
    if (key === undefined || key.length === 0) return next.handle()

    const principal = request.principal
    if (!principal) return next.handle()

    // Scoped to the route as well as the tenant, so the same key reused against a
    // different endpoint is treated as a different operation rather than
    // replaying an unrelated response.
    const scope = `${method} ${request.url ?? ''}`
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request.body ?? null))
      .digest('hex')

    return from(this.run(key, scope, requestHash, principal, next))
  }

  private async run(
    key: string,
    scope: string,
    requestHash: string,
    principal: Principal,
    next: CallHandler,
  ): Promise<unknown> {
    const existing = await this.db.idempotencyKey.findFirst({
      where: { key, scope },
    })

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          message:
            'This Idempotency-Key was already used with a different request body. Use a new key ' +
            'for a different request — replaying the previous response would hide a client bug.',
          code: 'idempotency_key_reused',
        })
      }

      if (existing.responseBody !== null && existing.responseStatus !== null) {
        this.logger.info({ key, scope }, 'replaying stored idempotent response')
        return existing.responseBody
      }

      // Claimed but not yet completed: another request with this key is in
      // flight. Refusing is correct — waiting would hold a connection for an
      // unbounded time, and proceeding would execute the operation twice, which
      // is the entire thing being prevented.
      throw new ConflictException({
        message: 'A request with this Idempotency-Key is currently in progress. Retry shortly.',
        code: 'idempotency_key_reused',
      })
    }

    // Claim the key before doing the work. The unique constraint on
    // (organizationId, scope, key) makes this the serialisation point: two
    // concurrent requests race here, and exactly one wins.
    try {
      await this.db.idempotencyKey.create({
        data: {
          organizationId: principal.organizationId,
          key,
          scope,
          requestHash,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      })
    } catch {
      // Lost the race. The winner is executing; this request must not also.
      throw new ConflictException({
        message: 'A request with this Idempotency-Key is currently in progress. Retry shortly.',
        code: 'idempotency_key_reused',
      })
    }

    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        let latest: unknown
        next.handle().subscribe({
          next: (value) => {
            latest = value
          },
          error: reject,
          complete: () => resolve(latest),
        })
      })

      await this.db.idempotencyKey.updateMany({
        where: { key, scope },
        data: { responseStatus: 200, responseBody: result as never },
      })

      return result
    } catch (error) {
      // Release the claim on failure. A failed request must be retryable with the
      // same key — otherwise a transient error permanently burns it and the
      // client can never complete the operation.
      await this.db.idempotencyKey.deleteMany({ where: { key, scope } })
      throw error
    }
  }
}
