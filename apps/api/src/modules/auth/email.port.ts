import { Inject, Injectable } from '@nestjs/common'

import type { AppLogger } from '@vsp/observability'

import { loadEnv } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'
import { MailerService } from '../../infrastructure/mailer.js'

/**
 * A transactional auth email — verification, password reset, or an invitation.
 *
 * Kept deliberately small and channel-agnostic. What matters to every auth email
 * is the same: who it is for, why, and the one link they need to click.
 */
export interface AuthEmail {
  readonly to: string
  readonly subject: string
  readonly heading: string
  readonly body: string
  readonly actionUrl: string
  readonly actionLabel: string
}

/**
 * The port through which auth emails leave the system.
 *
 * Behind an interface on purpose: delivery is a pluggable provider (Resend,
 * SendgGrid, SES — see the provider registry), and no auth code should hard-depend
 * on one. In development the log transport below stands in, so the whole flow —
 * register, verify, reset, invite — is exercisable with no SMTP credentials, and
 * the link is printed rather than sent.
 */
export interface EmailPort {
  send(email: AuthEmail): Promise<void>
}

export const EMAIL_PORT = Symbol('EMAIL_PORT')

/**
 * The development email transport: it logs the message and, crucially, the action
 * URL, so a verification or reset flow can be completed from the server logs
 * without a mail provider configured. Wired as the `EMAIL_PORT` provider until a
 * real transport is selected per-org through the provider configuration surface.
 */
@Injectable()
export class LogEmailTransport implements EmailPort {
  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  send(email: AuthEmail): Promise<void> {
    this.logger.info(
      { to: email.to, subject: email.subject, actionUrl: email.actionUrl },
      `📧 [auth email] ${email.subject} → ${email.to}  |  ${email.actionLabel}: ${email.actionUrl}`,
    )
    return Promise.resolve()
  }
}

/**
 * The production auth transport: renders the email to branded HTML and hands it
 * to the {@link MailerService} (Resend). If the mailer has no provider configured
 * it logs and reports non-delivery — so this transport is always safe to wire; it
 * degrades to the same behaviour as {@link LogEmailTransport} until a key is set.
 */
@Injectable()
export class MailerEmailTransport implements EmailPort {
  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  async send(email: AuthEmail): Promise<void> {
    const { delivered } = await this.mailer.send({
      to: email.to,
      subject: email.subject,
      html: renderAuthEmail(email),
      text: `${email.heading}\n\n${email.body}\n\n${email.actionLabel}: ${email.actionUrl}`,
    })
    if (!delivered) {
      this.logger.info(
        { to: email.to, subject: email.subject, actionUrl: email.actionUrl },
        `📧 [auth email — not delivered] ${email.actionLabel}: ${email.actionUrl}`,
      )
    }
  }
}

/** Minimal, self-contained branded HTML for a transactional auth email. */
function renderAuthEmail(email: AuthEmail): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <tr><td style="padding:32px 32px 8px;"><h1 style="margin:0;font-size:20px;color:#111827;">${escapeHtml(email.heading)}</h1></td></tr>
        <tr><td style="padding:8px 32px 24px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(email.body)}</td></tr>
        <tr><td style="padding:0 32px 32px;"><a href="${escapeAttr(email.actionUrl)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(email.actionLabel)}</a></td></tr>
        <tr><td style="padding:0 32px 32px;color:#9ca3af;font-size:12px;line-height:1.5;">If the button doesn't work, copy and paste this link:<br>${escapeHtml(email.actionUrl)}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}
function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/**
 * Chooses the transport at wire-time: the real mailer when an email provider is
 * configured, the log transport otherwise. Registered as the `EMAIL_PORT` factory
 * so the rest of auth depends only on the interface.
 */
export const emailTransportProvider = {
  provide: EMAIL_PORT,
  useFactory: (mailer: MailerService, logger: AppLogger): EmailPort =>
    loadEnv().RESEND_API_KEY ? new MailerEmailTransport(mailer, logger) : new LogEmailTransport(logger),
  inject: [MailerService, LOGGER],
}
