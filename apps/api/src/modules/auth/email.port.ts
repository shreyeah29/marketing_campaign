import { Inject, Injectable } from '@nestjs/common'

import type { AppLogger } from '@vsp/observability'

import { LOGGER } from '../../infrastructure/database.module.js'

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
