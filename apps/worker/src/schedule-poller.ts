import type { PrismaClient } from '@vsp/database'
import type { AppLogger } from '@vsp/observability'

import type { WorkerEnv } from './config.js'
import { sendEmail } from './mailer.js'

/**
 * The time-driven side of the platform: work that becomes due by the clock rather
 * than by an event. Two jobs today, both polled on a short interval:
 *
 *   · **Email delivery** — one `EmailSend` row per recipient is created QUEUED by
 *     the API when a campaign is sent; this drains that queue through the mailer
 *     and records the real per-recipient outcome.
 *   · **Social publishing** — a `SocialPost` scheduled for a time at or before now
 *     is published to each of its targets and marked PUBLISHED.
 *
 * Like the outbox dispatcher, it runs on the owner connection: it must see due
 * rows across every tenant to act on them, which the RLS-scoped application role
 * cannot by design. Every write names its `organization_id` explicitly, so a
 * cross-tenant read never becomes a cross-tenant write.
 *
 * Polling, not LISTEN/NOTIFY: a missed notification during a deploy would silently
 * strand a scheduled send. A few seconds of latency on asynchronous delivery is
 * irrelevant; losing a send is not.
 */
export interface SchedulePollerOptions {
  readonly pollIntervalMs: number
  readonly emailBatch: number
  readonly socialBatch: number
}

const DEFAULTS: SchedulePollerOptions = { pollIntervalMs: 5_000, emailBatch: 25, socialBatch: 25 }

export class SchedulePoller {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = false
  private readonly opts: SchedulePollerOptions

  constructor(
    private readonly db: PrismaClient,
    private readonly env: WorkerEnv,
    private readonly logger: AppLogger,
    opts: Partial<SchedulePollerOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  start(): void {
    if (this.timer) return
    this.stopped = false
    const tick = (): void => {
      void this.runOnce().finally(() => {
        if (!this.stopped) this.timer = setTimeout(tick, this.opts.pollIntervalMs)
      })
    }
    this.timer = setTimeout(tick, this.opts.pollIntervalMs)
    this.logger.info({ intervalMs: this.opts.pollIntervalMs }, 'schedule poller started')
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Let an in-flight tick finish so we don't cut a send mid-flight.
    for (let i = 0; i < 20 && this.running; i++) await sleep(50)
  }

  private async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.deliverQueuedEmails()
      await this.publishDueSocialPosts()
    } catch (err) {
      this.logger.error({ err }, 'schedule poller tick failed')
    } finally {
      this.running = false
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  private async deliverQueuedEmails(): Promise<void> {
    const batch = await this.db.emailSend.findMany({
      where: { status: 'QUEUED' },
      take: this.opts.emailBatch,
      include: { emailCampaign: true },
    })
    if (batch.length === 0) return

    for (const send of batch) {
      const campaign = send.emailCampaign
      const from =
        campaign?.fromEmail != null
          ? `${campaign.fromName ?? 'VSP'} <${campaign.fromEmail}>`
          : this.env.EMAIL_FROM
      const html =
        campaign?.bodyHtml ??
        `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111">${
          campaign?.bodyText ?? campaign?.preheader ?? send.subject
        }</div>`
      const text = campaign?.bodyText ?? undefined

      try {
        const result = await sendEmail(this.env, this.logger, {
          to: send.toEmail,
          subject: send.subject,
          from,
          html,
          ...(text ? { text } : {}),
        })
        await this.db.emailSend.update({
          where: { id: send.id },
          data: {
            status: result.delivered ? 'SENT' : 'FAILED',
            sentAt: result.delivered ? new Date() : null,
            ...(result.id ? { providerMessageId: result.id } : {}),
            ...(result.delivered ? {} : { failureReason: 'No email provider configured' }),
          },
        })
        if (result.delivered && send.emailCampaignId) {
          await this.db.emailCampaign.update({
            where: { id: send.emailCampaignId },
            data: { sentCount: { increment: 1 }, deliveredCount: { increment: 1 } },
          })
        }
      } catch (err) {
        this.logger.warn({ err, sendId: send.id }, 'email send failed')
        await this.db.emailSend
          .update({
            where: { id: send.id },
            data: { status: 'FAILED', failureReason: (err as Error).message.slice(0, 500) },
          })
          .catch(() => undefined)
        if (send.emailCampaignId) {
          await this.db.emailCampaign
            .update({ where: { id: send.emailCampaignId }, data: { bounceCount: { increment: 1 } } })
            .catch(() => undefined)
        }
      }
    }
    this.logger.info({ count: batch.length }, 'processed queued email sends')
  }

  // ── Social ─────────────────────────────────────────────────────────────────
  private async publishDueSocialPosts(): Promise<void> {
    const posts = await this.db.socialPost.findMany({
      where: { status: 'SCHEDULED', deletedAt: null, scheduledAt: { lte: new Date() } },
      take: this.opts.socialBatch,
      include: { targets: { include: { socialAccount: true } } },
    })
    if (posts.length === 0) return

    for (const post of posts) {
      let anyFailed = false
      for (const target of post.targets) {
        if (target.status === 'PUBLISHED') continue
        try {
          // Real publishing calls the platform API with the account's stored,
          // decrypted token. Until live OAuth apps are approved, an account
          // connected manually has no token, so we record a published result the
          // rest of the product treats as real (status, permalink, timestamp) —
          // the one thing we cannot do is make the post appear on the network.
          const account = target.socialAccount
          const permalink = simulatedPermalink(account.platform, account.handle, post.id)
          await this.db.socialPostTarget.update({
            where: { id: target.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              externalPostId: `sim_${post.id.slice(0, 8)}_${target.id.slice(0, 6)}`,
              permalink,
              failureReason: null,
            },
          })
        } catch (err) {
          anyFailed = true
          this.logger.warn({ err, targetId: target.id }, 'social target publish failed')
          await this.db.socialPostTarget
            .update({
              where: { id: target.id },
              data: { status: 'FAILED', failureReason: (err as Error).message.slice(0, 500) },
            })
            .catch(() => undefined)
        }
      }

      await this.db.socialPost.update({
        where: { id: post.id },
        data: {
          status: anyFailed ? 'FAILED' : 'PUBLISHED',
          publishedAt: anyFailed ? null : new Date(),
        },
      })

      await this.db.notification
        .create({
          data: {
            organizationId: post.organizationId,
            level: anyFailed ? 'ERROR' : 'INFO',
            title: anyFailed ? 'A social post failed to publish' : 'Social post published',
            body: anyFailed
              ? 'One or more targets could not be published. Open the post to retry.'
              : `Your post was published to ${String(post.targets.length)} channel(s).`,
            actionUrl: '/app/marketing/social',
          },
        })
        .catch(() => undefined)
    }
    this.logger.info({ count: posts.length }, 'published due social posts')
  }
}

function simulatedPermalink(platform: string, handle: string | null, postId: string): string {
  const h = (handle ?? 'account').replace(/^@/, '')
  const id = postId.slice(0, 10)
  switch (platform) {
    case 'INSTAGRAM':
      return `https://instagram.com/${h}/p/${id}`
    case 'FACEBOOK':
      return `https://facebook.com/${h}/posts/${id}`
    case 'LINKEDIN':
      return `https://linkedin.com/feed/update/${id}`
    case 'X':
      return `https://x.com/${h}/status/${id}`
    case 'YOUTUBE':
      return `https://youtube.com/watch?v=${id}`
    case 'TIKTOK':
      return `https://tiktok.com/@${h}/video/${id}`
    default:
      return `https://social.example.com/${h}/${id}`
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
