import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { ZodError } from 'zod'

import {
  createProblem,
  ERROR_CODES,
  toValidationIssues,
  type ErrorCode,
} from '@marketing-os/contracts'
import {
  MissingTenantContextError,
  RowLevelSecurityNotEnforcedError,
  TenantMismatchError,
  UnscopableOperationError,
} from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

interface FastifyLikeReply {
  status(code: number): FastifyLikeReply
  header(name: string, value: string): FastifyLikeReply
  send(payload: unknown): void
}

interface FastifyLikeRequest {
  url?: string
  id?: string
}

/**
 * Translates every thrown error into an RFC 9457 problem+json response.
 *
 * Two invariants:
 *
 *   1. **Nothing internal escapes.** A stack trace, a SQL fragment, or a Prisma
 *      error message tells an attacker about the schema and tells a user nothing
 *      useful. The detail goes to the log, keyed by the same trace id that the
 *      client receives.
 *
 *   2. **Every response carries a `code` and a `traceId`.** Clients branch on the
 *      code rather than string-matching a message, and support can find the exact
 *      request instead of grepping by timestamp.
 *
 * Tenancy errors get deliberate treatment: a `MissingTenantContextError` means
 * application code tried to run an unscoped query. That is a bug on our side, so
 * it is a 500 and logged at error level — never a 403, which would read as a
 * permissions problem and send the investigation in the wrong direction.
 */
@Injectable()
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const reply = http.getResponse<FastifyLikeReply>()
    const request = http.getRequest<FastifyLikeRequest>()

    const traceId = request.id ?? 'unknown'
    const instance = request.url

    const mapped = this.map(exception)

    // 5xx means we are at fault, and the full error belongs in the log. 4xx is
    // the caller's problem and would only be noise at error level.
    if (mapped.status >= 500) {
      this.logger.error({ err: exception, traceId, instance, code: mapped.code }, mapped.logMessage)
    } else {
      this.logger.debug({ traceId, instance, code: mapped.code }, mapped.logMessage)
    }

    const problem = createProblem({
      status: mapped.status,
      code: mapped.code,
      title: mapped.title,
      ...(mapped.detail === undefined ? {} : { detail: mapped.detail }),
      ...(instance === undefined ? {} : { instance }),
      traceId,
      ...(mapped.errors === undefined ? {} : { errors: mapped.errors }),
      ...(mapped.retryAfter === undefined ? {} : { retryAfter: mapped.retryAfter }),
    })

    reply
      .status(mapped.status)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem)
  }

  private map(exception: unknown): {
    status: number
    code: ErrorCode
    title: string
    detail?: string
    errors?: ReturnType<typeof toValidationIssues>
    retryAfter?: number
    logMessage: string
  } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_FAILED,
        title: 'Validation failed',
        detail: 'One or more fields are invalid.',
        errors: toValidationIssues(exception),
        logMessage: 'Request validation failed',
      }
    }

    // A tenancy failure is our bug, not the caller's. Surfacing it as 403 would
    // send whoever investigates down the permissions path instead of the code path.
    if (exception instanceof MissingTenantContextError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.INTERNAL_ERROR,
        title: 'Internal error',
        detail: 'The request could not be completed.',
        logMessage:
          `TENANCY BUG: ${exception.model}.${exception.operation} ran without a tenant context. ` +
          'A code path is missing withTenant().',
      }
    }

    if (exception instanceof TenantMismatchError) {
      return {
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        title: 'Forbidden',
        detail: 'This resource belongs to another organisation.',
        logMessage: `Cross-tenant write refused on ${exception.model}`,
      }
    }

    if (exception instanceof UnscopableOperationError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.INTERNAL_ERROR,
        title: 'Internal error',
        detail: 'The request could not be completed.',
        logMessage: `TENANCY BUG: ${exception.message}`,
      }
    }

    if (exception instanceof RowLevelSecurityNotEnforcedError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.INTERNAL_ERROR,
        title: 'Internal error',
        logMessage: `FATAL MISCONFIGURATION: ${exception.message}`,
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      const detail = detailOf(response, exception.message)

      return {
        status,
        code: this.codeForStatus(status),
        title: this.titleForStatus(status),
        detail,
        logMessage: `HTTP ${String(status)}: ${detail}`,
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      title: 'Internal error',
      // Deliberately generic. The real message is in the log under traceId.
      detail: 'An unexpected error occurred. The incident has been recorded.',
      logMessage: 'Unhandled exception',
    }
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.MALFORMED_REQUEST
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT
      case HttpStatus.PAYMENT_REQUIRED:
        return ERROR_CODES.PAYMENT_REQUIRED
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED
      case HttpStatus.BAD_GATEWAY:
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.PROVIDER_UNAVAILABLE
      default:
        return ERROR_CODES.INTERNAL_ERROR
    }
  }

  private titleForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad request'
      case HttpStatus.UNAUTHORIZED:
        return 'Authentication required'
      case HttpStatus.FORBIDDEN:
        return 'Forbidden'
      case HttpStatus.NOT_FOUND:
        return 'Not found'
      case HttpStatus.CONFLICT:
        return 'Conflict'
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too many requests'
      default:
        return status >= 500 ? 'Internal error' : 'Request failed'
    }
  }
}

/**
 * The readable half of an `HttpException`'s response body.
 *
 * `String()` used to do this job and produced `[object Object]` for every
 * validation failure in the application — because a Nest validation response
 * carries `message` as an *array* of issues, and stringifying an array of
 * objects yields exactly that. A 400 that names the offending field became a
 * toast reading "[object Object]", which is worse than no message: it looks
 * like a crash rather than a rejected field, and it sent us reading deployment
 * logs for something the response already said.
 *
 * Zod's own issues carry a `path`, so a nested field is reported as
 * `audience.locations: Required` rather than an unattached "Required".
 */
export function detailOf(response: unknown, fallback: string): string {
  if (typeof response === 'string') return response
  if (typeof response !== 'object' || response === null) return fallback

  const message: unknown = (response as { message?: unknown }).message
  if (typeof message === 'string' && message.length > 0) return message

  if (Array.isArray(message)) {
    const parts = message
      .map((issue) => {
        if (typeof issue === 'string') return issue
        if (typeof issue !== 'object' || issue === null) return null
        const i = issue as { path?: unknown; message?: unknown }
        if (typeof i.message !== 'string') return null
        const path = Array.isArray(i.path) && i.path.length > 0 ? `${i.path.join('.')}: ` : ''
        return `${path}${i.message}`
      })
      .filter((part): part is string => part !== null)
    // Bounded: a body with thirty bad fields should not become a paragraph in a
    // toast, and the first few are enough to find the mistake.
    if (parts.length > 0) return parts.slice(0, 4).join(' · ')
  }

  return fallback
}
