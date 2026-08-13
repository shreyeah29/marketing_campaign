import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { MetaConnectService, type ResolvedMetaConnection } from './meta-connect.service.js'
import { MetaGraphClient } from './meta-graph.client.js'
import {
  buildAdPayload,
  buildAdSetPayload,
  buildCampaignPayload,
  buildCreativePayload,
  type AdDestination,
  type AdObjective,
} from './ad-publish.payloads.js'

/**
 * Publishing an APPROVED campaign to Meta: create the Campaign → Ad Set → Creative
 * → Ad chain via the Marketing API, store each returned id, and leave everything
 * PAUSED until an explicit activation. This is the only place in the engine that
 * causes an ad to exist on Meta — and, once activated, to spend.
 *
 * Network calls happen outside any DB transaction; the ids are persisted after.
 */
@Injectable()
export class AdPublishService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(MetaConnectService) private readonly connect: MetaConnectService,
  ) {}

  async publish(principal: Principal, campaignId: string): Promise<{ metaCampaignId: string }> {
    // 1. Load + guard (read-only).
    const campaign = await withTenantTransaction(this.db, (tx) =>
      tx.adCampaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        include: { creatives: true },
      }),
    )
    if (!campaign) throw new NotFoundException('Campaign not found.')
    if (campaign.reviewStatus !== 'APPROVED') {
      throw new ConflictException('Only an approved campaign can be published.')
    }
    if (campaign.metaCampaignId) {
      throw new ConflictException('This campaign has already been published.')
    }
    const creative = campaign.creatives[0]
    if (!creative) throw new BadRequestException('The campaign has no creative to publish.')

    // 2. Resolve the client's connection + token.
    const conn = await this.connect.resolve(principal)
    if (!conn) throw new BadRequestException('Meta is not connected for this organisation.')
    if (!conn.adAccountId || !conn.pageId) {
      throw new BadRequestException('Select an ad account and Page before publishing.')
    }

    const graph = new MetaGraphClient({
      accessToken: conn.accessToken,
      version: conn.version,
      appSecret: conn.appSecret,
    })
    const destination = campaign.destination as AdDestination

    // 3. Ensure a Meta lead form exists for Instant-Form campaigns.
    const leadFormId =
      destination === 'INSTANT_FORM'
        ? await this.ensureLeadForm(graph, conn, principal, creative.leadFormId)
        : null

    // 4. Create the Meta object chain.
    const metaCampaign = await graph.post<{ id: string }>(`${conn.adAccountId}/campaigns`, {
      params: buildCampaignPayload({
        name: campaign.name,
        objective: campaign.objective as AdObjective,
      }),
    })

    const metaAdSet = await graph.post<{ id: string }>(`${conn.adAccountId}/adsets`, {
      params: buildAdSetPayload({
        name: `${campaign.name} — set`,
        campaignId: metaCampaign.id,
        pageId: conn.pageId,
        destination,
        dailyBudget: toNum(campaign.dailyBudget),
        lifetimeBudget: toNum(campaign.lifetimeBudget),
      }),
    })

    const metaCreative = await graph.post<{ id: string }>(`${conn.adAccountId}/adcreatives`, {
      params: buildCreativePayload({
        name: `${campaign.name} — creative`,
        pageId: conn.pageId,
        igUserId: conn.igUserId,
        message: creative.primaryText ?? campaign.name,
        imageUrl: creative.imageUrl,
        headline: creative.headline,
        description: creative.description,
        callToAction: creative.callToAction,
        destination,
        leadFormId,
        linkUrl: creative.linkUrl,
        phoneNumber: conn.phoneNumberId,
      }),
    })

    const metaAd = await graph.post<{ id: string }>(`${conn.adAccountId}/ads`, {
      params: buildAdPayload({
        name: campaign.name,
        adSetId: metaAdSet.id,
        creativeId: metaCreative.id,
      }),
    })

    // 5. Persist the ids (write).
    await withTenantTransaction(this.db, async (tx) => {
      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: { metaCampaignId: metaCampaign.id, deliveryStatus: 'PAUSED' },
      })
      const adSet = await tx.adSet.create({
        data: {
          organizationId: principal.organizationId,
          campaignId: campaign.id,
          name: `${campaign.name} — set`,
          metaAdSetId: metaAdSet.id,
          ...(toNum(campaign.dailyBudget) !== null
            ? { dailyBudget: toNum(campaign.dailyBudget)! }
            : {}),
          ...(toNum(campaign.lifetimeBudget) !== null
            ? { lifetimeBudget: toNum(campaign.lifetimeBudget)! }
            : {}),
        },
      })
      await tx.adCreative.update({
        where: { id: creative.id },
        data: { metaCreativeId: metaCreative.id },
      })
      await tx.ad.create({
        data: {
          organizationId: principal.organizationId,
          campaignId: campaign.id,
          adSetId: adSet.id,
          creativeId: creative.id,
          name: campaign.name,
          metaAdId: metaAd.id,
          deliveryStatus: 'PAUSED',
        },
      })
    })

    return { metaCampaignId: metaCampaign.id }
  }

  /** Flip a published campaign live on Meta (this is what starts real spend). */
  async setStatus(
    principal: Principal,
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED',
  ): Promise<void> {
    const campaign = await withTenantTransaction(this.db, (tx) =>
      tx.adCampaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        include: { ads: true },
      }),
    )
    if (!campaign) throw new NotFoundException('Campaign not found.')
    if (!campaign.metaCampaignId)
      throw new ConflictException('Publish the campaign before changing its status.')

    const conn = await this.connect.resolve(principal)
    if (!conn) throw new BadRequestException('Meta is not connected for this organisation.')
    const graph = new MetaGraphClient({
      accessToken: conn.accessToken,
      version: conn.version,
      appSecret: conn.appSecret,
    })

    // Set the campaign and each ad to the requested status.
    await graph.post(campaign.metaCampaignId, { params: { status } })
    for (const ad of campaign.ads) {
      if (ad.metaAdId) await graph.post(ad.metaAdId, { params: { status } })
    }

    const delivery = status === 'ACTIVE' ? 'PENDING_META_REVIEW' : 'PAUSED'
    await withTenantTransaction(this.db, async (tx) => {
      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: { deliveryStatus: delivery as never },
      })
      await tx.ad.updateMany({
        where: { campaignId: campaign.id },
        data: { deliveryStatus: delivery as never },
      })
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: status === 'ACTIVE' ? 'ad_campaign.activated' : 'ad_campaign.paused',
          resourceType: 'ad_campaign',
          resourceId: campaign.id,
        },
      })
    })
  }

  /**
   * Resolve the Meta lead-form id for an Instant-Form campaign, creating the form
   * on the client's Page from our stored questions when it doesn't exist yet.
   */
  private async ensureLeadForm(
    graph: MetaGraphClient,
    conn: ResolvedMetaConnection,
    principal: Principal,
    leadFormRef: string | null,
  ): Promise<string | null> {
    if (!leadFormRef) return null

    const form = await withTenantTransaction(this.db, (tx) =>
      tx.metaLeadForm.findFirst({ where: { id: leadFormRef } }),
    )
    // Not one of ours — assume the caller passed a raw Meta form id.
    if (!form) return leadFormRef
    if (form.metaFormId) return form.metaFormId

    const questions = Array.isArray(form.questions) ? form.questions : []
    const created = await graph.post<{ id: string }>(`${conn.pageId}/leadgen_forms`, {
      json: {
        name: form.name,
        questions:
          questions.length > 0
            ? questions
            : [{ type: 'FULL_NAME' }, { type: 'EMAIL' }, { type: 'PHONE' }],
        ...(form.privacyPolicyUrl ? { privacy_policy: { url: form.privacyPolicyUrl } } : {}),
      },
    })
    await withTenantTransaction(this.db, (tx) =>
      tx.metaLeadForm.update({ where: { id: form.id }, data: { metaFormId: created.id } }),
    )
    void principal
    return created.id
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}
