import { Inject, Injectable } from '@nestjs/common'
import sharp, { type OverlayOptions } from 'sharp'

import type { AppLogger } from '@vsp/observability'

import { LOGGER } from './database.module.js'

/**
 * Stamps a business's real contact details onto generated artwork.
 *
 * The reason this exists: image models cannot write. Asked for a poster with a
 * phone number, they produce something that *looks* like a phone number and is
 * not one — wrong digits, invented characters, a logo that resembles the real
 * one. A flyer with a mangled number is worse than a flyer with none, because
 * it is confidently wrong and someone will dial it.
 *
 * So the model is told to leave clean space and draw no text (see
 * campaign-generation.service.ts), and the facts are composited here afterwards
 * from the brand kit, where a person typed them. The number on the poster is
 * then the number in the database, exactly, every time.
 *
 * Nothing here throws. A poster with no contact band is still a poster the user
 * is waiting to see; a failed overlay returns the original bytes and logs why.
 */

export interface BrandFacts {
  readonly displayName?: string | null
  readonly logoUrl?: string | null
  readonly contactEmail?: string | null
  /** Pre-formatted, e.g. "India +91 99084 11129". Order is the brand kit's. */
  readonly phones?: readonly string[]
  /** Regional advertising disclaimer, set in the brand kit. */
  readonly disclaimer?: string | null
}

export interface Composited {
  readonly bytes: Uint8Array
  readonly contentType: string
}

/** A logo larger than this share of the band would crowd the text. */
const LOGO_HEIGHT_RATIO = 0.58

/** The band may never eat more than this share of the artwork. */
const BAND_MAX_RATIO = 0.3

const LOGO_FETCH_TIMEOUT_MS = 8_000
const LOGO_MAX_BYTES = 8 * 1024 * 1024

/**
 * XML-escape text bound for an SVG.
 *
 * Not cosmetic: an ampersand in a business name ("Vsp Law & Associates") makes
 * the SVG unparseable, and sharp fails the whole composite rather than dropping
 * the character. Every one of these appears in real brand kits.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Truncate to a character budget, on a word boundary where one is close.
 *
 * SVG has no text wrapping and no ellipsis, so a long line silently runs off
 * the edge of the poster. Better a visibly shortened line than a cropped one.
 */
export function fit(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`
}

/** The contact lines, in priority order, as they should appear on the band. */
export function contactLines(facts: BrandFacts): string[] {
  const lines: string[] = []
  const phones = (facts.phones ?? []).filter((p) => p.trim().length > 0)
  if (phones.length > 0) lines.push(fit(phones.slice(0, 2).join('   ·   '), 64))
  if (facts.contactEmail?.trim()) lines.push(fit(facts.contactEmail.trim(), 48))
  return lines
}

/** True when there is anything worth stamping. An empty band is just a bar. */
export function hasAnythingToStamp(facts: BrandFacts): boolean {
  return (
    contactLines(facts).length > 0 ||
    Boolean(facts.logoUrl?.trim()) ||
    Boolean(facts.displayName?.trim())
  )
}

const FONT_STACK = 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif'

/**
 * The type scale, derived from image *width*.
 *
 * Width, not band height, because the two used to depend on each other: font
 * sizes came from the band, and the band came from a share of the image, so a
 * 720px-tall poster got a 96px band and four lines crushed into it with the
 * disclaimer clipping the edge. Anchoring the scale to width breaks the cycle
 * — type is sized first, and the band is then made tall enough to hold it.
 */
function metrics(width: number) {
  const base = Math.min(26, Math.max(12, Math.round(width * 0.0145)))
  return {
    base,
    name: Math.round(base * 1.34),
    line: base,
    disclaimer: Math.max(9, Math.round(base * 0.66)),
    gap: Math.round(base * 0.5),
    pad: Math.round(base * 1.15),
  }
}

/** The stacked text rows, in the order they are drawn. */
function rows(facts: BrandFacts, m: ReturnType<typeof metrics>) {
  const out: { text: string; size: number; weight: number }[] = []
  const name = facts.displayName?.trim()
  if (name) out.push({ text: fit(name, 38), size: m.name, weight: 700 })
  for (const line of contactLines(facts)) out.push({ text: line, size: m.line, weight: 400 })
  return out
}

/**
 * How tall the band must be to hold this brand's details, comfortably.
 *
 * Exported and used before the logo is fetched — the logo is then sized to fit
 * the band, rather than the band stretching to fit the logo.
 */
export function measureBand(width: number, facts: BrandFacts): number {
  const m = metrics(width)
  const block = rows(facts, m)
  const blockHeight =
    block.reduce((sum, r) => sum + r.size, 0) + Math.max(0, block.length - 1) * m.gap
  const disclaimer = facts.disclaimer?.trim() ? m.disclaimer + Math.round(m.disclaimer * 1.1) : 0
  return Math.round(m.pad * 2 + blockHeight + disclaimer)
}

/**
 * Build the band SVG.
 *
 * Exported for testing: this is string assembly with escaping and arithmetic in
 * it, which is exactly the part worth pinning, and rendering it needs no image.
 *
 * `font-family` lists several faces because the container's font set is not
 * guaranteed. The generic `sans-serif` at the end always resolves; the named
 * faces just produce a better result when present.
 */
export function buildBandSvg(
  width: number,
  bandHeight: number,
  facts: BrandFacts,
  logoWidth: number,
): string {
  const m = metrics(width)
  const textLeft = logoWidth > 0 ? m.pad + logoWidth + Math.round(m.pad * 0.9) : m.pad
  const disclaimer = facts.disclaimer?.trim() ? fit(facts.disclaimer.trim(), 150) : ''
  const block = rows(facts, m)

  const blockHeight =
    block.reduce((sum, r) => sum + r.size, 0) + Math.max(0, block.length - 1) * m.gap
  const discBand = disclaimer ? m.disclaimer + Math.round(m.disclaimer * 1.1) : 0

  // Centre the block in the space above the disclaimer strip. The first
  // baseline sits one cap-height down from the block's top edge.
  const available = bandHeight - discBand
  let cursor = Math.round((available - blockHeight) / 2) + (block[0]?.size ?? 0)

  const texts = block
    .map((r) => {
      const y = cursor
      cursor += r.size + m.gap
      return `<text x="${String(textLeft)}" y="${String(y)}" font-family="${FONT_STACK}" font-size="${String(r.size)}" font-weight="${String(r.weight)}" fill="#ffffff">${escapeXml(r.text)}</text>`
    })
    .join('')

  const disclaimerText = disclaimer
    ? `<text x="${String(m.pad)}" y="${String(bandHeight - Math.round(m.disclaimer * 0.7))}" font-family="${FONT_STACK}" font-size="${String(m.disclaimer)}" fill="#ffffff" fill-opacity="0.72">${escapeXml(disclaimer)}</text>`
    : ''

  // A gradient rather than a flat bar: artwork rarely ends on a clean edge, and
  // a hard line across the bottom reads as a mistake.
  return `<svg width="${String(width)}" height="${String(bandHeight)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.30"/>
      <stop offset="38%" stop-color="#000000" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${String(width)}" height="${String(bandHeight)}" fill="url(#band)"/>
  ${texts}${disclaimerText}
</svg>`
}

/**
 * Does this host have a font that can actually draw glyphs?
 *
 * Text in an SVG is rasterised through the system's font stack. A host with no
 * font installed does not error — it produces the band with nothing written in
 * it, which looks like a design choice and is the one failure here that would
 * ship silently to a customer's poster.
 *
 * The probe renders one glyph on a transparent canvas and asks whether any
 * pixel became opaque. Exported so a test can prove the probe itself works.
 */
export async function canRenderText(): Promise<boolean> {
  try {
    const svg = `<svg width="60" height="40" xmlns="http://www.w3.org/2000/svg"><text x="2" y="30" font-family="${FONT_STACK}" font-size="32" fill="#ffffff">A</text></svg>`
    const { data } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    // RGBA: every fourth byte is alpha. Any opaque pixel means a glyph landed.
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true
    }
    return false
  } catch {
    return false
  }
}

@Injectable()
export class OverlayService {
  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  /**
   * Resolved once per process. The answer cannot change while the host runs,
   * and a per-poster probe would be pure waste.
   */
  private fontCheck: Promise<boolean> | null = null

  private async warnIfNoFont(): Promise<void> {
    this.fontCheck ??= canRenderText()
    if (await this.fontCheck) return
    this.logger.error(
      {},
      'No usable font on this host — poster contact bands will render blank. ' +
        'Install a font package (e.g. fonts-dejavu-core) in the deployment image.',
    )
  }

  /**
   * Composite the contact band onto `bytes`.
   *
   * Returns the input untouched when there is nothing to stamp, when the input
   * is not a still image, or when anything at all goes wrong.
   */
  async apply(bytes: Uint8Array, contentType: string, facts: BrandFacts): Promise<Composited> {
    if (!contentType.startsWith('image/')) return { bytes, contentType }
    if (!hasAnythingToStamp(facts)) return { bytes, contentType }

    // Logged rather than thrown: a band with no text is still better than no
    // band, and this must never be the reason a poster fails to appear.
    await this.warnIfNoFont()

    try {
      const base = sharp(bytes, { failOn: 'error' })
      const meta = await base.metadata()
      const width = meta.width ?? 0
      const height = meta.height ?? 0
      if (width < 200 || height < 200) return { bytes, contentType }

      // Sized to the content, then capped: a brand kit with a long name, two
      // numbers, an email and a disclaimer needs more room than one with a
      // phone number, and neither should cover the artwork.
      const bandHeight = Math.min(measureBand(width, facts), Math.round(height * BAND_MAX_RATIO))

      // The logo is fetched before the SVG is built because its width decides
      // where the text starts.
      const logo = await this.loadLogo(facts.logoUrl, Math.round(bandHeight * LOGO_HEIGHT_RATIO))

      const svg = buildBandSvg(width, bandHeight, facts, logo?.width ?? 0)
      const layers: OverlayOptions[] = [
        { input: Buffer.from(svg), top: height - bandHeight, left: 0 },
      ]
      if (logo) {
        layers.push({
          input: logo.bytes,
          top: height - bandHeight + Math.round((bandHeight - logo.height) / 2),
          left: Math.round(bandHeight * 0.22),
        })
      }

      // PNG out regardless of what came in: the band's gradient banding is
      // visible under JPEG, and posters are re-encoded once, not repeatedly.
      const out = await base.composite(layers).png().toBuffer()
      return { bytes: new Uint8Array(out), contentType: 'image/png' }
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Could not stamp brand details onto the artwork — keeping the plain image',
      )
      return { bytes, contentType }
    }
  }

  /** Fetch and resize the logo. Any failure means "no logo", never "no poster". */
  private async loadLogo(
    url: string | null | undefined,
    targetHeight: number,
  ): Promise<{ bytes: Buffer; width: number; height: number } | null> {
    const href = url?.trim()
    if (!href) return null

    try {
      const res = await fetch(href, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`logo responded ${String(res.status)}`)
      const raw = new Uint8Array(await res.arrayBuffer())
      if (raw.byteLength === 0 || raw.byteLength > LOGO_MAX_BYTES) {
        throw new Error(`logo is ${String(raw.byteLength)} bytes`)
      }

      const resized = await sharp(raw)
        // `fit: inside` keeps the aspect ratio, so a wide wordmark stays wide
        // and a square mark stays square — the band adapts, not the logo.
        .resize({ height: targetHeight, fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer({ resolveWithObject: true })

      return {
        bytes: resized.data,
        width: resized.info.width,
        height: resized.info.height,
      }
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Brand logo could not be placed on the artwork — stamping the text only',
      )
      return null
    }
  }
}
