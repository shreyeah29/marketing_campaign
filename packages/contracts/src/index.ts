/**
 * `@vsp/contracts` is the shared boundary between the API, the workers and the
 * frontend. Zod schemas here are the single source of truth: request and response
 * types are inferred from them, the OpenAPI document is generated from them, and
 * the frontend imports the same types. Nothing is declared twice, so nothing can
 * drift.
 */

export {
  buildPage,
  cursorPaginationSchema,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
  paginatedSchema,
  sortDirectionSchema,
  type CursorPagination,
  type CursorPayload,
  type Paginated,
  type SortDirection,
} from './pagination.js'

export {
  createProblem,
  ERROR_CODES,
  problemSchema,
  toValidationIssues,
  validationIssueSchema,
  type CreateProblemOptions,
  type ErrorCode,
  type Problem,
  type ValidationIssue,
} from './problem.js'

export {
  EVENT_NAMES,
  EVENT_REGISTRY,
  eventEnvelopeSchema,
  eventVersion,
  isKnownEventName,
  parseEventPayload,
  type DomainEvent,
  type EventEnvelope,
  type EventName,
  type EventPayload,
} from './events.js'
