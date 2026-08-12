import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

/**
 * Fonts, loaded from a package rather than the host.
 *
 * This is the whole reason Satori was chosen over an SVG-and-system-fonts
 * approach. Rasterising SVG text depends on whatever fonts the container
 * happens to have installed; a host with none does not error, it renders empty
 * space, and that reaches a customer's poster looking like a design choice.
 *
 * Shipping the font as a dependency removes the host from the question. The
 * same bytes render the same glyphs on a laptop, in CI and on Render.
 *
 * WOFF, not WOFF2: Satori reads TTF, OTF and WOFF only. `@fontsource` ships
 * both, and picking the wrong one fails at render time rather than at install.
 */

const require = createRequire(import.meta.url)

export interface LoadedFont {
  name: string
  data: Buffer
  weight: 400 | 700 | 900
  style: 'normal'
}

/** Weights the template schema allows. Loading more would be dead weight. */
const WEIGHTS = [400, 700, 900] as const

/**
 * The `latin` subset does not contain ₹ (U+20B9) — it stops at U+20AB and
 * resumes at U+20AD, and the rupee sign falls in the `latin-ext` range that
 * follows. Rendering an Indian price with `latin` alone produces a NO-GLYPH box
 * where the currency symbol should be, on every poster, silently.
 *
 * Both subsets are therefore loaded under distinct family names and used as a
 * stack (see `FONT_STACK` in layout.ts). Satori keys fonts by
 * name + weight + style, so registering both as "Inter" would mean the second
 * simply replacing the first.
 */
const SUBSETS = [
  { subset: 'latin', family: 'Inter' },
  { subset: 'latin-ext', family: 'InterExt' },
] as const

/** The family stack templates render with, widest coverage last. */
export const FONT_FAMILY_STACK = 'Inter, InterExt'

let cache: LoadedFont[] | null = null

/**
 * Load the font set once per process.
 *
 * Cached because these are a few hundred kilobytes each and a batch of fifty
 * posters would otherwise read them from disk fifty times.
 */
export async function loadFonts(): Promise<LoadedFont[]> {
  if (cache) return cache

  const loaded = await Promise.all(
    SUBSETS.flatMap(({ subset, family }) =>
      WEIGHTS.map(async (weight) => {
        const path = require.resolve(
          `@fontsource/inter/files/inter-${subset}-${String(weight)}-normal.woff`,
        )
        return {
          name: family,
          data: await readFile(path),
          weight,
          style: 'normal' as const,
        }
      }),
    ),
  )

  cache = loaded
  return loaded
}

/** Test-only reset, so a suite can exercise a cold load. */
export function resetFontCache(): void {
  cache = null
}
