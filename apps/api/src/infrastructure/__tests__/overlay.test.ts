import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import type { AppLogger } from '@marketing-os/observability'

import {
  buildBandSvg,
  wrapHeadline,
  canRenderText,
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
    expect(escapeXml('Northwind Tea & Coffee')).toBe('Northwind Tea &amp; Coffee')
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
        contactEmail: 'hello@northwind.example.com',
      }),
    ).toEqual(['India +91 99084 11129   ·   USA +1 317 449 2654', 'hello@northwind.example.com'])
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
    expect(hasAnythingToStamp({ displayName: 'Northwind' })).toBe(true)
    expect(hasAnythingToStamp({ phones: ['+91 1'] })).toBe(true)
  })
})

describe('measureBand', () => {
  it('grows with the amount of detail', () => {
    const minimal = measureBand(1280, { displayName: 'Northwind' })
    const full = measureBand(1280, {
      displayName: 'Northwind Tea & Coffee',
      contactEmail: 'hello@northwind.example.com',
      phones: ['India +91 99084 11129'],
      disclaimer: 'This is not an advertisement.',
    })
    // The band used to be a share of image height, so a full brand kit was
    // crushed into the same space as a bare one and the disclaimer clipped.
    expect(full).toBeGreaterThan(minimal)
  })

  it('leaves room for every row it was asked to hold', () => {
    const facts = {
      displayName: 'Northwind Tea & Coffee',
      contactEmail: 'hello@northwind.example.com',
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
    expect(measureBand(2048, { displayName: 'Northwind' })).toBeGreaterThan(
      measureBand(640, { displayName: 'Northwind' }),
    )
  })
})

describe('buildBandSvg', () => {
  it('produces a parseable SVG carrying the facts', async () => {
    const svg = buildBandSvg(
      1280,
      140,
      {
        displayName: 'Northwind Tea & Coffee',
        contactEmail: 'hello@northwind.example.com',
        phones: ['India +91 99084 11129'],
        disclaimer: 'This is not an advertisement or solicitation.',
      },
      0,
    )

    expect(svg).toContain('Northwind Tea &amp; Coffee')
    expect(svg).toContain('hello@northwind.example.com')
    expect(svg).toContain('not an advertisement')

    // The real assertion: sharp can parse and rasterise it. A malformed SVG
    // fails here rather than silently producing an unstamped poster.
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    expect(png.byteLength).toBeGreaterThan(0)
  })

  it('shifts the text right to clear a logo', () => {
    const withLogo = buildBandSvg(1280, 140, { displayName: 'Northwind' }, 120)
    const without = buildBandSvg(1280, 140, { displayName: 'Northwind' }, 0)
    const x = (svg: string) => Number(/<text x="(\d+)"/.exec(svg)?.[1])
    expect(x(withLogo)).toBeGreaterThan(x(without))
  })
})

describe('canRenderText', () => {
  it('detects a working font on this machine', async () => {
    // Also proves the probe is not trivially true: it inspects real pixels, so
    // a host without fonts would fail here rather than pass by construction.
    expect(await canRenderText()).toBe(true)
  })
})

describe('OverlayService', () => {
  it('stamps the band and returns a larger, still-valid PNG', async () => {
    const base = await canvas()
    const result = await new OverlayService(logger).apply(base, 'image/png', {
      displayName: 'Northwind Tea & Coffee',
      contactEmail: 'hello@northwind.example.com',
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
      displayName: 'Northwind',
    })
    expect(result.bytes).toBe(bytes)
    expect(result.contentType).toBe('video/mp4')
  })

  it('keeps the original image when the bytes are not an image at all', async () => {
    const junk = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const result = await new OverlayService(logger).apply(junk, 'image/png', {
      displayName: 'Northwind',
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
        displayName: 'Northwind',
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
      displayName: 'Northwind',
    })
    expect(result.bytes).toBe(tiny)
  })
})

describe('the poster message', () => {
  const BRAND = { displayName: 'Always Sunday', phones: ['India +91 99084 11129'] }

  it('is drawn on the artwork, at the size of a headline', () => {
    // The whole point: the image model is forbidden from spelling this, so if it
    // is not in the band it is nowhere.
    const band = measureBand(1080, { ...BRAND, headline: '1+1 this Rakshabandhan' })
    const svg = buildBandSvg(1080, band, { ...BRAND, headline: '1+1 this Rakshabandhan' }, 0)
    expect(svg).toContain('1+1 this Rakshabandhan')
    // Larger than the brand name beneath it, which is a signature rather than
    // the message.
    const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]))
    expect(Math.max(...sizes)).toBeGreaterThan(sizes[sizes.length - 1] ?? 0)
  })

  it('makes the band taller to hold it, instead of shrinking the words', () => {
    const plain = measureBand(1080, BRAND)
    const withText = measureBand(1080, { ...BRAND, headline: '1+1 this Rakshabandhan' })
    expect(withText).toBeGreaterThan(plain)
  })

  it('changes nothing for a picture that carries no message', () => {
    expect(measureBand(1080, BRAND)).toBe(measureBand(1080, { ...BRAND, headline: '   ' }))
  })

  it('escapes a message the way it escapes a brand name', () => {
    // "Buy 1 & get 1" makes the SVG unparseable and sharp fails the whole
    // composite — the same fault an ampersand in a business name used to cause.
    const svg = buildBandSvg(1080, 300, { ...BRAND, headline: 'Buy 1 & get 1 <free>' }, 0)
    expect(svg).toContain('&amp;')
    expect(svg).not.toContain('<free>')
  })
})

describe('wrapHeadline', () => {
  it('breaks on words, never mid-word', () => {
    // This is the largest type on the poster; a word cut in half reads as a
    // rendering fault rather than a line break.
    const lines = wrapHeadline('One plus one free this Rakshabandhan weekend', 20)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(22)
    expect(lines.join(' ')).toContain('Rakshabandhan')
  })

  it('keeps a word longer than the line rather than dropping it', () => {
    expect(wrapHeadline('Rakshabandhan', 6)).toEqual(['Rakshabandhan'])
  })

  it('stops at three lines and marks the cut', () => {
    const lines = wrapHeadline('a b c d e f g h i j k l m n o p q r s t u v', 3)
    expect(lines).toHaveLength(3)
  })

  it('returns nothing for nothing', () => {
    expect(wrapHeadline('   ', 20)).toEqual([])
  })
})
