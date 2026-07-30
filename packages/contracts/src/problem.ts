import { z } from 'zod'

/**
 * Error responses, following RFC 9457 `application/problem+json`.
 *
 * A standard shape matters more than it looks. Clients need to branch on failure
 * without string-matching a human message, so a stable machine-readable `code` is
 * mandatory. And `traceId` is on every response because the alternative — asking a
 * customer to describe what they saw and then grepping by timestamp — does not
 * scale past the first incident.
 *
 * `detail` is written for a human but is still part of the contract: it must never
 * contain a stack trace, a SQL fragment, or another tenant's data. Internal detail
 * goes to the logs, keyed by the same `traceId`.
 */

export const ERROR_CODES = {
  // 400
  VALIDATION_FAILED: 'validation_failed',
  MALFORMED_REQUEST: 'malformed_request',

  // 401 / 403
  UNAUTHENTICATED: 'unauthenticated',
  SESSION_EXPIRED: 'session_expired',
  FORBIDDEN: 'forbidden',
  INSUFFICIENT_PERMISSION: 'insufficient_permission',
  /** An agent attempted something beyond the permissions of the user who started it. */
  AGENT_PERMISSION_EXCEEDED: 'agent_permission_exceeded',

  // 404 / 409
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  ALREADY_EXISTS: 'already_exists',
  /** Same Idempotency-Key replayed with a different body. */
  IDEMPOTENCY_KEY_REUSED: 'idempotency_key_reused',

  // 402 / 429
  PAYMENT_REQUIRED: 'payment_required',
  ENTITLEMENT_EXCEEDED: 'entitlement_exceeded',
  /** The organisation's AI spend cap was reached. Refused before dispatch. */
  AI_BUDGET_EXCEEDED: 'ai_budget_exceeded',
  RATE_LIMITED: 'rate_limited',

  // 500 / 502 / 503
  INTERNAL_ERROR: 'internal_error',
  PROVIDER_ERROR: 'provider_error',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  /** No credential configured for the provider the request needs. */
  PROVIDER_NOT_CONFIGURED: 'provider_not_configured',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const validationIssueSchema = z.object({
  /** Dotted path to the offending field, e.g. `contact.email`. */
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
})

export type ValidationIssue = z.infer<typeof validationIssueSchema>

export const problemSchema = z.object({
  /** Stable identifier for the problem type. */
  type: z.string(),
  /** Short human-readable summary. Does not change between occurrences. */
  title: z.string(),
  status: z.number().int().min(400).max(599),
  /** Explanation of this occurrence. Never contains internals. */
  detail: z.string().optional(),
  /** The request path. */
  instance: z.string().optional(),
  /** Machine-readable code clients branch on. */
  code: z.string(),
  /** Correlates the response with server logs. */
  traceId: z.string().optional(),
  /** Field-level detail, present for validation failures. */
  errors: z.array(validationIssueSchema).optional(),
  /** Seconds to wait, for rate limiting and provider back-pressure. */
  retryAfter: z.number().int().nonnegative().optional(),
})

export type Problem = z.infer<typeof problemSchema>

const PROBLEM_TYPE_BASE = 'https://docs.vsp-marketing-os.com/errors'

export interface CreateProblemOptions {
  readonly status: number
  readonly code: ErrorCode
  readonly title: string
  readonly detail?: string
  readonly instance?: string
  readonly traceId?: string
  readonly errors?: readonly ValidationIssue[]
  readonly retryAfter?: number
}

export function createProblem(options: CreateProblemOptions): Problem {
  return {
    type: `${PROBLEM_TYPE_BASE}/${options.code}`,
    title: options.title,
    status: options.status,
    code: options.code,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.instance === undefined ? {} : { instance: options.instance }),
    ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
    ...(options.errors === undefined ? {} : { errors: [...options.errors] }),
    ...(options.retryAfter === undefined ? {} : { retryAfter: options.retryAfter }),
  }
}

/**
 * Converts a Zod failure into field-level issues.
 *
 * Field paths are returned so a form can highlight the offending inputs instead
 * of showing one banner and leaving the user to guess which field is wrong.
 */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
}
