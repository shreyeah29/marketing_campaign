'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/**
 * The template gallery.
 *
 * Every tile is a real render of that template against one shared sample, so
 * the grid compares layouts rather than products. Tiles are plain `<img>`
 * pointing at the render endpoint: the server produces exactly what a creative
 * will look like, which removes any chance of the gallery and the output
 * disagreeing.
 */

/** The shapes a poster is asked for, and what each is for. */
const RATIOS: readonly (readonly [string, string])[] = [
  ['1:1', 'Feed'],
  ['4:5', 'Portrait'],
  ['9:16', 'Story'],
  ['16:9', 'Wide'],
]

interface DesignTemplate {
  slug: string
  name: string
  description: string
  ratios: string[]
  background: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<DesignTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Which shape to preview.
   *
   * Not decoration: Story Strip is composed for the vertical and offered at 9:16
   * and 4:5 only, so a gallery locked to squares would show it at a shape it
   * does not support and misrepresent the one template whose whole argument is
   * its proportions.
   */
  const [ratio, setRatio] = useState('1:1')

  useEffect(() => {
    api
      .get<{ data: DesignTemplate[] }>('/design-templates')
      .then((r) => setTemplates(r.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load the templates'),
      )
  }, [])

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Eight layouts, each a different structure rather than one layout in eight palettes."
      />

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {RATIOS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${ratio === value ? 'on' : ''}`}
            onClick={() => setRatio(value)}
          >
            {value} · {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : templates === null ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card skeleton" style={{ height: 300 }} />
          ))}
        </div>
      ) : (
        <Stagger
          interval={0.05}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {templates.map((t) => (
            <StaggerItem key={t.slug} className="card" style={{ padding: 12 }}>
              {!t.ratios.includes(ratio) ? (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: ratio.replace(':', ' / '),
                    borderRadius: 10,
                    background: 'var(--surface-sunken)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: 16,
                  }}
                  className="type-caption"
                >
                  Not offered at {ratio} — this layout is built for {t.ratios.join(' and ')}.
                </div>
              ) : (
                <>
                  {/* The reason the gallery was empty.

                  This is an API render behind CONTENT_READ, and a bare <img>
                  sends no cookies cross-origin — so every request came back 401
                  and every tile was a broken image. `use-credentials` is
                  required here and forbidden on bucket URLs, which answer with a
                  wildcard origin; the two look identical and behave oppositely.
                  See lib/download.ts for the same distinction. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`${t.slug}-${ratio}`}
                    src={`${api.base}/design-templates/${t.slug}/preview?ratio=${encodeURIComponent(ratio)}`}
                    alt={`${t.name} sample`}
                    crossOrigin="use-credentials"
                    loading="lazy"
                    style={{
                      width: '100%',
                      aspectRatio: ratio.replace(':', ' / '),
                      objectFit: 'contain',
                      borderRadius: 10,
                      // Tinted with the template's own background so the grid does
                      // not flash white while five renders are in flight.
                      background: t.background,
                      display: 'block',
                    }}
                  />
                </>
              )}
              <p className="type-body-strong" style={{ margin: '12px 0 4px' }}>
                {t.name}
              </p>
              <p className="type-caption" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                {t.description}
              </p>
              <p
                className="type-caption"
                style={{ color: 'var(--text-tertiary)', margin: '8px 0 0' }}
              >
                {t.ratios.join(' · ')}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <FadeIn delay={0.2}>
        <p
          className="type-caption"
          style={{ color: 'var(--text-tertiary)', marginTop: 20, maxWidth: '60ch' }}
        >
          Each template renders from your product data — the prices, names and coupon codes are
          typeset exactly as you entered them, never generated.
        </p>
      </FadeIn>
    </>
  )
}
