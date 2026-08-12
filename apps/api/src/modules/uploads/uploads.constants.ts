/**
 * Upload limits, in their own module so `main.ts` can apply the byte ceiling at
 * the multipart layer without importing the controller — the ceiling has to be
 * enforced while the request is being read, not after a handler receives it.
 */

/** A product photograph. Generous for a phone camera, far below a raw scan. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

/**
 * Formats accepted for upload.
 *
 * SVG is deliberately absent and must stay absent: it is a document format that
 * can carry script and external references, and we serve uploads from a public
 * bucket. "It is just a logo" is exactly how stored XSS gets shipped.
 */
export const ACCEPTED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** Beyond this, resize on the way in. A 8000px product shot helps nobody. */
export const MAX_IMAGE_DIMENSION = 2400
