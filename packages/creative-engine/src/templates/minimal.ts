import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Minimal Skincare" — the quiet one.
 *
 * Structurally the opposite of Tricolour rather than a recolour of it: the
 * product is centred and large, the type is small and set wide, and the offer
 * is a line rather than a shout. Clinical skincare brands do not sell by
 * shouting, and a template library where every entry is the same layout in a
 * different palette is a palette picker pretending to be a template engine.
 *
 * Everything sits on the vertical centre line, which is what makes it hold at
 * 9:16 as well as it does at 1:1.
 */
export const MINIMAL: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Minimal Skincare',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#F4F2ED',
  palette: { ink: '#1A1A18', accent: '#8A7B6B', muted: '#6E6A63' },

  slots: [
    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '10%', y: '7%', w: '80%' },
      style: {
        size: '2.4cqw',
        weight: 400,
        color: '#6E6A63',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 8,
        maxChars: 28,
      },
    },

    // The product occupies the middle third and nothing competes with it.
    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      area: { x: '22%', y: '17%', w: '56%', h: '38%' },
    },

    {
      id: 'productBrand',
      type: 'text',
      z: 2,
      bind: 'product.brand',
      area: { x: '10%', y: '60%', w: '80%' },
      style: {
        size: '2.2cqw',
        weight: 700,
        color: '#8A7B6B',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 5,
        maxChars: 24,
      },
    },
    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '14%', y: '64%', w: '72%' },
      style: { size: '4.4cqw', weight: 400, align: 'center', lineHeight: 1.28, maxChars: 62 },
    },

    {
      id: 'price',
      type: 'price',
      z: 2,
      area: { x: '25%', y: '76%', w: '50%' },
      style: { size: '3.6cqw', weight: 700, align: 'center' },
      mrpStyle: { size: '2.6cqw', weight: 400 },
    },

    // A hairline instead of a band. The offer reads as information, not urgency.
    {
      id: 'rule',
      type: 'shape',
      z: 1,
      fill: '#1A1A18',
      opacity: 0.12,
      area: { x: '38%', y: '84%', w: '24%', h: 2 },
    },
    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '15%', y: '87%', w: '70%' },
      style: {
        size: '2.6cqw',
        weight: 700,
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 4,
        maxChars: 40,
      },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 2,
      bind: 'campaign.couponCode',
      area: { x: '15%', y: '91%', w: '70%' },
      style: {
        size: '2cqw',
        weight: 400,
        color: '#6E6A63',
        align: 'center',
        letterSpacing: 3,
        maxChars: 30,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 2,
      bind: 'brand.disclaimer',
      area: { x: '10%', y: '96%', w: '80%' },
      style: { size: '1.4cqw', weight: 400, color: '#6E6A63', align: 'center', maxChars: 140 },
    },
  ],

  rules: [
    { when: { path: 'campaign.primaryOffer', is: 'empty' }, hide: ['rule'] },
    { when: { path: 'product.name', is: 'empty' }, hide: ['productBrand'] },
  ],
})
