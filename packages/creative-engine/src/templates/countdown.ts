import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Countdown" — for an offer whose deadline is the argument.
 *
 * A limited-time sale and a permanent discount are different claims, and the
 * library could only express the second. Flash shouts a percentage; Tricolour
 * states an offer; neither has anywhere to put "ends Sunday", so the deadline
 * ended up appended to a caption where it does no work at all.
 *
 * Here the window is structural: a dark band across the top holds it at the size
 * of a headline, above the offer rather than beneath it. Someone scrolling reads
 * the deadline first and the discount second, which is the correct order for an
 * offer that is only interesting because it is about to stop.
 *
 * The band binds to `campaign.theme` — the field that already carries "9th–19th
 * August" — falling back to nothing rather than inventing urgency. A countdown
 * template that manufactures a deadline is a template that lies.
 */
export const COUNTDOWN: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Countdown',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16'],
  background: '#0F1115',
  palette: { ink: '#F5F3EF', accent: '#FACC15', muted: '#9BA1AC' },

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
      id: 'scrim',
      type: 'shape',
      z: -1,
      fill: '#0F1115',
      opacity: 0.72,
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },

    // ── The deadline band, first thing read ─────────────────────────────────
    {
      id: 'band',
      type: 'shape',
      z: 0,
      fill: '#FACC15',
      area: { x: 0, y: '6%', w: '100%', h: '11%' },
    },
    {
      id: 'window',
      type: 'text',
      z: 2,
      bind: 'campaign.theme',
      area: { x: '6%', y: '9%', w: '88%' },
      style: {
        size: '4.2cqw',
        weight: 900,
        align: 'center',
        color: '#0F1115',
        transform: 'uppercase',
        letterSpacing: 3,
        maxChars: 34,
      },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '6%', y: '1.5%', w: '88%' },
      style: {
        size: '2.6cqw',
        weight: 700,
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 7,
        color: '#9BA1AC',
        maxChars: 28,
      },
    },

    {
      id: 'offer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '6%', y: '22%', w: '88%' },
      style: { size: '9.5cqw', weight: 900, align: 'center', lineHeight: 0.98, maxChars: 26 },
    },
    {
      id: 'secondaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.secondaryOffer',
      area: { x: '6%', y: '35%', w: '88%' },
      style: {
        size: '3cqw',
        weight: 400,
        align: 'center',
        color: '#9BA1AC',
        lineHeight: 1.3,
        maxChars: 78,
      },
    },

    // Centred and absolute on both axes — rounded, so a percentage height would
    // resolve against the other edge and turn the circle into an ellipse.
    {
      id: 'plate',
      type: 'shape',
      z: 0,
      requires: 'visual.url',
      fill: '#1A1D24',
      radius: 999,
      area: { x: '25%', y: '43%', w: 540, h: 540 },
    },
    {
      id: 'visual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      area: { x: '28%', y: '46%', w: 476, h: 476 },
    },

    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '6%', y: '79%', w: '88%' },
      style: { size: '3.4cqw', weight: 700, align: 'center', lineHeight: 1.18, maxChars: 44 },
    },
    {
      id: 'price',
      type: 'price',
      z: 2,
      saleBind: 'product.salePrice',
      mrpBind: 'product.mrp',
      area: { x: '6%', y: '84.5%', w: '88%' },
      style: { size: '4.6cqw', weight: 900, align: 'center', color: '#FACC15' },
      mrpStyle: { size: '2.8cqw', weight: 400, color: '#9BA1AC' },
    },

    {
      id: 'cta',
      type: 'badge',
      z: 2,
      bind: 'campaign.cta',
      fill: '#FACC15',
      radius: 999,
      area: { x: '28%', y: '91%', w: 464, h: 66 },
      style: {
        size: '2.9cqw',
        weight: 900,
        align: 'center',
        color: '#0F1115',
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
      area: { x: '6%', y: '97%', w: '88%' },
      style: {
        size: '2.2cqw',
        weight: 900,
        align: 'center',
        letterSpacing: 4,
        color: '#9BA1AC',
        maxChars: 20,
      },
    },
  ],
})
