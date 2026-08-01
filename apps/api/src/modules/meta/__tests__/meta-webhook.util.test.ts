import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  mapLeadFields,
  parseLeadgenEvents,
  verifyHandshake,
  verifySignature,
} from '../meta-webhook.util.js'

const SECRET = 'app_secret_123'

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
}

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    const body = '{"object":"page"}'
    expect(verifySignature(body, sign(body), SECRET)).toBe(true)
  })
  it('rejects a tampered body', () => {
    const body = '{"object":"page"}'
    expect(verifySignature('{"object":"evil"}', sign(body), SECRET)).toBe(false)
  })
  it('rejects a missing signature', () => {
    expect(verifySignature('x', undefined, SECRET)).toBe(false)
  })
  it('rejects a wrong secret', () => {
    const body = 'hello'
    expect(verifySignature(body, sign(body), 'other_secret')).toBe(false)
  })
})

describe('verifyHandshake', () => {
  it('echoes the challenge when mode + token match', () => {
    expect(
      verifyHandshake(
        { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '42' },
        'tok',
      ),
    ).toBe('42')
  })
  it('rejects a wrong token', () => {
    expect(
      verifyHandshake(
        { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' },
        'tok',
      ),
    ).toBeNull()
  })
  it('rejects a non-subscribe mode', () => {
    expect(
      verifyHandshake({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok' }, 'tok'),
    ).toBeNull()
  })
})

describe('parseLeadgenEvents', () => {
  it('extracts lead submissions from a page payload', () => {
    const events = parseLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: 'page_1',
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: 'lead_9',
                page_id: 'page_1',
                form_id: 'form_2',
                ad_id: 'ad_3',
                created_time: 100,
              },
            },
          ],
        },
      ],
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      leadgenId: 'lead_9',
      pageId: 'page_1',
      formId: 'form_2',
      adId: 'ad_3',
    })
  })

  it('ignores non-leadgen changes and empty payloads', () => {
    expect(
      parseLeadgenEvents({ object: 'page', entry: [{ changes: [{ field: 'feed', value: {} }] }] }),
    ).toHaveLength(0)
    expect(parseLeadgenEvents({})).toHaveLength(0)
    expect(parseLeadgenEvents(null)).toHaveLength(0)
  })
})

describe('mapLeadFields', () => {
  it('flattens Meta field_data into a record', () => {
    const fields = mapLeadFields([
      { name: 'email', values: ['a@b.com'] },
      { name: 'full_name', values: ['Asha'] },
      { name: 'phone_number', values: ['+91999'] },
    ])
    expect(fields).toEqual({ email: 'a@b.com', full_name: 'Asha', phone_number: '+91999' })
  })
  it('tolerates malformed field data', () => {
    expect(mapLeadFields(null)).toEqual({})
    expect(mapLeadFields([{ name: 'x' }])).toEqual({})
  })
})
