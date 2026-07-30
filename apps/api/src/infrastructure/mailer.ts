import { Inject, Injectable } from '@nestjs/common'

import type { AppLogger } from '@vsp/observability'

import { loadEnv } from '../config/env.js'

import { LOGGER } from './database.module.js'

/**
 * Outbound email — one place every message leaves the system through.
 *
 * Delivery is HTTP (Resend's REST API), deliberately not SMTP: no mail library,
 * no long-lived connection, and it works unchanged on any host including Render's
 * free tier. When `RESEND_API_KEY` is unset the mailer *logs* the message instead
 * of sending — so development and an unconfigured deployment never crash, they
 * simply don't deliver, and the operator turns delivery on by setting one env var.
 *
 * Swapping providers is a change confined to `deliver()`: the rest of the system
 * depends only on `send()`.
 */
export interface OutboundEmail {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  /** Overrides the platform default From (EMAIL_FROM). */
  readonly from?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

@Injectable()
export class MailerService {
  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  /** Sends one email. Resolves on success; throws only on a hard provider error. */
  async send(email: OutboundEmail): Promise<{ id: string | null; delivered: boolean }> {
    const env = loadEnv()
    const from = email.from ?? env.EMAIL_FROM

    if (!env.RESEND_API_KEY) {
      // No provider configured: log and report "not delivered" honestly, never
      // pretend. Callers persist this as a QUEUED/failed send rather than SENT.
      this.logger.info(
        { to: email.to, subject: email.subject },
        `📧 [email — not delivered, RESEND_API_KEY unset] ${email.subject} → ${email.to}`,
      )
      return { id: null, delivered: false }
    }

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        ...(email.text ? { text: email.text } : {}),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      this.logger.error(
        { to: email.to, subject: email.subject, status: res.status, detail },
        'email delivery failed',
      )
      throw new Error(`email delivery failed (${String(res.status)})`)
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { id: body.id ?? null, delivered: true }
  }
}
