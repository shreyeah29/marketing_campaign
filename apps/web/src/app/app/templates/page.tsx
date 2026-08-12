'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader } from '@/components/kit'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { LIBRARY_SECTION, SectionNav } from '@/components/section-nav'

/**
 * The template gallery.
 *
 * Every tile is a real render of that template against one shared sample, so
 * the grid compares layouts rather than products. Tiles are plain `<img>`
 * pointing at the render endpoint: the server produces exactly what a creative
 * will look like, which removes any chance of the gallery and the output
 * disagreeing.
 */

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
      <PageHeader title="Templates" />
      <SectionNav links={LIBRARY_SECTION} />

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${api.base}/design-templates/${t.slug}/preview?ratio=1:1`}
                alt={`${t.name} sample`}
                loading="lazy"
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  objectFit: 'cover',
                  borderRadius: 10,
                  // Tinted with the template's own background so the grid does
                  // not flash white while five renders are in flight.
                  background: t.background,
                  display: 'block',
                }}
              />
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
