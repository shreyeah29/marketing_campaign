import { BadRequestException } from '@nestjs/common'
import type { z } from 'zod'

/**
 * Parses a request body against a Zod schema, throwing a 400 on failure.
 *
 * A one-line helper so every controller validates the same way and produces the
 * same field-level issues, which the exception filter turns into problem+json.
 * The alternative — `schema.safeParse` plus a manual `if (!ok) throw` at every
 * call site — is four lines that get copied slightly differently each time.
 */
export function zodBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success) throw new BadRequestException(result.error.issues)
  return result.data
}
