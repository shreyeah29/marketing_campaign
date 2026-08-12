import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Luxury Beauty" — restraint, framed.
 *
 * A fourth structure: a thin inset border, the product low and centred against
 * generous space above it, and no discount anywhere. That omission is the
 * design. Prestige beauty does not advertise a percentage off, and a template
 * that renders one on request would be used by mistake.
 *
 * The MRP is not struck through either — the price is stated once, as a fact.
 */
export const LUXURY: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Luxury Beauty',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#0E0E0F',
  palette: { ink: '#F3EFE7', accent: '#C6A664', muted: '#8C8880' },

  slots: [
    // Four hairlines rather than a bordered box: a shape with a border is not
    // in the schema, and four rectangles are honest about what they are.
    {
      id: 'frameTop',
      type: 'shape',
      z: 0,
      fill: '#C6A664',
      opacity: 0.5,
      area: { x: '6%', y: '5%', w: '88%', h: 2 },
    },
    {
      id: 'frameBottom',
      type: 'shape',
      z: 0,
      fill: '#C6A664',
      opacity: 0.5,
      area: { x: '6%', y: '94.8%', w: '88%', h: 2 },
    },
    {
      id: 'frameLeft',
      type: 'shape',
      z: 0,
      fill: '#C6A664',
      opacity: 0.5,
      area: { x: '6%', y: '5%', w: 2, h: '90%' },
    },
    {
      id: 'frameRight',
      type: 'shape',
      z: 0,
      fill: '#C6A664',
      opacity: 0.5,
      area: { x: '93.8%', y: '5%', w: 2, h: '90%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '12%', y: '10%', w: '76%' },
      style: {
        size: '2.6cqw',
        weight: 400,
        color: '#C6A664',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 12,
        maxChars: 24,
      },
    },
    {
      id: 'campaignTitle',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '12%', y: '16%', w: '76%' },
      style: {
        size: '5.6cqw',
        weight: 400,
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 4,
        lineHeight: 1.15,
        maxChars: 30,
      },
    },

    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      area: { x: '27%', y: '30%', w: '46%', h: '34%' },
    },

    {
      id: 'productBrand',
      type: 'text',
      z: 2,
      bind: 'product.brand',
      area: { x: '12%', y: '69%', w: '76%' },
      style: {
        size: '2cqw',
        weight: 700,
        color: '#C6A664',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 6,
        maxChars: 24,
      },
    },
    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '16%', y: '73%', w: '68%' },
      style: { size: '3.4cqw', weight: 400, align: 'center', lineHeight: 1.3, maxChars: 58 },
    },

    // One price, stated. Both binds point at the sale price so the price slot
    // cannot render a strike-through even if an MRP exists on the product.
    {
      id: 'price',
      type: 'price',
      z: 2,
      mrpBind: 'product.salePrice',
      saleBind: 'product.salePrice',
      area: { x: '30%', y: '82%', w: '40%' },
      style: { size: '3cqw', weight: 400, align: 'center', letterSpacing: 2 },
    },

    {
      id: 'cta',
      type: 'text',
      z: 2,
      bind: 'campaign.cta',
      area: { x: '25%', y: '88%', w: '50%' },
      style: {
        size: '2cqw',
        weight: 700,
        color: '#C6A664',
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 6,
        maxChars: 22,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 2,
      bind: 'brand.disclaimer',
      area: { x: '12%', y: '97%', w: '76%' },
      style: { size: '1.3cqw', weight: 400, color: '#8C8880', align: 'center', maxChars: 130 },
    },
  ],

  rules: [{ when: { path: 'brand.displayName', is: 'empty' }, hide: ['brand'] }],
})
