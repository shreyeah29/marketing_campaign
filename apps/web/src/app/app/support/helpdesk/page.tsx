'use client'

import { useMemo, useState } from 'react'

import { PageHeader, SearchInput } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Chip } from '@/components/status'

interface Article {
  id: string
  title: string
  category: string
  body: string
}

const ARTICLES: Article[] = [
  {
    id: 'ai-generation',
    title: 'How AI generation works',
    category: 'AI',
    body: 'Describe what you want in plain language and the assistant drafts it for you — campaign copy, social posts, replies and more. Every generation is a draft: nothing is published or sent until you review and approve it. If a provider is not yet configured, add one under Settings → Providers. You can regenerate any draft as many times as you like, and edits you make are always preserved over the model output.',
  },
  {
    id: 'lead-capture-form',
    title: 'Creating a lead capture form',
    category: 'CRM',
    body: 'Open Marketing → Forms and start a new form. Add the fields you need (name, email, phone, custom questions), then set where submissions should land — new contacts are created automatically and tagged by source. Embed the form on your site with the generated snippet, or share the hosted link. Consent checkboxes are opt-in by default so you stay compliant.',
  },
  {
    id: 'workflow-automation',
    title: 'Building a workflow automation',
    category: 'Automation',
    body: 'Automations run a sequence of steps when a trigger fires — a new lead, a form submission, a schedule. Go to Automation → Workflows, pick a trigger, then chain actions such as sending an email, adding a tag, or notifying a teammate. Save it as a draft to test, and activate it when you are ready. Activated workflows require the "activate" permission, so drafts are safe to experiment with.',
  },
  {
    id: 'connect-social',
    title: 'Connecting a social account',
    category: 'Channels',
    body: 'Head to Settings → Providers and choose the network you want to connect (Instagram, Facebook, LinkedIn, X and more). Authorise access in the popup and the account appears as a publishing target. Once connected, approved campaign assets can be scheduled or published directly. Reconnect if a token expires — the banner on the Providers page will tell you when action is needed.',
  },
  {
    id: 'roles-permissions',
    title: 'Understanding roles & permissions',
    category: 'Admin',
    body: 'Every teammate has a role: Viewer, Member, Manager, Admin or Owner. Roles are cumulative — each includes everything the one below it can do, plus more. Members can draft and create; Managers can publish, send and approve; Admins run the workspace; Owners have full control. Need a one-off exception? Grant a single extra permission instead of promoting someone to a higher role.',
  },
  {
    id: 'support-tickets',
    title: 'Managing support tickets',
    category: 'Support',
    body: 'Support → Tickets is your shared queue. Open a ticket for any customer request, set its priority, and assign it to a teammate. Reply in the conversation thread, or add an internal note that the requester never sees by ticking "Internal note". Move a ticket to Resolved or Closed when you are done — reopening it to Open clears the resolution timestamp automatically.',
  },
]

export default function HelpdeskPage() {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return ARTICLES
    return ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <>
      <PageHeader title="Help center" subtitle="Answers to common questions, built right in" />

      <FadeIn delay={0.12} className="card" style={{ marginBottom: 18 }}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search help articles…" />
      </FadeIn>

      {results.length === 0 ? (
        <div className="state">
          <div className="state-badge">
            <Icon name="search" size={22} />
          </div>
          <h3>No articles match “{query}”</h3>
          <p>Try a different search, or open a ticket and we will help directly.</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, marginBottom: 20 }}>
          {results.map((a) => {
            const open = openId === a.id
            return (
              <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  className="spread"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onClick={() => setOpenId(open ? null : a.id)}
                  aria-expanded={open}
                >
                  <span className="row" style={{ gap: 10 }}>
                    <Chip>{a.category}</Chip>
                    <span style={{ fontWeight: 600 }}>{a.title}</span>
                  </span>
                  <span className="dim" style={{ fontSize: 18 }}>
                    {open ? '−' : '+'}
                  </span>
                </button>
                {open ? (
                  <div
                    style={{ padding: '0 16px 16px', fontSize: 14, lineHeight: 1.6 }}
                    className="dim"
                  >
                    {a.body}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <FadeIn
        delay={0.18}
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          padding: 20,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Still need help?</h3>
          <p className="dim" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Can’t find an answer here? Open a ticket and a teammate will pick it up.
          </p>
        </div>
        <a className="btn primary" href="/app/support/tickets">
          Open a ticket
        </a>
      </FadeIn>
    </>
  )
}
