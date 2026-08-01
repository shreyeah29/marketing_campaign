import { describe, expect, it } from 'vitest'

import {
  buildAdSetPayload,
  buildCampaignPayload,
  buildCreativePayload,
  metaObjective,
  toMinorUnits,
} from '../ad-publish.payloads.js'

describe('metaObjective', () => {
  it('maps lead generation to the OUTCOME_LEADS objective', () => {
    expect(metaObjective('LEAD_GENERATION')).toBe('OUTCOME_LEADS')
    expect(metaObjective('TRAFFIC')).toBe('OUTCOME_TRAFFIC')
  })
})

describe('toMinorUnits', () => {
  it('converts major currency to Meta minor units', () => {
    expect(toMinorUnits(500)).toBe(50000)
    expect(toMinorUnits(1.5)).toBe(150)
  })
})

describe('buildCampaignPayload', () => {
  it('always starts paused with the mapped objective', () => {
    const p = buildCampaignPayload({ name: 'Launch', objective: 'LEAD_GENERATION' })
    expect(p.objective).toBe('OUTCOME_LEADS')
    expect(p.status).toBe('PAUSED')
  })
})

describe('buildAdSetPayload', () => {
  it('converts the daily budget to minor units and sets lead-gen optimisation', () => {
    const p = buildAdSetPayload({
      name: 'Set',
      campaignId: 'c1',
      pageId: 'p1',
      destination: 'INSTANT_FORM',
      dailyBudget: 300,
    })
    expect(p.daily_budget).toBe('30000')
    expect(p.optimization_goal).toBe('LEAD_GENERATION')
    expect(p.destination_type).toBeUndefined()
    expect(JSON.parse(p.promoted_object!)).toEqual({ page_id: 'p1' })
  })

  it('prefers a lifetime budget over daily when both are present', () => {
    const p = buildAdSetPayload({
      name: 'Set',
      campaignId: 'c1',
      pageId: 'p1',
      destination: 'INSTANT_FORM',
      dailyBudget: 300,
      lifetimeBudget: 5000,
    })
    expect(p.lifetime_budget).toBe('500000')
    expect(p.daily_budget).toBeUndefined()
  })

  it('sets the WhatsApp destination for click-to-WhatsApp ad sets', () => {
    const p = buildAdSetPayload({
      name: 'Set',
      campaignId: 'c1',
      pageId: 'p1',
      destination: 'WHATSAPP',
      dailyBudget: 300,
    })
    expect(p.destination_type).toBe('WHATSAPP')
    expect(p.optimization_goal).toBe('CONVERSATIONS')
  })
})

describe('buildCreativePayload', () => {
  it('attaches the lead form as the CTA for Instant-Form ads', () => {
    const p = buildCreativePayload({
      name: 'Creative',
      pageId: 'p1',
      message: 'Buy our sweets',
      destination: 'INSTANT_FORM',
      leadFormId: 'form_9',
      imageUrl: 'https://cdn/x.jpg',
      igUserId: 'ig_1',
    })
    const spec = JSON.parse(p.object_story_spec!)
    expect(spec.page_id).toBe('p1')
    expect(spec.instagram_actor_id).toBe('ig_1')
    expect(spec.link_data.picture).toBe('https://cdn/x.jpg')
    expect(spec.link_data.call_to_action.value.lead_gen_form_id).toBe('form_9')
  })

  it('builds a wa.me link + WhatsApp CTA for click-to-WhatsApp ads', () => {
    const p = buildCreativePayload({
      name: 'Creative',
      pageId: 'p1',
      message: 'Chat with us',
      destination: 'WHATSAPP',
      phoneNumber: '+91 84443 22224',
    })
    const spec = JSON.parse(p.object_story_spec!)
    expect(spec.link_data.link).toBe('https://wa.me/918444322224')
    expect(spec.link_data.call_to_action.type).toBe('WHATSAPP_MESSAGE')
  })
})
