import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Festive Sale" — warm, stacked, and built for a portrait feed.
 *
 * The fifth structure: everything on one vertical axis, product in a rounded
 * medallion, the offer directly beneath it, and a deep footer carrying the
 * coupon. Where Tricolour splits left/right and Flash goes diagonal, this one
 * reads straight down, which is the arrangement that survives a 9:16 story
 * without any element drifting off the safe area.
 */
export const FESTIVE: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Festive Sale',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#5B1220',
  palette: { ink: '#FFF6E8', accent: '#F2C14E', muted: '#D9A9A9' },

  slots: [
    // ── The AI scene ────────────────────────────────────────────────────
    // A generated *background* only; the product is the real photograph,
    // composited above. Full-bleed and behind everything, with a scrim over it.
    {
      id: 'scene',
      type: 'image',
      z: -2,
      bind: 'scene.url',
      fit: 'cover',
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },
    // Text on this template is light, and a generated scene can be any
    // brightness. The scrim is what keeps a price legible over a photograph we
    // have not seen; without it, contrast is a coin toss taken at publish time.
    {
      id: 'sceneScrim',
      type: 'shape',
      z: -1,
      fill: '#5B1220',
      opacity: 0.62,
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },
    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '8%', y: '6%', w: '84%' },
      style: {
        size: '2.4cqw',
        weight: 700,
        color: '#F2C14E',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 8,
        maxChars: 26,
      },
    },
    {
      id: 'campaignTitle',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '8%', y: '11%', w: '84%' },
      style: {
        size: '7cqw',
        weight: 900,
        align: 'center',
        transform: 'uppercase',
        lineHeight: 1.05,
        maxChars: 26,
      },
    },

    // Sized in pixels, not percentages. A percentage height is a share of a
    // canvas that changes with the ratio, so `w: 50%, h: 50%` is a circle at
    // 1:1 and an ellipse at 9:16. Anything that must keep its shape is absolute.
    {
      id: 'medallion',
      type: 'shape',
      z: 0,
      fill: '#FFF6E8',
      radius: 999,
      area: { x: '25%', y: '19%', w: 420, h: 420 },
    },
    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      area: { x: '30%', y: '22%', w: 330, h: 330 },
    },

    {
      id: 'discountBadge',
      type: 'badge',
      z: 3,
      bind: 'product.discountPercent',
      fill: '#F2C14E',
      area: { x: '66%', y: '22%', w: 170, h: 170 },
      style: { size: '4cqw', weight: 900, color: '#5B1220', align: 'center' },
    },

    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '8%', y: '61%', w: '84%' },
      style: {
        size: '7cqw',
        weight: 900,
        color: '#F2C14E',
        align: 'center',
        transform: 'uppercase',
        lineHeight: 1.0,
        maxChars: 20,
      },
    },

    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '14%', y: '71%', w: '72%' },
      style: { size: '2.8cqw', weight: 400, align: 'center', lineHeight: 1.25, maxChars: 56 },
    },
    {
      id: 'price',
      type: 'price',
      z: 2,
      area: { x: '30%', y: '79.5%', w: '40%' },
      style: { size: '4.2cqw', weight: 900, align: 'center' },
      mrpStyle: { size: '2.8cqw', weight: 400 },
    },

    {
      id: 'footerBand',
      type: 'shape',
      z: 4,
      fill: '#430C17',
      area: { x: 0, y: '86%', w: '100%', h: '14%' },
    },
    {
      id: 'cta',
      type: 'text',
      z: 5,
      bind: 'campaign.cta',
      area: { x: '6%', y: '89%', w: '42%' },
      style: {
        size: '3cqw',
        weight: 900,
        color: '#F2C14E',
        transform: 'uppercase',
        letterSpacing: 3,
        maxChars: 22,
      },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 5,
      bind: 'campaign.couponCode',
      area: { x: '52%', y: '89%', w: '42%' },
      style: {
        size: '3cqw',
        weight: 900,
        align: 'right',
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 24,
      },
    },
    {
      id: 'secondaryOffer',
      type: 'text',
      z: 5,
      bind: 'campaign.secondaryOffer',
      area: { x: '6%', y: '94%', w: '88%' },
      style: { size: '2cqw', weight: 400, color: '#D9A9A9', maxChars: 60 },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 5,
      bind: 'brand.disclaimer',
      area: { x: '6%', y: '97.5%', w: '88%' },
      style: { size: '1.3cqw', weight: 400, color: '#D9A9A9', maxChars: 130 },
    },
  ],

  rules: [
    { when: { path: 'scene.url', is: 'empty' }, hide: ['scene', 'sceneScrim'] },
    { when: { path: 'product.discountPercent', is: 'empty' }, hide: ['discountBadge'] },
    { when: { path: 'visual.url', is: 'empty' }, hide: ['medallion'] },
  ],
})
