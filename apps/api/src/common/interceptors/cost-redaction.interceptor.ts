import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { map, type Observable } from 'rxjs'

/**
 * Strips money from every tenant-plane response.
 *
 * Ads run on each client's own Meta ad account but are funded by us, so what a
 * client spends is our commercial position, not theirs. They see performance —
 * impressions, reach, clicks, leads — and their allocation as a percentage used.
 * They never see a rupee figure derived from spend.
 *
 * This is a security boundary, so it lives here rather than in the UI. Removing
 * a column from a table hides it from someone reading the screen; it does not
 * hide it from someone reading the network tab, and `spend` was previously in
 * the JSON of `/v1/meta/analytics/summary` whether or not a column rendered it.
 *
 * Two layers, deliberately:
 *
 *   1. The services no longer compute or return these fields at all. That is the
 *      real fix, and it is where the reasoning lives.
 *   2. This interceptor, which is the net under it. A field named `cpc` added to
 *      a tenant response in six months is stripped without anyone remembering
 *      this rule existed. Defence that depends on memory is not defence.
 *
 * The platform plane is exempt: the operator console is where money is supposed
 * to be legible, and it authenticates through a different realm entirely
 * (`PlatformAdminGuard`, its own signing key). The exemption is keyed on that
 * guard having run, not on a path prefix, so a platform route moved to a new URL
 * keeps its figures and a tenant route cannot acquire them by being renamed.
 *
 * View-as is NOT exempt. An operator inspecting a client workspace is looking at
 * the client's view, and the point of that feature is to see what they see. The
 * operator's own numbers are one plane away.
 */

/**
 * Keys removed from tenant responses.
 *
 * Matched case-insensitively against both camelCase and snake_case, plus any key
 * beginning `cost_per` / `costPer`, which is how Meta names its derived cost
 * metrics (`cost_per_action_type`, `cost_per_thruplay`, and others it may add).
 */
const COST_KEYS = new Set([
  'spend',
  'socialspend',
  'social_spend',
  'cpc',
  'cpm',
  'cpp',
  'cpl',
  'roas',
  'costusd',
  'cost_usd',
  'totalcostusd',
  'total_cost_usd',
  'aispendusd',
  'ai_spend_usd',
  'aicostusd',
  'ai_cost_usd',
  'marginusd',
  'margin_usd',
  'monthlyfee',
  'monthly_fee',
  'adallocationmonthly',
  'ad_allocation_monthly',
  'adspentthismonth',
  'ad_spent_this_month',
  // Ledger columns. The app role's grant on ad_spend_ledger was revoked and has
  // been restored — revoking it made the table invisible to the boot preflight
  // and stopped the API. RLS and this denylist are what protect it now, so its
  // money columns have to be named here rather than relying on unreachability.
  'spentminor',
  'spent_minor',
  'allocationminor',
  'allocation_minor',
  'monthlyfeeminor',
  'monthly_fee_minor',
])

function isCostKey(key: string): boolean {
  const k = key.toLowerCase()
  if (COST_KEYS.has(k)) return true
  return k.startsWith('cost_per') || k.startsWith('costper')
}

/**
 * Returns a copy with cost keys removed at every depth.
 *
 * Rebuilds rather than deleting in place: the value handed to an interceptor can
 * be a Prisma result that other code still holds a reference to, and mutating it
 * would strip fields from an object something else is mid-way through using.
 */
function redact(value: unknown, depth = 0): unknown {
  // A response nested twenty levels deep is a bug, not a payload; the bound stops
  // a cyclic structure from turning a response into a hang.
  if (depth > 20) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value === null || typeof value !== 'object') return value
  // Dates, Decimals and Buffers are objects but not records — walking them
  // rebuilds them into something unrecognisable.
  if (value instanceof Date || Buffer.isBuffer(value)) return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isCostKey(k)) continue
    out[k] = redact(v, depth + 1)
  }
  return out
}

@Injectable()
export class CostRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ platformAdmin?: unknown }>()
    // Set by PlatformAdminGuard, which only a platform-realm token satisfies.
    if (request.platformAdmin !== undefined) return next.handle()
    return next.handle().pipe(map((body: unknown) => redact(body)))
  }
}

/** Exported for the tests, which assert the denylist rather than trusting it. */
export const __testables = { redact, isCostKey }
