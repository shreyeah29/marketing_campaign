import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Story Strip" — built for the vertical, not cropped into it.
 *
 * Every other template is composed for a square and then rendered taller. That
 * works, but a 9:16 story has two properties none of them use: the middle is
 * where a thumb rests, and the top and bottom are covered by the platform's own
 * chrome. So the type is banded into the safe middle third, the photograph fills
 * everything behind it, and nothing important goes within a tenth of either
 * edge.
 *
 * It is offered at 9:16 and 4:5 only. A story layout stretched into a square is
 * a column of text with two empty margins, and offering it there would produce a
 * poster nobody would choose.
 */
export const STORY_STRIP: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Story Strip',
  baseWidth: 1080,
  ratios: ['9:16', '4:5'],
  background: '#0B0B0D',
  palette: { ink: '#FFFFFF', accent: '#D6FF3E', muted: '#A8A8B0' },

  slots: [
    {
      id: 'scene',
      type: 'image',
      z: -2,
      bind: 'scene.url',
      fit: 'cover',
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },
    {
      id: 'photo',
      type: 'image',
      z: -2,
      bind: 'visual.url',
      fit: 'cover',
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },
    // The band. Solid rather than a gradient: type over a photograph needs a
    // predictable ground, and a gradient's midpoint lands differently on every
    // image.
    {
      id: 'band',
      type: 'shape',
      z: -1,
      fill: '#0B0B0D',
      opacity: 0.82,
      area: { x: 0, y: '38%', w: '100%', h: '30%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '8%', y: '41%', w: '84%' },
      style: {
        size: '2.8cqw',
        weight: 700,
        transform: 'uppercase',
        letterSpacing: 6,
        color: '#D6FF3E',
        maxChars: 26,
      },
    },
    {
      id: 'headline',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '8%', y: '45%', w: '84%' },
      style: { size: '7.6cqw', weight: 900, lineHeight: 1.0, maxChars: 32 },
    },
    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '8%', y: '57%', w: '62%' },
      style: { size: '3.4cqw', weight: 400, lineHeight: 1.3, color: '#A8A8B0', maxChars: 80 },
    },
    {
      id: 'price',
      type: 'price',
      z: 2,
      saleBind: 'product.salePrice',
      mrpBind: 'product.mrp',
      area: { x: '8%', y: '62%', w: '50%' },
      style: { size: '5.4cqw', weight: 900 },
      mrpStyle: { size: '3cqw', weight: 400, color: '#A8A8B0' },
    },
    {
      id: 'discountBadge',
      type: 'badge',
      z: 2,
      bind: 'product.discountPercent',
      fill: '#D6FF3E',
      radius: 999,
      area: { x: '72%', y: '57%', w: 216, h: 54 },
      style: {
        size: '3cqw',
        weight: 900,
        align: 'center',
        color: '#0B0B0D',
        maxChars: 6,
      },
    },

    // Low, but clear of the very bottom where the platform puts its own controls.
    {
      id: 'cta',
      type: 'badge',
      z: 2,
      bind: 'campaign.cta',
      fill: '#FFFFFF',
      radius: 999,
      area: { x: '8%', y: '80%', w: 497, h: 65 },
      style: {
        size: '3cqw',
        weight: 700,
        align: 'center',
        color: '#0B0B0D',
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 22,
      },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 2,
      bind: 'campaign.couponCode',
      area: { x: '58%', y: '81%', w: '34%' },
      style: { size: '3cqw', weight: 900, letterSpacing: 3, color: '#D6FF3E', maxChars: 18 },
    },
  ],
})
