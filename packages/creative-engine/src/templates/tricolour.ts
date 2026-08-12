import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Tricolour Sale" — the first built-in template.
 *
 * Modelled on the beauty-ecommerce sale creative in the brief: product on the
 * left, campaign wordmark and offer stacked on the right, prices above, and a
 * coupon band across the foot.
 *
 * Everything is expressed in percentages and `cqw`, so the same document
 * renders as a square post, a 4:5 feed image and a 9:16 story. The rules at the
 * bottom are what make it survive a real catalogue: a product with no MRP, or a
 * campaign with no coupon, drops those elements instead of leaving a gap where
 * they would have been.
 */
export const TRICOLOUR: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Tricolour Sale',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#0B3D2E',
  palette: { ink: '#FFFFFF', accent: '#E8B33A', muted: '#CFE3D8' },

  slots: [
    // Warm plate behind the product, so a cutout with a soft edge still reads
    // as deliberate rather than as a failed mask.
    {
      id: 'productPlate',
      type: 'shape',
      z: 0,
      fill: '#F6F1E7',
      radius: 28,
      area: { x: '6%', y: '26%', w: '44%', h: '44%' },
    },
    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      radius: 24,
      area: { x: '8%', y: '28%', w: '40%', h: '40%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '54%', y: '8%', w: '40%' },
      style: {
        size: '3.2cqw',
        weight: 700,
        color: '#CFE3D8',
        transform: 'uppercase',
        letterSpacing: 3,
        maxChars: 28,
      },
    },
    {
      id: 'campaignTitle',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '54%', y: '13%', w: '42%' },
      style: {
        size: '7.4cqw',
        weight: 900,
        transform: 'uppercase',
        lineHeight: 1.02,
        maxChars: 24,
      },
    },
    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '54%', y: '30%', w: '42%' },
      style: {
        size: '9cqw',
        weight: 900,
        color: '#E8B33A',
        transform: 'uppercase',
        lineHeight: 1.0,
        maxChars: 18,
      },
    },

    // Prices sit above the product, where the eye lands after the offer.
    {
      id: 'price',
      type: 'price',
      z: 2,
      mrpBind: 'product.mrp',
      saleBind: 'product.salePrice',
      area: { x: '8%', y: '16%', w: '44%' },
      style: { size: '5.4cqw', weight: 900 },
      mrpStyle: { size: '3.4cqw', weight: 400 },
    },
    {
      id: 'discountBadge',
      type: 'badge',
      z: 3,
      bind: 'product.discountPercent',
      fill: '#E8B33A',
      // Pixel height: a percentage would make this circle an ellipse at 9:16.
      area: { x: '40%', y: '24%', w: 140, h: 140 },
      style: { size: '3.4cqw', weight: 900, color: '#0B3D2E', align: 'center' },
    },

    {
      id: 'productBrand',
      type: 'text',
      z: 2,
      bind: 'product.brand',
      area: { x: '54%', y: '55%', w: '40%' },
      style: {
        size: '3cqw',
        weight: 700,
        color: '#E8B33A',
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 24,
      },
    },
    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '54%', y: '60%', w: '40%' },
      style: { size: '3.4cqw', weight: 400, lineHeight: 1.25, maxChars: 60 },
    },

    {
      id: 'cta',
      type: 'badge',
      z: 3,
      bind: 'campaign.cta',
      fill: '#E8B33A',
      radius: 999,
      area: { x: '54%', y: '72%', w: 280, h: 76 },
      style: {
        size: '2.8cqw',
        weight: 900,
        color: '#0B3D2E',
        align: 'center',
        transform: 'uppercase',
      },
    },

    // Coupon band.
    {
      id: 'footerBand',
      type: 'shape',
      z: 4,
      fill: '#08301F',
      area: { x: 0, y: '88%', w: '100%', h: '12%' },
    },
    {
      id: 'secondaryOffer',
      type: 'text',
      z: 5,
      bind: 'campaign.secondaryOffer',
      area: { x: '6%', y: '90.5%', w: '48%' },
      style: { size: '3cqw', weight: 700, transform: 'uppercase', maxChars: 34 },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 5,
      bind: 'campaign.couponCode',
      area: { x: '58%', y: '90.5%', w: '36%' },
      style: {
        size: '3cqw',
        weight: 900,
        color: '#E8B33A',
        align: 'right',
        transform: 'uppercase',
        maxChars: 24,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 5,
      bind: 'brand.disclaimer',
      area: { x: '6%', y: '96%', w: '88%' },
      style: { size: '1.5cqw', weight: 400, color: '#CFE3D8', maxChars: 140 },
    },
  ],

  // Ragged catalogues are the normal case, not the exception.
  rules: [
    { when: { path: 'product.discountPercent', is: 'empty' }, hide: ['discountBadge'] },
    { when: { path: 'campaign.couponCode', is: 'empty' }, hide: ['coupon'] },
    { when: { path: 'visual.url', is: 'empty' }, hide: ['productPlate'] },
    {
      when: { path: 'campaign.secondaryOffer', is: 'empty' },
      hide: ['footerBand', 'secondaryOffer'],
    },
  ],
})
