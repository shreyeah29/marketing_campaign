import { pino, stdSerializers, stdTimeFunctions, type Logger, type LoggerOptions } from 'pino'

import { REDACTED_PATHS, REDACTION_PLACEHOLDER } from './redaction.js'

/**
 * Structured logging.
 *
 * Every record carries the tenant, the principal and a request id, because the
 * first question in any incident is "which customer, and which request". A log
 * line without those is nearly useless at multi-tenant scale — you can see that
 * something broke but not for whom, and you cannot correlate it with the audit
 * trail or an agent run.
 */

export interface LogContext {
  /** Tenant. Present on everything except platform-level work. */
  readonly organizationId?: string
  readonly userId?: string
  /** Correlates every record emitted while handling one request or job. */
  readonly requestId?: string
  /** Present when an AI agent is acting, so its actions are traceable as its own. */
  readonly agentRunId?: string
  readonly agentId?: string
  /** Distributed trace id, when tracing is wired up. */
  readonly traceId?: string
}

export interface CreateLoggerOptions {
  readonly level?: string
  readonly service: string
  readonly environment: string
  readonly version?: string
  /** Human-readable output. Development only — pretty printing is slow. */
  readonly pretty?: boolean
}

export type AppLogger = Logger<never, boolean>

export function createLogger(options: CreateLoggerOptions): AppLogger {
  const config: LoggerOptions = {
    level: options.level ?? (options.environment === 'production' ? 'info' : 'debug'),
    base: {
      service: options.service,
      environment: options.environment,
      ...(options.version === undefined ? {} : { version: options.version }),
    },
    redact: {
      paths: [...REDACTED_PATHS],
      censor: REDACTION_PLACEHOLDER,
      // Redaction must not be defeated by an unexpected shape.
      remove: false,
    },
    // ISO timestamps: log aggregators sort them correctly and humans can read
    // them, which epoch millis do not manage simultaneously.
    timestamp: stdTimeFunctions.isoTime,
    formatters: {
      // "level":"info" rather than "level":30. Costs a few bytes, saves everyone
      // remembering pino's numeric scale during an incident.
      level: (label) => ({ level: label }),
    },
    // Serialise Error causes and aggregate errors properly instead of "{}".
    serializers: {
      err: stdSerializers.err,
      error: stdSerializers.err,
    },
  }

  if (options.pretty) {
    // Pretty printing is a developer convenience, so a missing or broken
    // transport must never stop the process. pino resolves the target lazily and
    // throws if it cannot, which would otherwise turn "pino-pretty is not
    // installed" into "the API will not start" — a cosmetic dependency taking
    // down the service.
    try {
      return pino({
        ...config,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      })
    } catch {
      const logger = pino(config)
      logger.warn('pino-pretty is unavailable; falling back to structured JSON output')
      return logger
    }
  }

  return pino(config)
}

/**
 * Derives a logger with the context bound to every record it emits.
 *
 * Preferred over passing context at each call site, which is forgotten exactly
 * when it matters most — inside the error path.
 */
export function withLogContext(logger: AppLogger, context: LogContext): AppLogger {
  const bindings: Record<string, string> = {}

  if (context.organizationId !== undefined) bindings['organizationId'] = context.organizationId
  if (context.userId !== undefined) bindings['userId'] = context.userId
  if (context.requestId !== undefined) bindings['requestId'] = context.requestId
  if (context.agentRunId !== undefined) bindings['agentRunId'] = context.agentRunId
  if (context.agentId !== undefined) bindings['agentId'] = context.agentId
  if (context.traceId !== undefined) bindings['traceId'] = context.traceId

  return logger.child(bindings)
}

/**
 * Measures an operation and logs the outcome once, either way.
 *
 * Exists so timing and failure logging are consistent rather than reinvented at
 * each call site — and so a thrown error is always logged with its duration,
 * which is usually the number that explains the failure.
 */
export async function logDuration<T>(
  logger: AppLogger,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const startedAt = process.hrtime.bigint()

  try {
    const result = await fn()
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logger.debug({ operation, durationMs, ...metadata }, `${operation} succeeded`)
    return result
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logger.error({ operation, durationMs, err: error, ...metadata }, `${operation} failed`)
    throw error
  }
}
