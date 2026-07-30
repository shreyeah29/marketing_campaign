'use client'

import { PageHeader } from '@/components/kit'

const CHECKS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🏷️',
    title: 'Meta tags',
    body: 'Give every page a unique title (50–60 chars) and a compelling meta description (150–160 chars). Add Open Graph and Twitter card tags so shared links render rich previews.',
  },
  {
    icon: '🗺️',
    title: 'Sitemap',
    body: 'Publish an XML sitemap listing your canonical URLs and submit it in Search Console. Keep it in sync with your content and reference it from robots.txt.',
  },
  {
    icon: '🔑',
    title: 'Keywords',
    body: 'Map each page to a primary keyword and a small cluster of related terms. Use them naturally in headings, the intro, and image alt text — avoid stuffing.',
  },
  {
    icon: '⚡',
    title: 'Core Web Vitals',
    body: 'Keep LCP under 2.5s, INP under 200ms and CLS under 0.1. Compress images, lazy-load below the fold, and avoid layout shifts from late-loading media.',
  },
  {
    icon: '🔗',
    title: 'Internal linking',
    body: 'Link related pages with descriptive anchor text so crawlers and readers can find your best content. Fix broken links and orphaned pages.',
  },
  {
    icon: '📱',
    title: 'Mobile & structured data',
    body: 'Ensure pages are responsive and add schema.org structured data (Organization, Article, Product) so search engines can render rich results.',
  },
]

export default function SeoPage() {
  return (
    <>
      <PageHeader
        title="SEO"
        subtitle="A checklist of the fundamentals that help your pages rank."
      />
      <div className="grid cols-3">
        {CHECKS.map((c) => (
          <div key={c.title} className="card">
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <h3 style={{ marginBottom: 8 }}>{c.title}</h3>
            <p className="muted" style={{ lineHeight: 1.5 }}>
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
