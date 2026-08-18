import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Editorial" — the magazine page.
 *
 * A structure none of the others use: the photograph is bled to the full frame
 * and the type sits *on* it in a single left column, the way a cover does. There
 * is no plate, no card and no panel; the only device is a soft scrim so white
 * type survives a bright photograph.
 *
 * This is the template for a good product shot. The others compose around a
 * cutout on a coloured ground, which is right when the photograph is a packshot
 * on white and wrong when it is a real scene — cropping a café table into a 40%
 * box throws away the thing that made it worth shooting.
 */
export const EDITORIAL: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Editorial',
  baseWidth: 1080,
  ratios: ['1:1', '4:5', '9:16', '16:9'],
  background: '#0E0E10',
  palette: { ink: '#FFFFFF', accent: '#E8E4DA', muted: '#B9B4A8' },

  slots: [
    // The photograph, edge to edge. Scene first, product photo as the fallback,
    // so a product shot fills the frame and a template-only render still works.
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
    // A scrim over the lower two thirds only: enough for type to hold, little
    // enough that the photograph is still the poster.
    {
      id: 'scrim',
      type: 'shape',
      z: -1,
      fill: '#000000',
      opacity: 0.42,
      area: { x: 0, y: '34%', w: '100%', h: '66%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '7%', y: '7%', w: '60%' },
      style: {
        size: '3.2cqw',
        weight: 700,
        transform: 'uppercase',
        letterSpacing: 5,
        maxChars: 26,
      },
    },

    {
      id: 'headline',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '7%', y: '52%', w: '74%' },
      style: { size: '9cqw', weight: 900, lineHeight: 0.98, maxChars: 30 },
    },
    {
      id: 'campaignName',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '7%', y: '46%', w: '74%' },
      style: {
        size: '3cqw',
        weight: 400,
        transform: 'uppercase',
        letterSpacing: 4,
        color: '#B9B4A8',
        maxChars: 34,
      },
    },
    {
      id: 'primaryOffer',
      type: 'text',
      z: 2,
      bind: 'campaign.primaryOffer',
      area: { x: '7%', y: '74%', w: '58%' },
      style: { size: '4cqw', weight: 400, lineHeight: 1.25, color: '#E8E4DA', maxChars: 76 },
    },

    // Price bottom-right, away from the headline, so the two never fight.
    {
      id: 'price',
      type: 'price',
      z: 2,
      saleBind: 'product.salePrice',
      mrpBind: 'product.mrp',
      area: { x: '62%', y: '86%', w: '31%' },
      style: { size: '6.4cqw', weight: 900, align: 'right' },
      mrpStyle: { size: '3.4cqw', weight: 400, color: '#B9B4A8' },
    },
    {
      id: 'cta',
      type: 'badge',
      z: 2,
      bind: 'campaign.cta',
      fill: '#FFFFFF',
      radius: 40,
      // Absolute on both axes: a percentage height resolves against a
      // different edge than the width, so the pill becomes an ellipse the
      // moment the ratio changes.
      area: { x: '7%', y: '86%', w: 346, h: 76 },
      style: {
        size: '3cqw',
        weight: 700,
        align: 'center',
        color: '#111114',
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 20,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 2,
      bind: 'brand.disclaimer',
      area: { x: '7%', y: '95%', w: '86%' },
      style: { size: '1.9cqw', weight: 400, color: '#B9B4A8', maxChars: 120 },
    },
  ],
})
