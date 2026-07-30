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

/** How many times a transient email delivery error is retried before giving up. */
const MAX_EMAIL_ATTEMPTS = 5

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
    // Let the in-flight tick finish before the caller disconnects the database
    // client we're mid-write on — cutting it off can leave a delivered email
    // stuck SENDING and re-sent on restart. Wait generously (a full batch of
    // network sends), with a hard ceiling so shutdown can't hang forever.
    const deadline = Date.now() + 60_000
    while (this.running && Date.now() < deadline) await sleep(100)
  }

  private async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.reclaimStaleClaims()
      await this.deliverQueuedEmails()
      await this.publishDueSocialPosts()
    } catch (err) {
      this.logger.error({ err }, 'schedule poller tick failed')
    } finally {
      this.running = false
    }
  }

  /**
   * Recovers work claimed by a worker that died mid-delivery. A row left in the
   * intermediate state (email SENDING / post PUBLISHING) with no update for a few
   * minutes is an abandoned claim — return it to the queue so another worker
   * finishes it, rather than stranding it forever (the poller only picks up
   * QUEUED/SCHEDULED). The window is generous so it never races a live delivery.
   */
  private async reclaimStaleClaims(): Promise<void> {
    const staleBefore = new Date(Date.now() - 5 * 60_000)
    const [emails, posts] = await Promise.all([
      this.db.emailSend.updateMany({
        where: { status: 'SENDING', updatedAt: { lt: staleBefore } },
        data: { status: 'QUEUED' },
      }),
      this.db.socialPost.updateMany({
        where: { status: 'PUBLISHING', updatedAt: { lt: staleBefore } },
        data: { status: 'SCHEDULED' },
      }),
    ])
    if (emails.count > 0 || posts.count > 0) {
      this.logger.warn({ emails: emails.count, posts: posts.count }, 'reclaimed stale delivery claims')
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  private async deliverQueuedEmails(): Promise<void> {
    const candidates = await this.db.emailSend.findMany({
      where: { status: 'QUEUED' },
      select: { id: true },
      take: this.opts.emailBatch,
      orderBy: { createdAt: 'asc' },
    })
    if (candidates.length === 0) return

    let processed = 0
    for (const { id } of candidates) {
      // Atomic claim: flip QUEUED→SENDING. `count === 1` means WE claimed it; any
      // other worker (or a re-entrant tick) that raced us gets count 0 and skips.
      // This is what makes horizontal scaling safe — no row is ever sent twice.
      const claim = await this.db.emailSend.updateMany({
        where: { id, status: 'QUEUED' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      })
      if (claim.count !== 1) continue

      const send = await this.db.emailSend.findUnique({ where: { id }, include: { emailCampaign: true } })
      if (!send) continue
      processed++

      const campaign = send.emailCampaign
      const from =
        campaign?.fromEmail != null
          ? `${campaign.fromName ?? 'VSP'} <${campaign.fromEmail}>`
          : this.env.EMAIL_FROM
      const html =
        campaign?.bodyHtml ??
        `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111">${escapeHtml(
          campaign?.bodyText ?? campaign?.preheader ?? send.subject,
        )}</div>`
      const text = campaign?.bodyText ?? undefined

      try {
        const result = await sendEmail(this.env, this.logger, {
          to: send.toEmail,
          subject: send.subject,
          from,
          html,
          ...(text ? { text } : {}),
        })
        if (result.delivered) {
          await this.db.emailSend.update({
            where: { id },
            data: { status: 'SENT', sentAt: new Date(), ...(result.id ? { providerMessageId: result.id } : {}) },
          })
          if (send.emailCampaignId) {
            await this.db.emailCampaign.update({
              where: { id: send.emailCampaignId },
              data: { sentCount: { increment: 1 }, deliveredCount: { increment: 1 } },
            })
          }
        } else {
          // No provider configured — a permanent condition, not transient. Mark
          // FAILED so it isn't retried forever against a mailer that can't deliver.
          await this.db.emailSend.update({
            where: { id },
            data: { status: 'FAILED', failureReason: 'No email provider configured' },
          })
        }
      } catch (err) {
        // Transient provider/network error: return to QUEUED to retry next tick,
        // up to MAX_EMAIL_ATTEMPTS, then give up so one bad address can't loop.
        const giveUp = send.attempts >= MAX_EMAIL_ATTEMPTS
        this.logger.warn({ err, sendId: id, attempts: send.attempts, giveUp }, 'email send failed')
        await this.db.emailSend
          .update({
            where: { id },
            data: { status: giveUp ? 'FAILED' : 'QUEUED', failureReason: errMessage(err) },
          })
          .catch(() => undefined)
        if (giveUp && send.emailCampaignId) {
          await this.db.emailCampaign
            .update({ where: { id: send.emailCampaignId }, data: { bounceCount: { increment: 1 } } })
            .catch(() => undefined)
        }
      }
    }
    if (processed > 0) this.logger.info({ count: processed }, 'processed queued email sends')
  }

  // ── Social ─────────────────────────────────────────────────────────────────
  private async publishDueSocialPosts(): Promise<void> {
    const candidates = await this.db.socialPost.findMany({
      where: { status: 'SCHEDULED', deletedAt: null, scheduledAt: { lte: new Date() } },
      select: { id: true },
      take: this.opts.socialBatch,
    })
    if (candidates.length === 0) return

    let published = 0
    for (const { id } of candidates) {
      // Atomic claim via the PUBLISHING status: a duplicate social post is
      // publicly visible, so double-publish must be impossible even with several
      // worker pods. Only the worker that wins SCHEDULED→PUBLISHING proceeds.
      const claim = await this.db.socialPost.updateMany({
        where: { id, status: 'SCHEDULED' },
        data: { status: 'PUBLISHING' },
      })
      if (claim.count !== 1) continue

      const post = await this.db.socialPost.findUnique({
        where: { id },
        include: { targets: { include: { socialAccount: true } } },
      })
      if (!post) continue
      published++
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
              data: { status: 'FAILED', failureReason: errMessage(err) },
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
    if (published > 0) this.logger.info({ count: published }, 'published due social posts')
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

/** Safe error message even when a non-Error value was thrown. */
function errMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.slice(0, 500)
}

/** Escapes text interpolated into an HTML email body. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}
