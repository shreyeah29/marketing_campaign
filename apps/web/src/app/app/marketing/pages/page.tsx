'use client'

import { PageHeader } from '@/components/kit'

const STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: '🎨',
    title: 'Pick a template',
    body: 'Start from a conversion-focused layout — hero, features, testimonial and a single clear call to action.',
  },
  {
    icon: '✍️',
    title: 'Write the copy',
    body: 'Lead with the outcome, back it with proof, and keep one primary action per page. Match the message to the campaign that drives traffic here.',
  },
  {
    icon: '🚀',
    title: 'Publish & measure',
    body: 'Connect a domain, publish, then watch conversions. A/B test the headline and CTA to lift results over time.',
  },
]

export default function LandingPagesPage() {
  return (
    <>
      <PageHeader
        title="Landing Pages"
        subtitle="Build focused pages to capture leads from your campaigns."
      />
      <div className="grid cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="card">
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <h3 style={{ marginBottom: 8 }}>{s.title}</h3>
            <p className="muted" style={{ lineHeight: 1.5 }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
