import type { CSSProperties } from 'react'

/**
 * The shared landing-page block renderer.
 *
 * One source of truth for how a page's `blocks` array turns into markup, used both
 * by the builder's live preview and the public hosted page — so what an editor sees
 * is exactly what a visitor gets. Styling is plain inline CSS with no dependency on
 * the app shell, so it renders identically outside `/app`.
 */

export interface Block {
  type: string
  [key: string]: unknown
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function items(v: unknown): { title: string; body: string }[] {
  if (!Array.isArray(v)) return []
  return v.map((raw) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return { title: str(o['title']), body: str(o['body']) }
  })
}

const section: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '56px 24px',
}

function HeroBlock({ block }: { block: Block }) {
  const image = str(block['imageUrl'])
  return (
    <section
      style={{
        ...section,
        textAlign: 'center',
        maxWidth: 1080,
      }}
    >
      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '0 0 16px', fontWeight: 800 }}>
        {str(block['heading']) || 'Your headline'}
      </h1>
      {str(block['subheading']) ? (
        <p
          style={{
            fontSize: 20,
            lineHeight: 1.5,
            margin: '0 auto 28px',
            maxWidth: 640,
            opacity: 0.75,
          }}
        >
          {str(block['subheading'])}
        </p>
      ) : null}
      {str(block['ctaLabel']) ? (
        <a
          href={str(block['ctaUrl']) || '#'}
          style={{
            display: 'inline-block',
            background: '#4f46e5',
            color: '#fff',
            padding: '14px 28px',
            borderRadius: 10,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {str(block['ctaLabel'])}
        </a>
      ) : null}
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={str(block['heading'])}
          style={{ display: 'block', maxWidth: '100%', margin: '36px auto 0', borderRadius: 14 }}
        />
      ) : null}
    </section>
  )
}

function FeaturesBlock({ block }: { block: Block }) {
  const list = items(block['items'])
  return (
    <section style={section}>
      {str(block['heading']) ? (
        <h2 style={{ fontSize: 30, textAlign: 'center', margin: '0 0 36px', fontWeight: 700 }}>
          {str(block['heading'])}
        </h2>
      ) : null}
      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        {list.map((it, i) => (
          <div
            key={i}
            style={{
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 17, margin: '0 0 8px', fontWeight: 700 }}>
              {it.title || 'Feature'}
            </h3>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0, opacity: 0.75 }}>{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TextBlock({ block }: { block: Block }) {
  return (
    <section style={section}>
      {str(block['heading']) ? (
        <h2 style={{ fontSize: 28, margin: '0 0 16px', fontWeight: 700 }}>
          {str(block['heading'])}
        </h2>
      ) : null}
      <p style={{ fontSize: 17, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
        {str(block['body'])}
      </p>
    </section>
  )
}

function CtaBlock({ block }: { block: Block }) {
  return (
    <section style={{ ...section, textAlign: 'center' }}>
      <div
        style={{
          background: 'rgba(79,70,229,0.08)',
          borderRadius: 16,
          padding: '44px 24px',
        }}
      >
        <h2 style={{ fontSize: 28, margin: '0 0 20px', fontWeight: 700 }}>
          {str(block['heading']) || 'Ready to get started?'}
        </h2>
        {str(block['buttonLabel']) ? (
          <a
            href={str(block['buttonUrl']) || '#'}
            style={{
              display: 'inline-block',
              background: '#4f46e5',
              color: '#fff',
              padding: '14px 28px',
              borderRadius: 10,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {str(block['buttonLabel'])}
          </a>
        ) : null}
      </div>
    </section>
  )
}

function ImageBlock({ block }: { block: Block }) {
  const url = str(block['url'])
  if (!url) return null
  return (
    <section style={section}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={str(block['alt'])}
        style={{ display: 'block', maxWidth: '100%', margin: '0 auto', borderRadius: 14 }}
      />
    </section>
  )
}

function renderBlock(block: Block, key: number) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock key={key} block={block} />
    case 'features':
      return <FeaturesBlock key={key} block={block} />
    case 'text':
      return <TextBlock key={key} block={block} />
    case 'cta':
      return <CtaBlock key={key} block={block} />
    case 'image':
      return <ImageBlock key={key} block={block} />
    default:
      return null
  }
}

/** Render an ordered blocks array as page markup. */
export function renderBlocks(blocks: Block[]) {
  return blocks.map((b, i) => renderBlock(b, i))
}

export function PageBlocks({ blocks }: { blocks: Block[] }) {
  return <>{renderBlocks(blocks)}</>
}
