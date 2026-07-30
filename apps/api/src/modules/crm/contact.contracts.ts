import { z } from 'zod'

import { cursorPaginationSchema } from '@vsp/contracts'

/**
 * Contact request and response schemas.
 *
 * Zod is the single source of truth: request validation, response shape, inferred
 * TypeScript types, and the OpenAPI document all derive from these. Declaring the
 * shape twice — once as a DTO class and once as a validator — is how the two
 * drift, and a response type that lies is worse than no type.
 *
 * Note what is absent: `organizationId`. It is never accepted on input and never
 * returned. The tenant is a property of the session, not of the payload.
 */

export const createContactSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(200),
    lastName: z.string().max(200).nullish(),
    email: z.string().email('Enter a valid email address').max(256).optional(),
    phone: z
      .string()
      // E.164. Stored normalised because telephony providers require it and
      // because two spellings of the same number defeat de-duplication.
      .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be E.164 format, e.g. +12145550101')
      .optional(),
    jobTitle: z.string().max(200).nullish(),
    companyId: z.string().uuid().optional(),

    // Consent is opt-in and never defaulted to true. A platform that presumes
    // consent makes its customers non-compliant on their behalf.
    emailOptIn: z.boolean().optional(),
    whatsappOptIn: z.boolean().optional(),
    smsOptIn: z.boolean().optional(),
    consentSource: z
      .string()
      .max(200)
      .optional()
      .describe('Where consent was obtained. Required to defend a send if challenged.'),

    tags: z.array(z.string().max(60)).max(50).optional(),
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: 'A contact needs at least an email address or a phone number to be reachable',
  })
  .refine((value) => value.emailOptIn !== true || value.consentSource !== undefined, {
    message: 'consentSource is required when recording email consent',
    path: ['consentSource'],
  })

export type CreateContactInput = z.infer<typeof createContactSchema>

export const updateContactSchema = z
  .object({
    firstName: z.string().min(1).max(200).optional(),
    lastName: z.string().max(200).nullish(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullish(),
    jobTitle: z.string().max(200).nullish(),
    emailOptIn: z.boolean().optional(),
    whatsappOptIn: z.boolean().optional(),
    smsOptIn: z.boolean().optional(),
    tags: z.array(z.string().max(60)).max(50).optional(),
    /**
     * Records a withdrawal of consent, timestamped. Deliberately one-way: there
     * is no field to un-opt-out, because re-consent must be captured as a fresh
     * grant with its own source, not by flipping a boolean back.
     */
    optOut: z.literal(true).optional(),
  })
  .strict()

export type UpdateContactInput = z.infer<typeof updateContactSchema>

// Email is immutable after creation: it is the natural key used for
// de-duplication, and changing it in place silently merges two people's history.
// A correction is a new contact plus an explicit merge.

export const listContactsSchema = cursorPaginationSchema.extend({
  search: z.string().min(1).max(200).optional(),
  companyId: z.string().uuid().optional(),
})

export type ListContactsQuery = z.infer<typeof listContactsSchema>

export const contactResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  companyId: z.string().nullable(),
  ownerId: z.string().nullable(),
  /**
   * Grouped rather than flattened. Consent is one concept with several channels,
   * and a UI that renders it as a unit is less likely to send on a channel the
   * contact never agreed to.
   */
  consent: z.object({
    email: z.boolean(),
    whatsapp: z.boolean(),
    sms: z.boolean(),
    optedOutAt: z.string().nullable(),
  }),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ContactResponse = z.infer<typeof contactResponseSchema>
