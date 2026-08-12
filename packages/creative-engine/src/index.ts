/**
 * @vsp/creative-engine — turning campaign data into finished poster pixels.
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
export { loadFonts, resetFontCache, type LoadedFont } from './render/fonts.js'
export {
  renderAllRatios,
  renderCreative,
  renderHash,
  type RenderOptions,
  type RenderResult,
} from './render/render.js'

export { TRICOLOUR } from './templates/tricolour.js'

import { TRICOLOUR } from './templates/tricolour.js'
import type { TemplateDocument } from './template/schema.js'

/** Templates shipped with the platform, available to every organisation. */
export const BUILT_IN_TEMPLATES: readonly TemplateDocument[] = [TRICOLOUR]
