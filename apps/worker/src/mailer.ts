import type { AppLogger } from '@marketing-os/observability'

import type { WorkerEnv } from './config.js'

/**
 * Worker-side email delivery. Mirrors the API's mailer: HTTP (Resend REST), no
 * SMTP library. When `RESEND_API_KEY` is unset it logs and reports non-delivery
 * so an unconfigured deployment degrades cleanly instead of failing every send.
 *
 * Kept as a tiny standalone function rather than a shared package: it is ~30
 * lines and the API and worker are separate deploy units, so a shared email
 * package would be more plumbing than the duplication it removes.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface WorkerEmail {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
}

export async function sendEmail(
  env: WorkerEnv,
  logger: AppLogger,
  email: WorkerEmail,
): Promise<{ id: string | null; delivered: boolean }> {
  const from = email.from ?? env.EMAIL_FROM

  if (!env.RESEND_API_KEY) {
    logger.info(
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
    throw new Error(`email delivery failed (${String(res.status)}): ${detail.slice(0, 200)}`)
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { id: body.id ?? null, delivered: true }
}
