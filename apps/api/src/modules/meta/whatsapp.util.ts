/**
 * Pure helpers for the WhatsApp Cloud API: build an outbound text message body, and
 * parse inbound messages out of a webhook payload. Kept IO-free so both the request
 * shape and the (easy-to-get-wrong) inbound parsing are unit-tested directly.
 */

/** The Cloud API body to POST to /{phone_number_id}/messages for a text reply. */
export function buildTextMessage(to: string, body: string): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  }
}

/**
 * The Cloud API body for a **template** message.
 *
 * Templates are not a stylistic choice. WhatsApp only allows free-form text
 * inside a 24-hour window opened by the customer messaging first; anything the
 * business initiates — such as replying to a lead-ad submission — must use a
 * template Meta has already approved, or the send is rejected outright.
 *
 * `params` fill the template's `{{1}}`, `{{2}}`… placeholders in order. A
 * template with no placeholders takes none, and passing some anyway is an error
 * on Meta's side, so the components array is omitted when the list is empty.
 */
export function buildTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: readonly string[] = [],
): Record<string, unknown> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  }
  if (params.length > 0) {
    template['components'] = [
      {
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text })),
      },
    ]
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  }
}

/**
 * Normalise a phone number to what the Cloud API expects: digits only, no `+`,
 * no spaces, punctuation or parentheses.
 *
 * Returns null when nothing usable is left. Lead-ad phone fields are typed by
 * hand into a phone keypad and arrive in every shape imaginable, and sending to
 * a malformed number burns a template send against the org's quota for nothing.
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  // Shorter than this cannot be a country code plus a subscriber number, so it
  // is a typo or a partial entry rather than something worth sending to.
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

export interface InboundMessage {
  /** The prospect's WhatsApp id (their phone number). */
  readonly from: string
  readonly text: string
  readonly messageId: string
  /** The business number that received it — used to resolve which client owns it. */
  readonly phoneNumberId: string
  readonly wabaId: string | null
  readonly contactName: string | null
}

interface WaPayload {
  entry?: {
    id?: string
    changes?: {
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: { from?: string; id?: string; type?: string; text?: { body?: string } }[]
      }
    }[]
  }[]
}

/**
 * Extract inbound text messages from a WhatsApp webhook payload. Non-text messages
 * (images, statuses, reactions) are skipped — v1 handles text conversations.
 */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const body = payload as WaPayload
  if (!body || !Array.isArray(body.entry)) return []
  const out: InboundMessage[] = []
  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages' || !change.value) continue
      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id ?? ''
      const contactName = value.contacts?.[0]?.profile?.name ?? null
      for (const msg of value.messages ?? []) {
        const text = msg.type === 'text' ? msg.text?.body : undefined
        if (typeof text !== 'string' || !msg.from || !msg.id) continue
        out.push({
          from: msg.from,
          text,
          messageId: msg.id,
          phoneNumberId,
          wabaId: entry.id ?? null,
          contactName,
        })
      }
    }
  }
  return out
}
