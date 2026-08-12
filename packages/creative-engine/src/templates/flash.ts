import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Flash Sale" — the discount is the whole poster.
 *
 * A third structure again: the derived discount is set enormous and sits behind
 * everything, the product is small and offset, and the price pair is the only
 * other thing with any weight. Built for a feed where a creative has about half
 * a second to say one number.
 *
 * It depends on a discount existing. A flash-sale template with no percentage
 * is a blank poster, so the rules substitute the campaign's own offer line when
 * the product cannot produce one — the one case where hiding a slot is not
 * enough and something has to take its place.
 */
export const FLASH: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Flash Sale',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#111114',
  palette: { ink: '#FFFFFF', accent: '#FF3B30', muted: '#9A9AA2' },

  slots: [
    // The number, oversized, behind everything else.
    {
      id: 'discountHuge',
      type: 'text',
      z: 0,
      bind: 'product.discountPercent',
      area: { x: '4%', y: '20%', w: '92%' },
      style: { size: '34cqw', weight: 900, color: '#FF3B30', lineHeight: 0.82, maxChars: 4 },
    },
    {
      id: 'offFlag',
      type: 'text',
      z: 1,
      text: 'OFF',
      area: { x: '4%', y: '52%', w: '40%' },
      style: { size: '9cqw', weight: 900, letterSpacing: 6, maxChars: 6 },
    },

    // Shown instead of the number when no discount can be derived.
    {
      id: 'offerFallback',
      type: 'text',
      z: 1,
      bind: 'campaign.primaryOffer',
      area: { x: '6%', y: '28%', w: '60%' },
      style: {
        size: '11cqw',
        weight: 900,
        color: '#FF3B30',
        transform: 'uppercase',
        lineHeight: 0.96,
        maxChars: 22,
      },
    },

    {
      id: 'campaignTitle',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '6%', y: '8%', w: '60%' },
      style: {
        size: '4cqw',
        weight: 900,
        transform: 'uppercase',
        letterSpacing: 4,
        maxChars: 26,
      },
    },
    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '6%', y: '13.5%', w: '60%' },
      style: {
        size: '2.2cqw',
        weight: 400,
        color: '#9A9AA2',
        transform: 'uppercase',
        letterSpacing: 6,
        maxChars: 28,
      },
    },

    // Small, offset, deliberately not the hero.
    {
      id: 'visual',
      type: 'image',
      z: 3,
      bind: 'visual.url',
      fit: 'contain',
      area: { x: '58%', y: '30%', w: '36%', h: '32%' },
    },

    {
      id: 'productName',
      type: 'text',
      z: 3,
      bind: 'product.name',
      area: { x: '56%', y: '64%', w: '38%' },
      style: { size: '2.6cqw', weight: 400, color: '#9A9AA2', lineHeight: 1.25, maxChars: 52 },
    },
    {
      id: 'price',
      type: 'price',
      z: 3,
      area: { x: '6%', y: '72%', w: '48%' },
      style: { size: '6cqw', weight: 900 },
      mrpStyle: { size: '3.2cqw', weight: 400 },
    },

    {
      id: 'cta',
      type: 'badge',
      z: 4,
      bind: 'campaign.cta',
      fill: '#FF3B30',
      radius: 8,
      area: { x: '6%', y: '84%', w: 345, h: 86 },
      style: {
        size: '3cqw',
        weight: 900,
        align: 'center',
        transform: 'uppercase',
        color: '#FFFFFF',
      },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 4,
      bind: 'campaign.couponCode',
      area: { x: '44%', y: '86%', w: '50%' },
      style: {
        size: '2.8cqw',
        weight: 900,
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 26,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 4,
      bind: 'brand.disclaimer',
      area: { x: '6%', y: '95%', w: '88%' },
      style: { size: '1.4cqw', weight: 400, color: '#9A9AA2', maxChars: 140 },
    },
  ],

  rules: [
    // Exactly one of the two headline treatments shows, whichever the data can
    // actually support.
    { when: { path: 'product.discountPercent', is: 'empty' }, hide: ['discountHuge', 'offFlag'] },
    { when: { path: 'product.discountPercent', is: 'present' }, hide: ['offerFallback'] },
  ],
})
