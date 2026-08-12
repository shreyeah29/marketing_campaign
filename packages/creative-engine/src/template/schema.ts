import { z } from 'zod'

/**
 * The design-template document.
 *
 * A template is *data*, not code — stored as JSON, editable by a user, versioned
 * so that editing one cannot change what an already-approved creative renders
 * as. Everything here is therefore validated on write rather than trusted on
 * render: a malformed template must be rejected when it is saved, not discovered
 * when fifty posters come out wrong.
 *
 * Two rules shape the whole design:
 *
 *   1. **No expressions.** `bind` is a path from a fixed whitelist, and `rules`
 *      compare a bound value against a literal. A template is user-supplied
 *      JSON; an expression evaluator over it is a sandbox escape with extra
 *      steps.
 *   2. **Relative geometry.** Positions and sizes are percentages of the canvas
 *      and type is sized in `cqw` (percent of canvas width), so one document
 *      genuinely reflows into 1:1, 4:5 and 9:16 instead of needing three
 *      hand-positioned copies.
 */

/** Aspect ratios a template can be rendered at. */
export const ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

/**
 * Every path a template may read.
 *
 * A whitelist rather than free traversal: without it, a template could bind
 * `organization.apiKeys` and print a secret onto a public poster.
 */
export const BINDABLE_PATHS = [
  'product.name',
  'product.brand',
  'product.description',
  'product.sku',
  'product.mrp',
  'product.salePrice',
  'product.discountPercent',
  'product.currency',
  'product.imageUrl',
  'campaign.name',
  'campaign.theme',
  'campaign.primaryOffer',
  'campaign.secondaryOffer',
  'campaign.couponCode',
  'campaign.cta',
  'brand.displayName',
  'brand.logoUrl',
  'brand.disclaimer',
  'visual.url',
] as const
export type BindablePath = (typeof BINDABLE_PATHS)[number]

const bindablePath = z.enum(BINDABLE_PATHS)

/** A percentage of the canvas ("42%") or an absolute pixel count at base size. */
const dimension = z.union([
  z.string().regex(/^-?\d+(\.\d+)?%$/, 'Use a percentage such as "42%"'),
  z.number(),
])

const area = z.object({
  x: dimension,
  y: dimension,
  w: dimension,
  h: dimension.optional(),
})

/**
 * Type size in `cqw` — percent of canvas width — so headlines scale with the
 * poster instead of staying 48px on a story and a square alike.
 */
const typeSize = z.string().regex(/^\d+(\.\d+)?cqw$/, 'Use a cqw size such as "6.5cqw"')

const textStyle = z.object({
  size: typeSize,
  weight: z.union([z.literal(400), z.literal(700), z.literal(900)]).default(400),
  color: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).default('left'),
  transform: z.enum(['none', 'uppercase']).default('none'),
  lineHeight: z.number().min(0.7).max(2.5).default(1.15),
  letterSpacing: z.number().default(0),
  /** Truncate past this many characters — SVG has no ellipsis of its own. */
  maxChars: z.number().int().positive().optional(),
})

const slotBase = z.object({
  id: z.string().min(1).max(64),
  area,
  /** Draw order. Higher sits on top. */
  z: z.number().int().default(0),
})

const textSlot = slotBase.extend({
  type: z.literal('text'),
  bind: bindablePath.optional(),
  /** Literal text, used when there is no `bind` — labels like "COUPON CODE". */
  text: z.string().max(500).optional(),
  style: textStyle,
})

const imageSlot = slotBase.extend({
  type: z.literal('image'),
  bind: bindablePath,
  fit: z.enum(['contain', 'cover']).default('contain'),
  radius: z.number().min(0).default(0),
})

const shapeSlot = slotBase.extend({
  type: z.literal('shape'),
  fill: z.string(),
  radius: z.number().min(0).default(0),
  opacity: z.number().min(0).max(1).default(1),
})

/**
 * MRP struck through beside the sale price. A dedicated slot rather than two
 * text slots because the strike-through, the ordering and the "hide the MRP when
 * it equals the sale price" rule are pricing semantics, not layout.
 */
const priceSlot = slotBase.extend({
  type: z.literal('price'),
  mrpBind: bindablePath.default('product.mrp'),
  saleBind: bindablePath.default('product.salePrice'),
  style: textStyle,
  mrpStyle: textStyle.partial().optional(),
})

const badgeSlot = slotBase.extend({
  type: z.literal('badge'),
  bind: bindablePath.optional(),
  text: z.string().max(120).optional(),
  fill: z.string(),
  radius: z.number().min(0).default(999),
  style: textStyle,
})

export const slotSchema = z.discriminatedUnion('type', [
  textSlot,
  imageSlot,
  shapeSlot,
  priceSlot,
  badgeSlot,
])
export type Slot = z.infer<typeof slotSchema>

/**
 * Conditional visibility.
 *
 * Real catalogues are ragged: a product with no MRP, a campaign with no coupon.
 * Without rules those slots render as empty boxes, which is worse than an
 * asymmetric layout.
 */
const ruleSchema = z.object({
  when: z.object({
    path: bindablePath,
    is: z.enum(['empty', 'present']),
  }),
  hide: z.array(z.string()).default([]),
})

export const templateSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(120),
  /** Base canvas. Other ratios derive from this width. */
  baseWidth: z.number().int().min(320).max(4096).default(1080),
  ratios: z.array(z.enum(ASPECT_RATIOS)).min(1).default(['1:1']),
  background: z.string().default('#FFFFFF'),
  palette: z.record(z.string()).default({}),
  slots: z.array(slotSchema).min(1),
  rules: z.array(ruleSchema).default([]),
})

export type TemplateDocument = z.infer<typeof templateSchema>

/**
 * Parse and validate. Throws a `ZodError` listing every problem at once, so a
 * template author fixes them in one pass rather than one save at a time.
 */
export function parseTemplate(input: unknown): TemplateDocument {
  return templateSchema.parse(input)
}

/** Pixel dimensions for a ratio at this template's base width. */
export function canvasFor(
  template: TemplateDocument,
  ratio: AspectRatio,
): {
  width: number
  height: number
} {
  const [w, h] = ratio.split(':').map(Number) as [number, number]
  const width = template.baseWidth
  return { width, height: Math.round((width * h) / w) }
}
