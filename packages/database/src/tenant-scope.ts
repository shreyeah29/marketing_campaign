import {
  MissingTenantContextError,
  TenantMismatchError,
  UnscopableOperationError,
} from './errors.js'
import { PARENT_SCOPED_MODELS, TENANT_SCOPED_MODELS } from './model-registry.js'
import { getTenantContext } from './tenant-context.js'

/**
 * Prisma extension enforcing tenant isolation at the query layer.
 *
 * Layer 2 of three (docs/ARCHITECTURE.md §5). It exists because the previous
 * implementation depended on thirteen controllers each remembering
 * `.Where(x => x.OrganizationId == orgId)`. That holds until someone forgets
 * once, and the failure is silent and total.
 *
 * Rules
 *   · A tenant-scoped model queried with no tenant context THROWS. It never
 *     defaults, and never returns unscoped rows.
 *   · Reads have `organizationId` merged into `where`.
 *   · Writes have `organizationId` injected into `data`; supplying a conflicting
 *     value is an error, not an override.
 *   · `findUnique` is refused, because it cannot be scoped — see below.
 *   · An operation this extension does not recognise is refused rather than
 *     passed through, so a future Prisma operation must be handled explicitly
 *     instead of silently escaping isolation.
 *
 * Deliberate limitation: `$queryRaw` and `$executeRaw` cannot be rewritten,
 * because their SQL is opaque here. They are covered by layer 3, PostgreSQL
 * row-level security — which is precisely why layer 3 is not optional.
 */

const TENANT_SCOPED = new Set<string>(TENANT_SCOPED_MODELS)
const PARENT_SCOPED = new Set<string>(PARENT_SCOPED_MODELS)

const WHERE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
])

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn'])

const MUTATE_OPERATIONS = new Set(['update', 'delete', 'upsert'])

/**
 * Prisma will not accept a non-unique field in a `findUnique` where clause, and
 * an extension cannot rewrite one operation into another. So these are refused
 * rather than allowed through unscoped. `findFirst` takes the same `where`.
 */
const UNSCOPABLE_OPERATIONS = new Map([
  ['findUnique', 'Use findFirst with the same where clause; it accepts the tenant predicate.'],
  [
    'findUniqueOrThrow',
    'Use findFirstOrThrow with the same where clause; it accepts the tenant predicate.',
  ],
])

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Merges the tenant predicate into a `where`, preserving what is already there. */
function scopeWhere(where: unknown, organizationId: string): UnknownRecord {
  if (!isRecord(where)) return { organizationId }

  // A caller-supplied organizationId is honoured only when it matches the active
  // tenant. On mismatch both predicates are kept, which contradicts and returns
  // nothing — failing closed rather than trusting the argument.
  if ('organizationId' in where && where['organizationId'] !== organizationId) {
    return { AND: [where, { organizationId }] }
  }

  return { ...where, organizationId }
}

/** Stamps the tenant onto write payloads, rejecting a conflicting explicit value. */
function scopeData(data: unknown, organizationId: string, model: string): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => scopeData(entry, organizationId, model))
  }

  if (!isRecord(data)) return data

  const existing = data['organizationId']
  if (typeof existing === 'string' && existing !== organizationId) {
    throw new TenantMismatchError(model, organizationId, existing)
  }

  return { ...data, organizationId }
}

interface OperationParams {
  model?: string | undefined
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
}

export function createTenantScopeExtension() {
  return {
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: OperationParams): Promise<unknown> {
          // Global identity models pass through: a user spans organisations.
          // Parent-scoped children pass through too — they have no tenant column,
          // and PostgreSQL enforces them via an EXISTS policy on the parent.
          if (!model || (!TENANT_SCOPED.has(model) && PARENT_SCOPED.has(model))) {
            return query(args)
          }
          if (!TENANT_SCOPED.has(model)) {
            return query(args)
          }

          const context = getTenantContext()
          if (!context) {
            throw new MissingTenantContextError(model, operation)
          }

          const guidance = UNSCOPABLE_OPERATIONS.get(operation)
          if (guidance !== undefined) {
            throw new UnscopableOperationError(model, operation, guidance)
          }

          const { organizationId } = context
          const input: UnknownRecord = isRecord(args) ? { ...args } : {}

          if (WHERE_OPERATIONS.has(operation)) {
            input['where'] = scopeWhere(input['where'], organizationId)
            return query(input)
          }

          if (CREATE_OPERATIONS.has(operation)) {
            input['data'] = scopeData(input['data'], organizationId, model)
            return query(input)
          }

          if (MUTATE_OPERATIONS.has(operation)) {
            input['where'] = scopeWhere(input['where'], organizationId)

            if (operation === 'upsert') {
              input['create'] = scopeData(input['create'], organizationId, model)
              // `update` is deliberately not stamped: the tenant is already
              // pinned by `where`, and writing it again would try to modify a
              // column that must never change.
            }

            return query(input)
          }

          throw new UnscopableOperationError(
            model,
            operation,
            'This operation is not handled by the tenant scope extension. Add explicit handling in ' +
              'tenant-scope.ts rather than exempting the model — unrecognised operations are refused ' +
              'so that isolation cannot be lost by omission.',
          )
        },
      },
    },
  } as const
}
