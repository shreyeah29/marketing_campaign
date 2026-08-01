import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Pure helpers for inbound Meta webhooks (lead ads + WhatsApp). Kept free of Nest
 * and IO so the security-critical parts — signature verification and the
 * subscription handshake — are unit-tested directly.
 */

/**
 * Verify Meta's `X-Hub-Signature-256` against the raw request body. Meta signs the
 * exact bytes with the app secret, so this must run on the raw body, never a
 * re-serialised object. A missing or mismatched signature returns false.
 */
export function verifySignature(
  rawBody: Buffer | string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The GET subscription handshake: Meta calls the webhook with a challenge; we echo
 * it back only when the mode and verify token match. Returns the challenge string
 * to reply with, or null to reject.
 */
export function verifyHandshake(
  query: Record<string, string | undefined>,
  verifyToken: string,
): string | null {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
    return query['hub.challenge'] ?? ''
  }
  return null
}

export interface LeadgenEvent {
  readonly leadgenId: string
  readonly pageId: string
  readonly formId: string | null
  readonly adId: string | null
  readonly createdTime: number | null
}

interface WebhookPayload {
  object?: string
  entry?: {
    id?: string
    changes?: { field?: string; value?: Record<string, unknown> }[]
    messaging?: unknown[]
  }[]
}

/** Extract lead-ad submissions from a `page` webhook payload. */
export function parseLeadgenEvents(payload: unknown): LeadgenEvent[] {
  const body = payload as WebhookPayload
  if (!body || !Array.isArray(body.entry)) return []
  const events: LeadgenEvent[] = []
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen' || !change.value) continue
      const v = change.value
      const leadgenId = typeof v['leadgen_id'] === 'string' ? v['leadgen_id'] : ''
      if (!leadgenId) continue
      events.push({
        leadgenId,
        pageId: typeof v['page_id'] === 'string' ? v['page_id'] : (entry.id ?? ''),
        formId: typeof v['form_id'] === 'string' ? v['form_id'] : null,
        adId: typeof v['ad_id'] === 'string' ? v['ad_id'] : null,
        createdTime: typeof v['created_time'] === 'number' ? v['created_time'] : null,
      })
    }
  }
  return events
}

/**
 * Map a Meta lead's `field_data` (array of `{ name, values }`) into a flat record,
 * so downstream code reads `fields.email` rather than walking the Graph shape.
 */
export function mapLeadFields(fieldData: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(fieldData)) return out
  for (const f of fieldData as { name?: string; values?: unknown[] }[]) {
    if (typeof f.name === 'string' && Array.isArray(f.values) && typeof f.values[0] === 'string') {
      out[f.name] = f.values[0]
    }
  }
  return out
}
