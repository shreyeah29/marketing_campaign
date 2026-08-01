/**
 * Pure Meta Marketing API payload builders.
 *
 * Publishing an approved campaign means creating four Meta objects — Campaign, Ad
 * Set, Ad Creative, Ad — each with a fiddly, easy-to-get-wrong request shape. The
 * mapping from our domain to those shapes lives here as pure functions so the parts
 * that actually matter (objective mapping, budget-unit conversion, the Instant-Form
 * vs Click-to-WhatsApp branch) are unit-tested without any network.
 */

export type AdObjective = 'LEAD_GENERATION' | 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT'
export type AdDestination = 'INSTANT_FORM' | 'WHATSAPP'

/** Map our objective to Meta's Outcome-Driven-Ad-Experience objective. */
export function metaObjective(objective: AdObjective): string {
  switch (objective) {
    case 'LEAD_GENERATION':
      return 'OUTCOME_LEADS'
    case 'CONVERSIONS':
      return 'OUTCOME_SALES'
    case 'TRAFFIC':
      return 'OUTCOME_TRAFFIC'
    case 'AWARENESS':
      return 'OUTCOME_AWARENESS'
    case 'ENGAGEMENT':
      return 'OUTCOME_ENGAGEMENT'
  }
}

/** Meta budgets are in the account currency's minor unit (paise / cents). */
export function toMinorUnits(major: number): number {
  return Math.round(major * 100)
}

export function buildCampaignPayload(input: {
  name: string
  objective: AdObjective
}): Record<string, string> {
  return {
    name: input.name,
    objective: metaObjective(input.objective),
    // Always created paused; the ad only serves once we explicitly activate it.
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
  }
}

export function buildAdSetPayload(input: {
  name: string
  campaignId: string
  pageId: string
  destination: AdDestination
  dailyBudget?: number | null
  lifetimeBudget?: number | null
  targeting?: Record<string, unknown> | null
}): Record<string, string> {
  const payload: Record<string, string> = {
    name: input.name,
    campaign_id: input.campaignId,
    billing_event: 'IMPRESSIONS',
    status: 'PAUSED',
    // A sensible default audience; the real targeting spec overrides it.
    targeting: JSON.stringify(input.targeting ?? { geo_locations: { countries: ['IN'] } }),
    promoted_object: JSON.stringify({ page_id: input.pageId }),
  }

  if (input.lifetimeBudget && input.lifetimeBudget > 0) {
    payload['lifetime_budget'] = String(toMinorUnits(input.lifetimeBudget))
  } else if (input.dailyBudget && input.dailyBudget > 0) {
    payload['daily_budget'] = String(toMinorUnits(input.dailyBudget))
  }

  if (input.destination === 'WHATSAPP') {
    // Click-to-WhatsApp: the ad drives into a WhatsApp conversation.
    payload['destination_type'] = 'WHATSAPP'
    payload['optimization_goal'] = 'CONVERSATIONS'
  } else {
    // Instant Form: native lead capture.
    payload['optimization_goal'] = 'LEAD_GENERATION'
  }

  return payload
}

export function buildCreativePayload(input: {
  name: string
  pageId: string
  igUserId?: string | null
  message: string
  imageUrl?: string | null
  headline?: string | null
  description?: string | null
  callToAction?: string | null
  destination: AdDestination
  leadFormId?: string | null
  linkUrl?: string | null
  phoneNumber?: string | null
}): Record<string, string> {
  const linkData: Record<string, unknown> = {
    message: input.message,
    ...(input.imageUrl ? { picture: input.imageUrl } : {}),
    ...(input.headline ? { name: input.headline } : {}),
    ...(input.description ? { description: input.description } : {}),
  }

  if (input.destination === 'WHATSAPP') {
    // The CTA opens a WhatsApp chat with the business number.
    linkData['link'] = input.phoneNumber
      ? `https://wa.me/${input.phoneNumber.replace(/[^0-9]/g, '')}`
      : (input.linkUrl ?? 'https://wa.me/')
    linkData['call_to_action'] = { type: 'WHATSAPP_MESSAGE' }
  } else {
    // Instant Form: the CTA opens the native lead form.
    linkData['link'] = input.linkUrl ?? `https://fb.com/${input.pageId}`
    linkData['call_to_action'] = {
      type: input.callToAction ?? 'SIGN_UP',
      ...(input.leadFormId ? { value: { lead_gen_form_id: input.leadFormId } } : {}),
    }
  }

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    ...(input.igUserId ? { instagram_actor_id: input.igUserId } : {}),
    link_data: linkData,
  }

  return {
    name: input.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  }
}

export function buildAdPayload(input: {
  name: string
  adSetId: string
  creativeId: string
}): Record<string, string> {
  return {
    name: input.name,
    adset_id: input.adSetId,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    status: 'PAUSED',
  }
}
