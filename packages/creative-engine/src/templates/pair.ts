import { parseTemplate, type TemplateDocument } from '../template/schema.js'

/**
 * "Pair" — the layout for a 1+1, built as two things instead of one.
 *
 * Every other template in the library composes around a single product, and a
 * buy-one-get-one offer set into one of them says "1+1" in type over a picture
 * of one item. The claim and the picture disagree, and the picture is what a
 * person reads first.
 *
 * So the structure is genuinely paired: two product frames of equal weight, side
 * by side, with the offer set *between* them where a plus sign would go. The
 * duplication is deliberate — the same product photograph appears twice, because
 * that is what the offer is. There is no second product to bind.
 *
 * Offered at 1:1 and 4:5 only. Two side-by-side frames in a 9:16 become two
 * stamps in a tall empty column, and at 16:9 they leave no room for the type
 * between them.
 */
export const PAIR: TemplateDocument = parseTemplate({
  version: 1,
  name: 'Pair',
  baseWidth: 1080,
  ratios: ['1:1', '4:5'],
  background: '#FBF6EE',
  palette: { ink: '#231A14', accent: '#C2410C', muted: '#8A7A6D' },

  slots: [
    {
      id: 'scene',
      type: 'image',
      z: -2,
      bind: 'scene.url',
      fit: 'cover',
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },
    // A wash over any scene, so the two frames and the type keep a predictable
    // ground. Without it the middle column of a busy photograph swallows the
    // offer, which is the one element that must survive.
    {
      id: 'wash',
      type: 'shape',
      z: -1,
      fill: '#FBF6EE',
      opacity: 0.9,
      area: { x: 0, y: 0, w: '100%', h: '100%' },
    },

    {
      id: 'brand',
      type: 'text',
      z: 2,
      bind: 'brand.displayName',
      area: { x: '8%', y: '7%', w: '84%' },
      style: {
        size: '2.9cqw',
        weight: 700,
        align: 'center',
        transform: 'uppercase',
        letterSpacing: 6,
        color: '#C2410C',
        maxChars: 28,
      },
    },
    {
      id: 'headline',
      type: 'text',
      z: 2,
      bind: 'campaign.name',
      area: { x: '8%', y: '12%', w: '84%' },
      style: { size: '5.6cqw', weight: 900, align: 'center', lineHeight: 1.05, maxChars: 38 },
    },

    // ── The pair ────────────────────────────────────────────────────────────
    // Both plates are absolute on each axis: they are rounded, and a percentage
    // height resolves against a different edge than the width, so a square frame
    // becomes an oblong the moment the ratio changes.
    {
      id: 'leftPlate',
      type: 'shape',
      z: 0,
      requires: 'visual.url',
      fill: '#FFFFFF',
      radius: 20,
      area: { x: '8%', y: '32%', w: 356, h: 356 },
    },
    {
      id: 'leftVisual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      radius: 18,
      area: { x: '9.6%', y: '33.5%', w: 322, h: 322 },
    },
    {
      id: 'rightPlate',
      type: 'shape',
      z: 0,
      requires: 'visual.url',
      fill: '#FFFFFF',
      radius: 20,
      area: { x: '59%', y: '32%', w: 356, h: 356 },
    },
    {
      id: 'rightVisual',
      type: 'image',
      z: 1,
      bind: 'visual.url',
      fit: 'contain',
      radius: 18,
      area: { x: '60.6%', y: '33.5%', w: 322, h: 322 },
    },

    // The offer sits in the gap between the two frames, which is the whole
    // point of the layout: it reads as the operator joining them.
    {
      id: 'offer',
      type: 'badge',
      z: 3,
      bind: 'campaign.primaryOffer',
      fill: '#C2410C',
      radius: 999,
      area: { x: '38%', y: '45%', w: 260, h: 130 },
      style: {
        size: '6cqw',
        weight: 900,
        align: 'center',
        color: '#FFFFFF',
        transform: 'uppercase',
        maxChars: 8,
      },
    },

    {
      id: 'productName',
      type: 'text',
      z: 2,
      bind: 'product.name',
      area: { x: '8%', y: '69%', w: '84%' },
      style: { size: '3.6cqw', weight: 700, align: 'center', lineHeight: 1.2, maxChars: 46 },
    },
    {
      id: 'condition',
      type: 'text',
      z: 2,
      bind: 'campaign.secondaryOffer',
      area: { x: '8%', y: '75%', w: '84%' },
      style: {
        size: '2.8cqw',
        weight: 400,
        align: 'center',
        color: '#8A7A6D',
        lineHeight: 1.35,
        maxChars: 80,
      },
    },
    {
      id: 'price',
      type: 'price',
      z: 2,
      saleBind: 'product.salePrice',
      mrpBind: 'product.mrp',
      area: { x: '8%', y: '81%', w: '84%' },
      style: { size: '4.4cqw', weight: 900, align: 'center' },
      mrpStyle: { size: '2.8cqw', weight: 400, color: '#8A7A6D' },
    },

    {
      id: 'cta',
      type: 'badge',
      z: 2,
      bind: 'campaign.cta',
      fill: '#231A14',
      radius: 999,
      area: { x: '30%', y: '89%', w: 432, h: 68 },
      style: {
        size: '2.9cqw',
        weight: 700,
        align: 'center',
        color: '#FBF6EE',
        transform: 'uppercase',
        letterSpacing: 2,
        maxChars: 22,
      },
    },
    {
      id: 'disclaimer',
      type: 'text',
      z: 2,
      bind: 'brand.disclaimer',
      area: { x: '8%', y: '96%', w: '84%' },
      style: { size: '1.8cqw', weight: 400, align: 'center', color: '#8A7A6D', maxChars: 110 },
    },
  ],
})
