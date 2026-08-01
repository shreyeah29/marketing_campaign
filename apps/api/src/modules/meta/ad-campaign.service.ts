import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { assertWithinCap, BudgetError } from './ad-budget.js'

/**
 * The draft-to-approval lifecycle of a Meta ad campaign — everything up to, but
 * not including, publishing (which Phase 3 does for APPROVED campaigns).
 *
 * The whole point is the approval gate: AI drafts a campaign in DRAFT, a human
 * attaches a budget and submits it, and an admin approves it only if the budget is
 * within the client's operator-set ceiling. Nothing here calls Meta or spends
 * money; it governs the decision to.
 */

export interface CreativeInput {
  readonly imageUrl?: string | undefined
  readonly mediaAssetId?: string | undefined
  readonly primaryText?: string | undefined
  readonly headline?: string | undefined
  readonly description?: string | undefined
  readonly callToAction?: string | undefined
  readonly linkUrl?: string | undefined
  readonly leadFormId?: string | undefined
}

export interface CreateCampaignInput {
  readonly name: string
  readonly objective?:
    'LEAD_GENERATION' | 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT' | undefined
  readonly destination?: 'INSTANT_FORM' | 'WHATSAPP' | undefined
  readonly prompt?: string | undefined
  readonly dailyBudget?: number | undefined
  readonly lifetimeBudget?: number | undefined
  readonly creative?: CreativeInput | undefined
}

export interface UpdateCampaignInput {
  readonly name?: string | undefined
  readonly dailyBudget?: number | undefined
  readonly lifetimeBudget?: number | undefined
  readonly creative?: CreativeInput | undefined
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

@Injectable()
export class AdCampaignService {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  /** Create a DRAFT campaign (and its creative) against the org's Meta connection. */
  async create(principal: Principal, input: CreateCampaignInput): Promise<{ id: string }> {
    return withTenantTransaction(this.db, async (tx) => {
      const connection = await tx.metaConnection.findUnique({
        where: { organizationId: principal.organizationId },
      })
      if (!connection || connection.status !== 'CONNECTED') {
        throw new BadRequestException('Connect a Meta account before creating campaigns.')
      }

      const campaign = await tx.adCampaign.create({
        data: {
          organizationId: principal.organizationId,
          connectionId: connection.id,
          name: input.name,
          objective: (input.objective ?? 'LEAD_GENERATION') as never,
          destination: (input.destination ?? 'INSTANT_FORM') as never,
          reviewStatus: 'DRAFT',
          deliveryStatus: 'PAUSED',
          ...(input.dailyBudget !== undefined ? { dailyBudget: input.dailyBudget } : {}),
          ...(input.lifetimeBudget !== undefined ? { lifetimeBudget: input.lifetimeBudget } : {}),
          ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        },
      })

      if (input.creative) {
        await tx.adCreative.create({
          data: {
            organizationId: principal.organizationId,
            campaignId: campaign.id,
            ...cleanCreative(input.creative),
          },
        })
      }

      return { id: campaign.id }
    })
  }

  /** Edit a campaign while it is still a DRAFT (or was rejected). */
  async update(principal: Principal, id: string, input: UpdateCampaignInput): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const campaign = await this.loadEditable(tx, id)

      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.dailyBudget !== undefined ? { dailyBudget: input.dailyBudget } : {}),
          ...(input.lifetimeBudget !== undefined ? { lifetimeBudget: input.lifetimeBudget } : {}),
        },
      })

      if (input.creative) {
        const existing = await tx.adCreative.findFirst({ where: { campaignId: campaign.id } })
        if (existing) {
          await tx.adCreative.update({
            where: { id: existing.id },
            data: cleanCreative(input.creative),
          })
        } else {
          await tx.adCreative.create({
            data: {
              organizationId: principal.organizationId,
              campaignId: campaign.id,
              ...cleanCreative(input.creative),
            },
          })
        }
      }
    })
  }

  /** DRAFT → PENDING_APPROVAL. Requires a creative and a budget to review. */
  async submitForApproval(_principal: Principal, id: string): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const campaign = await this.loadEditable(tx, id)
      const creative = await tx.adCreative.findFirst({ where: { campaignId: campaign.id } })
      if (!creative)
        throw new BadRequestException('Add a creative (poster + copy) before submitting.')
      if (toNum(campaign.dailyBudget) === null && toNum(campaign.lifetimeBudget) === null) {
        throw new BadRequestException('Set a daily or lifetime budget before submitting.')
      }
      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: { reviewStatus: 'PENDING_APPROVAL' },
      })
    })
  }

  /**
   * PENDING_APPROVAL → APPROVED, enforcing the budget cap. This is the money-safety
   * gate: an admin approves, and only within the client's monthly ceiling.
   */
  async approve(principal: Principal, id: string): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.adCampaign.findFirst({
        where: { id, deletedAt: null },
        include: { connection: true },
      })
      if (!campaign) throw new NotFoundException('Campaign not found.')
      if (campaign.reviewStatus !== 'PENDING_APPROVAL') {
        throw new ConflictException('Only a campaign pending approval can be approved.')
      }

      try {
        assertWithinCap({
          dailyBudget: toNum(campaign.dailyBudget),
          lifetimeBudget: toNum(campaign.lifetimeBudget),
          monthlyCap: toNum(campaign.connection.monthlySpendCap),
        })
      } catch (err) {
        if (err instanceof BudgetError) throw new BadRequestException(err.message)
        throw err
      }

      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: {
          reviewStatus: 'APPROVED',
          approvedById: principal.id,
          approvedAt: new Date(),
          rejectedReason: null,
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'ad_campaign.approved',
          resourceType: 'ad_campaign',
          resourceId: campaign.id,
          after: {
            dailyBudget: toNum(campaign.dailyBudget),
            lifetimeBudget: toNum(campaign.lifetimeBudget),
          },
        },
      })
    })
  }

  /** PENDING_APPROVAL → REJECTED with a reason. */
  async reject(_principal: Principal, id: string, reason: string): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const campaign = await tx.adCampaign.findFirst({ where: { id, deletedAt: null } })
      if (!campaign) throw new NotFoundException('Campaign not found.')
      if (campaign.reviewStatus !== 'PENDING_APPROVAL') {
        throw new ConflictException('Only a campaign pending approval can be rejected.')
      }
      await tx.adCampaign.update({
        where: { id: campaign.id },
        data: { reviewStatus: 'REJECTED', rejectedReason: reason },
      })
    })
  }

  async list(_principal: Principal): Promise<unknown[]> {
    return withTenantTransaction(this.db, (tx) =>
      tx.adCampaign.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { creatives: true },
      }),
    )
  }

  async get(_principal: Principal, id: string): Promise<unknown> {
    const campaign = await withTenantTransaction(this.db, (tx) =>
      tx.adCampaign.findFirst({
        where: { id, deletedAt: null },
        include: { creatives: true, adSets: true, ads: true },
      }),
    )
    if (!campaign) throw new NotFoundException('Campaign not found.')
    return campaign
  }

  /** Load a campaign that may still be edited (DRAFT or REJECTED). */
  private async loadEditable(
    tx: Parameters<Parameters<typeof withTenantTransaction>[1]>[0],
    id: string,
  ): Promise<{ id: string; dailyBudget: unknown; lifetimeBudget: unknown }> {
    const campaign = await tx.adCampaign.findFirst({ where: { id, deletedAt: null } })
    if (!campaign) throw new NotFoundException('Campaign not found.')
    if (campaign.reviewStatus === 'APPROVED' || campaign.reviewStatus === 'PENDING_APPROVAL') {
      throw new ConflictException(
        'This campaign can no longer be edited; it is in review or approved.',
      )
    }
    return campaign
  }
}

/** Keep only defined creative fields, so an update never nulls untouched columns. */
function cleanCreative(c: CreativeInput): Record<string, string> {
  const out: Record<string, string> = {}
  if (c.imageUrl !== undefined) out['imageUrl'] = c.imageUrl
  if (c.mediaAssetId !== undefined) out['mediaAssetId'] = c.mediaAssetId
  if (c.primaryText !== undefined) out['primaryText'] = c.primaryText
  if (c.headline !== undefined) out['headline'] = c.headline
  if (c.description !== undefined) out['description'] = c.description
  if (c.callToAction !== undefined) out['callToAction'] = c.callToAction
  if (c.linkUrl !== undefined) out['linkUrl'] = c.linkUrl
  if (c.leadFormId !== undefined) out['leadFormId'] = c.leadFormId
  return out
}
