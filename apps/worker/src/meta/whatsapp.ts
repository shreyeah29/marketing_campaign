/**
 * WhatsApp Cloud API request shapes, for the lead auto-reply.
 *
 * Deliberately duplicated from the API's `modules/meta/whatsapp.util.ts`, the
 * same precedent as `graph.ts` and `social/crypto.ts`: apps in this repo do not
 * import from each other. Both copies are pure and unit-tested on their own
 * side, so the duplication is visible rather than load-bearing.
 */

/**
 * The Cloud API body for a **template** message.
 *
 * Templates are not a stylistic choice here. WhatsApp only permits free-form
 * text inside a 24-hour window that the customer opens by messaging first.
 * A reply to a lead-ad submission is business-initiated — the person filled in
 * a form, they did not message us — so it must use a template Meta has already
 * approved, or the send is rejected.
 *
 * `params` fill `{{1}}`, `{{2}}`… in order. Meta rejects a components array on
 * a template that declares no placeholders, so an empty list omits the key
 * rather than sending an empty array.
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
      { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
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
 * Normalise a phone number to what the Cloud API expects: digits only.
 *
 * Returns null when nothing usable remains. Lead-ad phone fields are typed by
 * hand and arrive in every shape imaginable; sending to a malformed number
 * spends a template message against the organisation's quota for nothing.
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  // Below this cannot be a country code plus a subscriber number, so it is a
  // typo or a partial entry rather than a number worth messaging.
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}
