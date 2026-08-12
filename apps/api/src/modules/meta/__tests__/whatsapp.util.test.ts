import { describe, expect, it } from 'vitest'

import {
  buildTemplateMessage,
  buildTextMessage,
  normaliseWhatsAppNumber,
  parseInboundMessages,
} from '../whatsapp.util.js'

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

describe('buildTemplateMessage', () => {
  it('builds a template body with ordered body parameters', () => {
    const body = buildTemplateMessage('919999999999', 'lead_welcome', 'en_US', ['Asha'])
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '919999999999',
      type: 'template',
      template: {
        name: 'lead_welcome',
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Asha' }] }],
      },
    })
  })

  it('omits components when the template takes no parameters', () => {
    // Meta rejects a components array on a template with no placeholders, so
    // "no params" has to mean the key is absent, not present and empty.
    const body = buildTemplateMessage('919999999999', 'lead_welcome', 'en_US')
    expect(body['template']).not.toHaveProperty('components')
  })
})

describe('normaliseWhatsAppNumber', () => {
  it('strips everything that is not a digit', () => {
    expect(normaliseWhatsAppNumber('+91 99084-11129')).toBe('919908411129')
    expect(normaliseWhatsAppNumber('(317) 449-2654 ')).toBe('3174492654')
  })

  it('rejects what cannot be a real number', () => {
    expect(normaliseWhatsAppNumber(null)).toBeNull()
    expect(normaliseWhatsAppNumber('')).toBeNull()
    expect(normaliseWhatsAppNumber('12345')).toBeNull()
    expect(normaliseWhatsAppNumber('n/a')).toBeNull()
    expect(normaliseWhatsAppNumber('1234567890123456')).toBeNull()
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
