/**
 * Advertising compliance checks against the organisation's brand kit.
 *
 * Regulated professions advertise under rules that differ by country, and the
 * cost of breaking them is not a bad campaign — it is a regulator. The brand kit
 * records two things a person set deliberately: phrases they must never claim,
 * and disclaimers that have to appear. This module finds the first in generated
 * copy so it can be surfaced before anything publishes.
 *
 * It reports; it does not block. The person reviewing is the compliance
 * authority, and a check that silently refuses to publish — with no way to say
 * "this instance is fine" — strands them. Amber, not a locked door.
 */

export interface LabelledValue {
  label: string
  value: string
}

export interface ComplianceRules {
  bannedClaims: string[]
  disclaimers: LabelledValue[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Returns the banned phrases that actually appear in `text`.
 *
 * Matching is whole-word and case-insensitive, so banning "best" flags
 * "the best outcome" but not "bestseller" — a substring match would flag
 * ordinary words and train people to ignore the warning.
 */
export function findBannedClaims(text: string, banned: readonly string[]): string[] {
  if (!text) return []
  const hits: string[] = []

  for (const raw of banned) {
    const term = raw.trim()
    if (term.length === 0) continue

    // `\b` only behaves next to word characters. A term like "#1" would anchor
    // wrongly, so each boundary is added only where it means something.
    const lead = /^\w/.test(term) ? '\\b' : ''
    const tail = /\w$/.test(term) ? '\\b' : ''

    let re: RegExp
    try {
      re = new RegExp(`${lead}${escapeRegExp(term)}${tail}`, 'i')
    } catch {
      // A term that cannot compile must not take the whole check down with it.
      continue
    }
    if (re.test(text)) hits.push(term)
  }

  return hits
}

/**
 * Checks every piece of copy that will be seen publicly, de-duplicated.
 *
 * Callers pass caption, body and CTA together rather than checking each: a
 * phrase banned once is banned everywhere, and reporting it three times because
 * it appears in three fields is noise.
 */
export function checkCopy(parts: readonly (string | null | undefined)[], rules: ComplianceRules) {
  const text = parts.filter((p): p is string => Boolean(p && p.trim())).join('\n')
  const claims = [...new Set(findBannedClaims(text, rules.bannedClaims))]
  return {
    claims,
    /** Disclaimers are advisory context, not a match — they must be stamped regardless. */
    disclaimers: rules.disclaimers.filter((d) => d.value.trim().length > 0),
    get clean() {
      return claims.length === 0
    },
  }
}
