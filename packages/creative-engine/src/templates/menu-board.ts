import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Menu Board" — the price is the headline.
 *
 * Built for food and drink, where the thing being advertised has a name and a
 * price and both need to be legible at a glance on a phone held at arm's length.
 * The structure is a horizontal band: photograph on the left, a rule, then the
 * name and the price stacked on the right, like a board above a counter.
 *
 * Unlike Flash, which shouts a percentage, this one states a price calmly. A
 * café with a ₹300 latte is not running a discount; it is telling you what the
 * latte costs, and a template that can only express "40% OFF" has nothing to say
 * about that.
 */
export const MENU_BOARD: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Menu Board',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '16:9'],
  background: '#12140F',
  palette: { ink: '#F4F1E7', accent: '#C8A24A', muted: '#8E9182' },

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
      id: 'sceneScrim',
      type: 'shape',
      z: -1,
      fill: '#12140F',
      opacity: 0.78,
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '8%', y: '8%', w: '84%' },
      style: {
        size: '3cqw',
        weight: 700,
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 7,
        color: '#C8A24A',
        maxChars: 28,
      },
    },
    {
      id: 'rule',
      type: 'shape',
      z: 1,
      fill: '#C8A24A',
      opacity: 0.5,
      area: { x: '38%', y: '15%', w: '24%', h: 2 },
    },

    // The dish, in a soft square. Requires the photograph, so a product with no
    // picture gets the type layout alone rather than an empty frame.
    {
      id: 'plate',
      type: 'shape',
      z: 0,
      requires: 'visual.url',
      fill: '#1B1E16',
      radius: 18,
      area: { x: '8%', y: '26%', w: '38%', h: '38%' },
    },
    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'cover',
      radius: 16,
      area: { x: '9%', y: '27%', w: '36%', h: '36%' },
    },

    {
      id: 'headline',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '51%', y: '28%', w: '41%' },
      style: { size: '6.6cqw', weight: 900, lineHeight: 1.04, maxChars: 34 },
    },
    {
      id: 'price',
      type: 'price',
      z: 2,
      saleBind: 'product.salePrice',
      mrpBind: 'product.mrp',
      area: { x: '51%', y: '50%', w: '41%' },
      style: { size: '8cqw', weight: 900, color: '#C8A24A' },
      mrpStyle: { size: '3.6cqw', weight: 400, color: '#8E9182' },
    },

    {
      id: 'campaignName',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '8%', y: '70%', w: '84%' },
      style: {
        size: '2.6cqw',
        weight: 400,
        transform: 'uppercase',
        letterSpacing: 4,
        color: '#8E9182',
        maxChars: 40,
      },
    },
    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '8%', y: '76%', w: '84%' },
      style: { size: '3.6cqw', weight: 400, lineHeight: 1.3, maxChars: 90 },
    },

    {
      id: 'footerBand',
      type: 'shape',
      z: 1,
      fill: '#1B1E16',
      area: { x: 0, y: '88%', w: '100%', h: '12%' },
    },
    {
      id: 'cta',
      type: 'text',
      z: 2,
      bind: 'campaign.cta',
      area: { x: '8%', y: '92%', w: '50%' },
      style: { size: '3cqw', weight: 700, transform: 'uppercase', letterSpacing: 3, maxChars: 26 },
    },
    {
      id: 'coupon',
      type: 'text',
      z: 2,
      bind: 'campaign.couponCode',
      area: { x: '58%', y: '92%', w: '34%' },
      style: {
        size: '3cqw',
        weight: 900,
        align: 'right',
        letterSpacing: 3,
        color: '#C8A24A',
        maxChars: 18,
      },
    },
  ],
})
