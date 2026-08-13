/**
 * @marketing-os/creative-engine — turning campaign data into finished poster pixels.
 *
 * Deliberately shared rather than app-local: the API renders the authoritative
 * creative and the web app renders the live preview, and both must resolve the
 * same template document identically. Two implementations would drift, and the
 * drift would only show up as a customer's poster differing from the preview
 * they approved.
 *
 * Nothing here calls a model or the network. Generation is expensive and slow;
 * this is the cheap, fast half, and keeping the boundary clean is what makes
 * "edit the price" free.
 */

export {
  ASPECT_RATIOS,
  BINDABLE_PATHS,
  canvasFor,
  parseTemplate,
  slotSchema,
  templateSchema,
  type AspectRatio,
  type BindablePath,
  type Slot,
  type TemplateDocument,
} from './template/schema.js'

export {
  discountPercent,
  formatMoney,
  hiddenSlots,
  resolvePath,
  type CreativeData,
} from './template/bind.js'

export { buildTree } from './render/layout.js'
export { resolveImages, type ResolveImagesOptions } from './render/images.js'
export { loadFonts, resetFontCache, type LoadedFont } from './render/fonts.js'
export { renderAllRatios, renderCreative, renderHash, type RenderResult } from './render/render.js'

export {
  BUILT_IN_TEMPLATES,
  DEFAULT_TEMPLATE_SLUG,
  FESTIVE,
  findTemplate,
  FLASH,
  LUXURY,
  MINIMAL,
  TRICOLOUR,
  type BuiltInTemplate,
} from './templates/index.js'
