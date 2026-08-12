import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import type { AppLogger } from '@vsp/observability'

import {
  buildBandSvg,
  contactLines,
  escapeXml,
  fit,
  hasAnythingToStamp,
  measureBand,
  OverlayService,
} from '../overlay.js'

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as AppLogger

/** A plain image to composite onto, so the tests exercise real rendering. */
async function canvas(width = 1280, height = 720): Promise<Uint8Array> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 140 } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

describe('escapeXml', () => {
  it('escapes the characters that would break the SVG', () => {
    // "&" is the one that matters in practice: it appears in half the business
    // names we will ever see, and an unescaped one makes the SVG unparseable.
    expect(escapeXml('Vsp Law & Associates')).toBe('Vsp Law &amp; Associates')
    expect(escapeXml('<script>')).toBe('&lt;script&gt;')
    expect(escapeXml(`"quoted" 'single'`)).toBe('&quot;quoted&quot; &apos;single&apos;')
  })
})

describe('fit', () => {
  it('leaves short text alone', () => {
    expect(fit('+91 99084 11129', 40)).toBe('+91 99084 11129')
  })

  it('truncates on a word boundary when one is near the end', () => {
    const out = fit('Trusted legal solutions across the USA, Canada and India', 30)
    expect(out.length).toBeLessThanOrEqual(30)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('  ')
  })

  it('still truncates when there is no usable space', () => {
    const out = fit('a'.repeat(60), 20)
    expect(out).toHaveLength(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('contactLines', () => {
  it('labels each number and caps at two', () => {
    expect(
      contactLines({
        phones: ['India +91 99084 11129', 'USA +1 317 449 2654', 'Canada +1 000'],
        contactEmail: 'info@vsp.com',
      }),
    ).toEqual(['India +91 99084 11129   ·   USA +1 317 449 2654', 'info@vsp.com'])
  })

  it('skips blanks rather than printing empty lines', () => {
    expect(contactLines({ phones: ['  ', ''], contactEmail: '   ' })).toEqual([])
  })
})

describe('hasAnythingToStamp', () => {
  it('is false for an empty brand kit', () => {
    expect(hasAnythingToStamp({})).toBe(false)
    expect(hasAnythingToStamp({ phones: [], logoUrl: '', displayName: '' })).toBe(false)
  })

  it('is true as soon as one fact exists', () => {
    expect(hasAnythingToStamp({ displayName: 'VSP' })).toBe(true)
    expect(hasAnythingToStamp({ phones: ['+91 1'] })).toBe(true)
  })
})

describe('measureBand', () => {
  it('grows with the amount of detail', () => {
    const minimal = measureBand(1280, { displayName: 'VSP' })
    const full = measureBand(1280, {
      displayName: 'Vsp Law & Associates',
      contactEmail: 'info@vsp.com',
      phones: ['India +91 99084 11129'],
      disclaimer: 'This is not an advertisement.',
    })
    // The band used to be a share of image height, so a full brand kit was
    // crushed into the same space as a bare one and the disclaimer clipped.
    expect(full).toBeGreaterThan(minimal)
  })

  it('leaves room for every row it was asked to hold', () => {
    const facts = {
      displayName: 'Vsp Law & Associates',
      contactEmail: 'info@vsp.com',
      phones: ['India +91 99084 11129'],
      disclaimer: 'This is not an advertisement.',
    }
    const height = measureBand(1280, facts)
    const svg = buildBandSvg(1280, height, facts, 0)
    const ys = [...svg.matchAll(/<text[^>]*y="(\d+)"/g)].map((m) => Number(m[1]))
    expect(ys).toHaveLength(4)
    // Every baseline inside the band, none pushed past the bottom edge.
    expect(Math.min(...ys)).toBeGreaterThan(0)
    expect(Math.max(...ys)).toBeLessThan(height)
  })

  it('scales type with image width, not band height', () => {
    expect(measureBand(2048, { displayName: 'VSP' })).toBeGreaterThan(
      measureBand(640, { displayName: 'VSP' }),
    )
  })
})

describe('buildBandSvg', () => {
  it('produces a parseable SVG carrying the facts', async () => {
    const svg = buildBandSvg(
      1280,
      140,
      {
        displayName: 'Vsp Law & Associates',
        contactEmail: 'info@vsp.com',
        phones: ['India +91 99084 11129'],
        disclaimer: 'This is not an advertisement or solicitation.',
      },
      0,
    )

    expect(svg).toContain('Vsp Law &amp; Associates')
    expect(svg).toContain('info@vsp.com')
    expect(svg).toContain('not an advertisement')

    // The real assertion: sharp can parse and rasterise it. A malformed SVG
    // fails here rather than silently producing an unstamped poster.
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    expect(png.byteLength).toBeGreaterThan(0)
  })

  it('shifts the text right to clear a logo', () => {
    const withLogo = buildBandSvg(1280, 140, { displayName: 'VSP' }, 120)
    const without = buildBandSvg(1280, 140, { displayName: 'VSP' }, 0)
    const x = (svg: string) => Number(/<text x="(\d+)"/.exec(svg)?.[1])
    expect(x(withLogo)).toBeGreaterThan(x(without))
  })
})

describe('OverlayService', () => {
  it('stamps the band and returns a larger, still-valid PNG', async () => {
    const base = await canvas()
    const result = await new OverlayService(logger).apply(base, 'image/png', {
      displayName: 'Vsp Law & Associates',
      contactEmail: 'info@vsp.com',
      phones: ['India +91 99084 11129'],
    })

    expect(result.contentType).toBe('image/png')
    const meta = await sharp(result.bytes).metadata()
    // Same canvas — the band is composited on, never appended, so the poster
    // keeps the aspect ratio the ad platform was told to expect.
    expect(meta.width).toBe(1280)
    expect(meta.height).toBe(720)
    expect(result.bytes).not.toEqual(base)
  })

  it('returns the image untouched when the brand kit is empty', async () => {
    const base = await canvas()
    const result = await new OverlayService(logger).apply(base, 'image/png', {})
    expect(result.bytes).toBe(base)
  })

  it('leaves video alone', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const result = await new OverlayService(logger).apply(bytes, 'video/mp4', {
      displayName: 'VSP',
    })
    expect(result.bytes).toBe(bytes)
    expect(result.contentType).toBe('video/mp4')
  })

  it('keeps the original image when the bytes are not an image at all', async () => {
    const junk = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const result = await new OverlayService(logger).apply(junk, 'image/png', {
      displayName: 'VSP',
    })
    // Degrades to the plain input rather than throwing — a creative the user is
    // waiting on must not be lost to a decoding failure.
    expect(result.bytes).toBe(junk)
  })

  it('stamps the text even when the logo cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    )
    try {
      const base = await canvas()
      const result = await new OverlayService(logger).apply(base, 'image/png', {
        displayName: 'VSP',
        logoUrl: 'https://example.com/logo.png',
        phones: ['+91 99084 11129'],
      })
      expect(result.bytes).not.toEqual(base)
      const meta = await sharp(result.bytes).metadata()
      expect(meta.width).toBe(1280)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('skips images too small to carry a band', async () => {
    const tiny = await canvas(120, 120)
    const result = await new OverlayService(logger).apply(tiny, 'image/png', {
      displayName: 'VSP',
    })
    expect(result.bytes).toBe(tiny)
  })
})
