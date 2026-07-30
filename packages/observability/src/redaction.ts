/**
 * What must never reach a log sink.
 *
 * Logs are the least-guarded copy of production data: they fan out to Sentry, to
 * a hosting provider's aggregator, to a laptop during an incident, and they are
 * retained long after the request. Treating them as a place secrets can appear
 * "just for debugging" is how credentials end up in a third-party system nobody
 * audits.
 *
 * pino applies these paths before serialisation, so a redacted value never exists
 * in the emitted object at all.
 */

/**
 * Exact paths redacted from every log record.
 *
 * Wildcards are used liberally: the cost of redacting a field that turned out to
 * be harmless is a `[Redacted]` in a log line, while the cost of missing one is a
 * leaked credential.
 */
export const REDACTED_PATHS = [
  // Credentials and tokens
  'password',
  '*.password',
  '*.passwordHash',
  'token',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.sessionToken',
  '*.apiKey',
  '*.secret',
  '*.clientSecret',
  '*.privateKey',
  '*.keyHash',
  '*.tokenHash',
  '*.secretHash',

  // Provider credentials — envelope-encrypted at rest, and not logged either
  '*.ciphertext',
  '*.wrappedKey',
  '*.authTag',

  // Request headers that carry credentials
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',

  // Payment data. Never wanted, and never stored — Stripe holds it.
  '*.cardNumber',
  '*.cvc',
  '*.iban',

  // Personal data that has no diagnostic value. Ids are logged instead, so an
  // incident can still be traced back through the database when justified.
  '*.email',
  '*.phone',
  '*.toEmail',
  '*.fromEmail',
  '*.e164',
  '*.toE164',
  '*.fromE164',
  '*.ipAddress',

  // Message bodies and generated content: high volume, frequently personal, and
  // useless in aggregate. Log lengths and ids, not text.
  '*.body',
  '*.transcript',
  '*.plainText',
  '*.prompt',
] as const

/** Placeholder written in place of a redacted value. */
export const REDACTION_PLACEHOLDER = '[Redacted]'
