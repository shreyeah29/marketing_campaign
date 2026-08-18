import { discountPercent, hiddenSlots, resolvePath, type CreativeData } from '../template/bind.js'
import { FONT_FAMILY_STACK } from './fonts.js'
import {
  canvasFor,
  type AspectRatio,
  type Slot,
  type TemplateDocument,
} from '../template/schema.js'

/**
 * Template document → Satori element tree.
 *
 * Satori accepts React-shaped objects, not JSX specifically, so this file builds
 * them directly. That keeps the package free of React entirely — it is a
 * rendering library, and pulling a UI framework in to describe rectangles would
 * be a dependency nobody can later remove.
 *
 * Every slot is absolutely positioned from its declared area. Satori supports a
 * flexbox subset, but absolute positioning is what a *design* template means:
 * the author placed the price there deliberately, and reflowing it would be
 * a different poster.
 */

interface Element {
  type: string
  props: Record<string, unknown>
}

const el = (type: string, props: Record<string, unknown>): Element => ({ type, props })

/** Percentages resolve against the axis they sit on; numbers are base pixels. */
function px(value: string | number, axis: number): number {
  if (typeof value === 'number') return value
  return (Number.parseFloat(value) / 100) * axis
}

/** `cqw` is percent of canvas width — the unit that makes type scale with ratio. */
function fontPx(size: string, width: number): number {
  return (Number.parseFloat(size) / 100) * width
}

function clamp(text: string, max: number | undefined): string {
  if (!max || text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function textStyle(
  style: {
    size: string
    weight: number
    color?: string | undefined
    align: string
    transform: string
    lineHeight: number
    letterSpacing: number
  },
  width: number,
  fallbackColor: string,
): Record<string, unknown> {
  return {
    fontFamily: FONT_FAMILY_STACK,
    fontSize: fontPx(style.size, width),
    fontWeight: style.weight,
    color: style.color ?? fallbackColor,
    textAlign: style.align,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textTransform: style.transform === 'uppercase' ? 'uppercase' : 'none',
    // Satori needs an explicit display on text containers, and without
    // wrapping declared, long product names run off the canvas silently.
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  }
}

function frame(slot: Slot, w: number, h: number): Record<string, unknown> {
  return {
    position: 'absolute',
    left: px(slot.area.x, w),
    top: px(slot.area.y, h),
    width: px(slot.area.w, w),
    ...(slot.area.h !== undefined ? { height: px(slot.area.h, h) } : {}),
  }
}

function renderSlot(
  slot: Slot,
  data: CreativeData,
  w: number,
  h: number,
  ink: string,
): Element | null {
  // A slot whose prerequisite is absent is not drawn at all — see `requires`
  // in the template schema. Checked before the type switch so it applies to
  // every kind, shapes included, which are the ones that cannot self-hide.
  if (slot.requires && !resolvePath(slot.requires, data)) return null

  const box = frame(slot, w, h)

  switch (slot.type) {
    case 'shape':
      return el('div', {
        style: {
          ...box,
          backgroundColor: slot.fill,
          borderRadius: slot.radius,
          opacity: slot.opacity,
        },
      })

    case 'text': {
      const value = slot.bind ? resolvePath(slot.bind, data) : (slot.text ?? null)
      // A bound slot with no value renders nothing at all — not an empty box,
      // which is what a ragged catalogue would otherwise produce.
      if (!value) return null
      return el('div', {
        style: { ...box, ...textStyle(slot.style, w, ink) },
        children: clamp(value, slot.style.maxChars),
      })
    }

    case 'image': {
      const src = resolvePath(slot.bind, data)
      if (!src) return null
      return el('div', {
        style: { ...box, display: 'flex', overflow: 'hidden', borderRadius: slot.radius },
        children: el('img', {
          src,
          style: { width: '100%', height: '100%', objectFit: slot.fit },
        }),
      })
    }

    case 'badge': {
      const value = slot.bind ? resolvePath(slot.bind, data) : (slot.text ?? null)
      if (!value) return null
      return el('div', {
        style: {
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: slot.fill,
          borderRadius: slot.radius,
        },
        children: el('div', {
          style: { ...textStyle(slot.style, w, ink), position: 'relative' },
          children: clamp(value, slot.style.maxChars),
        }),
      })
    }

    case 'price': {
      const sale = resolvePath(slot.saleBind, data)
      const mrp = resolvePath(slot.mrpBind, data)
      if (!sale && !mrp) return null

      // Sale price leads; the MRP follows struck through. When only one price
      // exists it stands alone rather than pretending to be a discount.
      const showMrp = Boolean(mrp && sale && mrp !== sale)
      const mrpSize = slot.mrpStyle?.size ?? slot.style.size
      const children: Element[] = []

      if (sale) {
        children.push(
          el('div', {
            style: { ...textStyle(slot.style, w, ink), position: 'relative' },
            children: sale,
          }),
        )
      }
      if (showMrp && mrp) {
        // `mrpStyle` is a partial override, so every key it omits has to fall
        // back to the main style rather than to undefined — spreading it
        // directly would erase the defaults it did not mention.
        const merged = {
          size: mrpSize,
          weight: slot.mrpStyle?.weight ?? slot.style.weight,
          color: slot.mrpStyle?.color ?? slot.style.color,
          align: slot.mrpStyle?.align ?? slot.style.align,
          transform: slot.mrpStyle?.transform ?? slot.style.transform,
          lineHeight: slot.mrpStyle?.lineHeight ?? slot.style.lineHeight,
          letterSpacing: slot.mrpStyle?.letterSpacing ?? slot.style.letterSpacing,
        }
        children.push(
          el('div', {
            style: {
              ...textStyle(merged, w, ink),
              position: 'relative',
              opacity: 0.6,
              textDecoration: 'line-through',
              marginLeft: fontPx(slot.style.size, w) * 0.35,
            },
            children: mrp,
          }),
        )
      }

      return el('div', {
        style: { ...box, display: 'flex', flexDirection: 'row', alignItems: 'baseline' },
        children,
      })
    }
  }
}

/**
 * Build the full element tree for one ratio.
 *
 * Exported separately from rasterising so a test can assert layout decisions —
 * which slots appeared, where — without producing an image.
 */
export function buildTree(
  template: TemplateDocument,
  data: CreativeData,
  ratio: AspectRatio,
): { element: Element; width: number; height: number } {
  const { width, height } = canvasFor(template, ratio)
  const hidden = hiddenSlots(template, data)
  const ink = template.palette['ink'] ?? '#111111'

  const children = [...template.slots]
    .filter((s) => !hidden.has(s.id))
    .sort((a, b) => a.z - b.z)
    .map((slot) => renderSlot(slot, data, width, height, ink))
    .filter((node): node is Element => node !== null)

  return {
    width,
    height,
    element: el('div', {
      style: {
        width,
        height,
        display: 'flex',
        position: 'relative',
        backgroundColor: template.background,
        fontFamily: FONT_FAMILY_STACK,
      },
      children,
    }),
  }
}

/** Re-exported so callers can compute a discount without importing bind.js. */
export { discountPercent }
