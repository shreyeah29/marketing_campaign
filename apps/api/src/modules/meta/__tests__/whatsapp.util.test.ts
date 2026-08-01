import { describe, expect, it } from 'vitest'

import { buildTextMessage, parseInboundMessages } from '../whatsapp.util.js'

describe('buildTextMessage', () => {
  it('builds a Cloud API text message body', () => {
    const body = buildTextMessage('919999999999', 'Hello!')
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '919999999999',
      type: 'text',
      text: { body: 'Hello!' },
    })
  })
})

describe('parseInboundMessages', () => {
  it('extracts a text message with its sender and business number', () => {
    const msgs = parseInboundMessages({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba_1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'pn_1' },
                contacts: [{ profile: { name: 'Asha' }, wa_id: '9199' }],
                messages: [
                  { from: '9199', id: 'wamid.1', type: 'text', text: { body: 'Pricing?' } },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({
      from: '9199',
      text: 'Pricing?',
      messageId: 'wamid.1',
      phoneNumberId: 'pn_1',
      wabaId: 'waba_1',
      contactName: 'Asha',
    })
  })

  it('skips non-text messages and empty payloads', () => {
    const imageOnly = parseInboundMessages({
      entry: [
        {
          changes: [
            { field: 'messages', value: { messages: [{ from: 'x', id: '1', type: 'image' }] } },
          ],
        },
      ],
    })
    expect(imageOnly).toHaveLength(0)
    expect(parseInboundMessages({})).toHaveLength(0)
    expect(parseInboundMessages(null)).toHaveLength(0)
  })
})
