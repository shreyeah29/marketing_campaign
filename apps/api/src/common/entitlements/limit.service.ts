import { HttpException, HttpStatus, Injectable } from '@nestjs/common'

import { createProblem, ERROR_CODES } from '@marketing-os/contracts'
import { withinLimit, type EntitlementSnapshot } from '@marketing-os/database'

/**
 * Enforces per-organisation usage limits.
 *
 * The design lists limits as a pipeline gate, but a limit is action-specific: one
 * endpoint consumes contacts, another consumes emails, another voice minutes. A
 * blanket interceptor cannot know which metric an arbitrary route draws on, so
 * enforcement is an explicit call the handler (or the command it dispatches)
 * makes for the metric it actually consumes. That is honest — the limit is
 * checked against real usage — where a generic interceptor would have to guess.
 *
 * The check runs *before* the consuming work, generalising the AI budget guard in
 * `ai-core`: projected usage against the cap, refuse if it would exceed. Checking
 * after the fact is accounting, not a limit.
 */
@Injectable()
export class LimitService {
  /**
   * Throws `429 limit_exceeded` if consuming `amount` of `metric` would exceed the
   * organisation's cap. Unlimited (-1) and undefined metrics pass.
   *
   * `currentUsage` is supplied by the caller because only the caller knows how to
   * count it: a row count for a gauge (contacts), a period sum for a counter
   * (emails this month). The snapshot carries the cap; the caller carries the
   * usage; this method compares them.
   */
  assertWithinLimit(
    snapshot: EntitlementSnapshot,
    metric: string,
    currentUsage: number,
    amount = 1,
  ): void {
    if (withinLimit(snapshot, metric, currentUsage, amount)) return

    const limit = snapshot.limits.get(metric)
    throw new HttpException(
      createProblem({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ERROR_CODES.LIMIT_EXCEEDED,
        title: 'Limit reached',
        detail:
          `This workspace has reached its ${metric.replace(/_/g, ' ')} limit` +
          (limit === undefined ? '.' : ` of ${String(limit)}.`) +
          ' Upgrade the plan or raise the limit to continue.',
      }),
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }

  /**
   * Non-throwing variant, for a UI that wants to show remaining headroom rather
   * than fail. Returns how many units remain, or null for unlimited/undefined.
   */
  remaining(snapshot: EntitlementSnapshot, metric: string, currentUsage: number): number | null {
    const limit = snapshot.limits.get(metric)
    if (limit === undefined || limit < 0) return null
    return Math.max(0, limit - currentUsage)
  }
}
