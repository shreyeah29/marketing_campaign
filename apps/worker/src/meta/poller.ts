import type { PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import type { WorkerEnv } from '../config.js'
import { openSealed, type SealedSecret } from '../social/crypto.js'
import { graphGet, graphPost, mapLeadFields, MetaApiError } from './graph.js'
import { buildTemplateMessage, normaliseWhatsAppNumber } from './whatsapp.js'

/**
 * The Meta poller — two jobs on one self-rescheduling loop:
 *
 * 1. Every tick: turn RECEIVED leadgen webhook events into real CRM leads.
 *    The webhook controller stores events with no organisation (a webhook has
 *    no tenant context); this is where the org is resolved (ad → form → page),
 *    the lead is fetched from the Graph API with the tenant's token, and the
 *    contact + lead land on their board.
 *
 * 2. Every SYNC_INTERVAL: pull ad insights (impressions, reach, clicks, leads,
 *    spend + age/gender/region breakdowns) for every connected organisation
 *    into AdInsight/AdInsightBreakdown — the rows the analytics endpoints read.
 *
 * Runs on the OWNER client: meta_webhook_event has no organization_id, and the
 * sync spans tenants. Every tenant-scoped write carries an explicit
 * organizationId, mirroring the schedule poller.
 */

const TICK_MS = 15_000
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
const EVENT_BATCH = 25
const ADS_PER_SYNC = 50

interface LeadgenPayload {
  leadgenId?: string
  pageId?: string
  formId?: string | null
  adId?: string | null
}

export class MetaPoller {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private running = false
  private lastSyncAt = 0

  constructor(
    private readonly db: PrismaClient,
    private readonly env: WorkerEnv,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    const tick = async (): Promise<void> => {
      if (this.stopped) return
      await this.runOnce()
      if (!this.stopped) this.timer = setTimeout(() => void tick(), TICK_MS)
    }
    this.timer = setTimeout(() => void tick(), TICK_MS)
    this.logger.info({ tickMs: TICK_MS }, 'meta poller started')
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    const deadline = Date.now() + 60_000
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.processLeadgenEvents()
      if (Date.now() - this.lastSyncAt > SYNC_INTERVAL_MS) {
        this.lastSyncAt = Date.now()
        await this.syncInsights()
      }
    } catch (err) {
      this.logger.error({ err }, 'meta poller tick failed')
    } finally {
      this.running = false
    }
  }

  // ── Leadgen events → CRM leads ─────────────────────────────────────────────

  private async processLeadgenEvents(): Promise<void> {
    const events = await this.db.metaWebhookEvent.findMany({
      where: { status: 'RECEIVED', field: 'leadgen' },
      orderBy: { receivedAt: 'asc' },
      take: EVENT_BATCH,
    })

    for (const event of events) {
      try {
        await this.processOne(event.id, event.payload as LeadgenPayload)
        await this.db.metaWebhookEvent.updateMany({
          where: { id: event.id, status: 'RECEIVED' },
          data: { status: 'PROCESSED', processedAt: new Date() },
        })
      } catch (err) {
        await this.db.metaWebhookEvent
          .updateMany({
            where: { id: event.id },
            data: { status: 'FAILED', error: errMessage(err), processedAt: new Date() },
          })
          .catch(() => undefined)
        this.logger.error({ err, eventId: event.id }, 'leadgen event failed')
      }
    }
  }

  private async processOne(eventId: string, payload: LeadgenPayload): Promise<void> {
    const leadgenId = payload.leadgenId
    if (!leadgenId) throw new Error('event payload has no leadgenId')

    // Attribution: the ad tells us the org AND which of our ads produced the
    // lead; the form and page are progressively weaker fallbacks.
    const ad = payload.adId
      ? await this.db.ad.findFirst({
          where: { metaAdId: payload.adId },
          select: { id: true, organizationId: true },
        })
      : null
    const form =
      !ad && payload.formId
        ? await this.db.metaLeadForm.findFirst({
            where: { metaFormId: payload.formId },
            select: { organizationId: true },
          })
        : null
    const connectionByPage =
      !ad && !form && payload.pageId
        ? await this.db.metaConnection.findFirst({
            where: { pageId: payload.pageId },
            select: { organizationId: true },
          })
        : null

    const organizationId =
      ad?.organizationId ?? form?.organizationId ?? connectionByPage?.organizationId
    if (!organizationId) {
      throw new Error('no organisation matches this leadgen event (ad/form/page unknown)')
    }

    // Already captured? The webhook can arrive more than once.
    const existing = await this.db.lead.findFirst({
      where: { organizationId, metaLeadId: leadgenId },
      select: { id: true },
    })
    if (existing) return

    const token = await this.resolveToken(organizationId)
    if (!token) throw new Error('organisation has no usable Meta token')

    const detail = await graphGet<{
      field_data?: { name?: string; values?: unknown[] }[]
    }>(
      {
        accessToken: token,
        version: this.env.META_GRAPH_VERSION,
        appSecret: this.env.META_APP_SECRET,
      },
      leadgenId,
      { fields: 'field_data,created_time,ad_id,form_id' },
    )
    const fields = mapLeadFields(detail.field_data)
    const fullName = fields['full_name'] ?? fields['name'] ?? 'Meta lead'
    const [firstName, ...rest] = fullName.trim().split(/\s+/)
    const email = fields['email'] ?? null
    const phone = fields['phone_number'] ?? fields['phone'] ?? null

    // Contact dedupe on (organizationId, email) — the schema enforces it.
    let contactId: string | null = null
    if (email) {
      const found = await this.db.contact.findFirst({
        where: { organizationId, email },
        select: { id: true },
      })
      contactId = found?.id ?? null
    }
    if (!contactId) {
      const contact = await this.db.contact.create({
        data: {
          organizationId,
          firstName: firstName ?? fullName,
          lastName: rest.length > 0 ? rest.join(' ') : null,
          email,
          phone,
          consentSource: 'meta_lead_ad',
          emailOptIn: email !== null,
        },
      })
      contactId = contact.id
    }

    await this.db.lead.create({
      data: {
        organizationId,
        contactId,
        status: 'NEW',
        source: 'META_ADS',
        adId: ad?.id ?? null,
        metaLeadId: leadgenId,
        customFields: fields,
      },
    })

    await this.db.notification
      .create({
        data: {
          organizationId,
          level: 'INFO',
          title: 'New lead from your Meta ad',
          body: `${fullName} just submitted your lead form.`,
          actionUrl: '/app/crm/leads',
        },
      })
      .catch(() => undefined)

    this.logger.info({ eventId, organizationId }, 'meta lead captured')

    // Speed to lead. Deliberately last, and deliberately unable to throw: the
    // lead is already saved, and a WhatsApp outage must not mark the event
    // FAILED and have it retried — a retry would re-message the person.
    await this.autoReply(organizationId, phone, firstName ?? fullName, token)
  }

  /**
   * Send the organisation's approved WhatsApp template to a fresh lead.
   *
   * Every reason to skip is a silent no-op except a genuine send failure, which
   * is logged: switched off, no template configured, no WhatsApp number on the
   * connection, or a phone field that is not a phone number are all normal
   * states, not faults.
   */
  private async autoReply(
    organizationId: string,
    rawPhone: string | null,
    firstName: string,
    token: string,
  ): Promise<void> {
    try {
      const settings = await this.db.organizationSettings.findFirst({
        where: { organizationId },
        select: {
          leadAutoReplyEnabled: true,
          leadAutoReplyTemplate: true,
          leadAutoReplyLanguage: true,
        },
      })
      if (!settings?.leadAutoReplyEnabled) return

      const template = settings.leadAutoReplyTemplate?.trim()
      if (!template) return

      const to = normaliseWhatsAppNumber(rawPhone)
      if (!to) return

      const connection = await this.db.metaConnection.findFirst({
        where: { organizationId },
        select: { phoneNumberId: true },
      })
      if (!connection?.phoneNumberId) return

      await graphPost(
        {
          accessToken: token,
          version: this.env.META_GRAPH_VERSION,
          appSecret: this.env.META_APP_SECRET,
        },
        `${connection.phoneNumberId}/messages`,
        buildTemplateMessage(to, template, settings.leadAutoReplyLanguage ?? 'en_US', [firstName]),
      )

      this.logger.info({ organizationId, template }, 'lead auto-reply sent')
    } catch (err) {
      this.logger.error({ err, organizationId }, 'lead auto-reply failed')
    }
  }

  // ── Ad insights sync ───────────────────────────────────────────────────────

  private async syncInsights(): Promise<void> {
    const connections = await this.db.metaConnection.findMany({
      where: { status: 'CONNECTED' },
      select: { organizationId: true, credentialId: true },
    })
    for (const connection of connections) {
      try {
        await this.syncOrgInsights(connection.organizationId)
      } catch (err) {
        this.logger.error(
          { err, organizationId: connection.organizationId },
          'insights sync failed for organisation',
        )
      }
    }
  }

  private async syncOrgInsights(organizationId: string): Promise<void> {
    const token = await this.resolveToken(organizationId)
    if (!token) return

    const auth = {
      accessToken: token,
      version: this.env.META_GRAPH_VERSION,
      appSecret: this.env.META_APP_SECRET,
    }

    const ads = await this.db.ad.findMany({
      where: { organizationId, metaAdId: { not: null } },
      select: { id: true, campaignId: true, metaAdId: true },
      take: ADS_PER_SYNC,
    })

    for (const ad of ads) {
      if (!ad.metaAdId) continue
      try {
        await this.syncAdInsights(
          organizationId,
          { id: ad.id, campaignId: ad.campaignId, metaAdId: ad.metaAdId },
          auth,
        )
      } catch (err) {
        if (err instanceof MetaApiError && err.isRateLimit) {
          this.logger.warn({ organizationId }, 'meta rate limit hit — deferring rest of sync')
          return
        }
        this.logger.error({ err, adId: ad.id }, 'ad insights sync failed')
      }
    }
  }

  private async syncAdInsights(
    organizationId: string,
    ad: { id: string; campaignId: string; metaAdId: string },
    auth: { accessToken: string; version: string; appSecret?: string | undefined },
  ): Promise<void> {
    interface InsightRow {
      date_start?: string
      impressions?: string
      reach?: string
      clicks?: string
      spend?: string
      age?: string
      gender?: string
      region?: string
      actions?: { action_type?: string; value?: string }[]
    }
    const leadsFrom = (row: InsightRow): number => {
      const action = row.actions?.find((a) => (a.action_type ?? '').includes('lead'))
      return action ? Number(action.value ?? 0) : 0
    }
    const dateFrom = (row: InsightRow): Date | null =>
      row.date_start ? new Date(`${row.date_start}T00:00:00Z`) : null

    // Daily totals for the last week — idempotent upserts on (campaign, ad, day).
    const totals = await graphGet<{ data?: InsightRow[] }>(auth, `${ad.metaAdId}/insights`, {
      fields: 'impressions,reach,clicks,spend,actions',
      date_preset: 'last_7d',
      time_increment: 1,
    })
    for (const row of totals.data ?? []) {
      const date = dateFrom(row)
      if (!date) continue
      const values = {
        organizationId,
        campaignId: ad.campaignId,
        adId: ad.id,
        date,
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        leads: leadsFrom(row),
        spend: row.spend ?? '0',
      }
      await this.db.adInsight.upsert({
        where: { campaignId_adId_date: { campaignId: ad.campaignId, adId: ad.id, date } },
        create: values,
        update: values,
      })
    }

    // Audience breakdowns — who the ad actually reached.
    const dimensions = [
      { breakdown: 'age', dimension: 'AGE' as const, key: 'age' as const },
      { breakdown: 'gender', dimension: 'GENDER' as const, key: 'gender' as const },
      { breakdown: 'region', dimension: 'REGION' as const, key: 'region' as const },
    ]
    for (const dim of dimensions) {
      const broken = await graphGet<{ data?: InsightRow[] }>(auth, `${ad.metaAdId}/insights`, {
        fields: 'impressions,reach,clicks,spend,actions',
        date_preset: 'last_7d',
        time_increment: 1,
        breakdowns: dim.breakdown,
      })
      for (const row of broken.data ?? []) {
        const date = dateFrom(row)
        const value = row[dim.key]
        if (!date || !value) continue
        const values = {
          organizationId,
          campaignId: ad.campaignId,
          adId: ad.id,
          date,
          dimension: dim.dimension,
          value,
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          leads: leadsFrom(row),
          spend: row.spend ?? '0',
        }
        await this.db.adInsightBreakdown.upsert({
          where: {
            campaignId_adId_date_dimension_value: {
              campaignId: ad.campaignId,
              adId: ad.id,
              date,
              dimension: dim.dimension,
              value,
            },
          },
          create: values,
          update: values,
        })
      }
    }
  }

  // ── Shared ─────────────────────────────────────────────────────────────────

  /** Decrypt the org's Meta OAuth token, or null when absent/unreadable. */
  private async resolveToken(organizationId: string): Promise<string | null> {
    const connection = await this.db.metaConnection.findFirst({
      where: { organizationId },
      select: { credentialId: true },
    })
    if (!connection?.credentialId) return null
    const cred = await this.db.providerCredential.findUnique({
      where: { id: connection.credentialId },
      select: { ciphertext: true, iv: true, authTag: true, wrappedKey: true, keyVersion: true },
    })
    if (!cred) return null
    try {
      const opened = openSealed(cred as SealedSecret, this.env.ENCRYPTION_MASTER_KEY)
      const token = opened['accessToken'] ?? opened['token']
      return typeof token === 'string' && token.length > 0 ? token : null
    } catch {
      return null
    }
  }
}

function errMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.slice(0, 500)
}
