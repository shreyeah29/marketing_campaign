'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { Icon, type IconName } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * The creative-direction shelf — every way this system can make a picture.
 *
 * "Template" used to mean four different things: a layout the engine typesets, a
 * look an image model paints in, a reference someone uploaded, and a campaign
 * preset. They lived on different screens under the same word, so the one that
 * never spells anything wrong was buried under Library while the one that draws
 * its own letters was the default.
 *
 * Here they are grouped by what you have to bring, which is the only division a
 * person can act on:
 *
 * - **AI Posters** — nothing but words
 * - **Promotional** — your catalogue, typeset, correct by construction
 * - **Product** / **Transform** — a picture you already have
 *
 * ## The previews are real or absent
 *
 * A promotional card shows a true render of its own layout, from the endpoint
 * that renders it — free, exact, and it updates when the layout does. An AI card
 * shows a tinted placeholder until a genuine example has been generated and
 * stored. Stock artwork on that card would be a promise about output nobody has
 * seen, so it stays empty and says so.
 */

interface Direction {
  id: string
  name: string
  blurb: string
  group: 'ai-poster' | 'promotional' | 'product' | 'transform'
  kind: 'ai' | 'template'
  needs: 'nothing' | 'product' | 'photo'
  industries: string[]
  settings: {
    postCount?: 1 | 2 | 3 | 5 | 10 | 20
    videoCount?: 0 | 1 | 2 | 3
    wantPosterDesigns?: boolean
    wantPhotography?: boolean
  }
  /** A layout to render a true preview from, or null when none exists yet. */
  previewTemplateSlug: string | null
  /**
   * A generated example, for directions no layout can render.
   *
   * Null until an operator has generated the set, and the card falls back to a
   * placeholder rather than stock art — see the file comment.
   */
  previewUrl?: string | null
}

export type { Direction }

/** Shelf order, and the words used for each. Groups with nothing in them hide. */
const GROUPS: { id: Direction['group']; label: string; hint: string; icon: IconName }[] = [
  {
    id: 'ai-poster',
    label: 'AI posters',
    hint: 'You describe it, the AI draws the whole thing.',
    icon: 'sparkles',
  },
  {
    id: 'promotional',
    label: 'Promotional',
    hint: 'Built from your catalogue. The price and the offer are always correct.',
    icon: 'megaphone',
  },
  {
    id: 'product',
    label: 'Your product',
    hint: 'Your product photograph stays the hero.',
    icon: 'image',
  },
  {
    id: 'transform',
    label: 'Transform a photo',
    hint: 'A picture you already have, in another style.',
    icon: 'images',
  },
]

export function DirectionShelf({
  selectedId,
  onPick,
  /**
   * Directions the AI put first for this brief, best first.
   *
   * Empty until the recommender exists. When it arrives, these three lift out of
   * their shelves into a row at the top — so nobody has to know what any of the
   * groups mean to get a good answer.
   */
  recommended = [],
}: {
  selectedId?: string | null
  onPick: (direction: Direction) => void
  recommended?: string[]
}) {
  const [all, setAll] = useState<Direction[] | null>(null)
  const [industry, setIndustry] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: Direction[] }>('/creative-directions')
      setAll(res.data ?? [])
    } catch {
      // The brief still works without the shelf: the box above it is the whole
      // required path, and a failed gallery must not block writing a brief.
      setAll([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const industries = useMemo(
    () => [...new Set((all ?? []).flatMap((d) => d.industries))].sort(),
    [all],
  )

  const shown = useMemo(() => {
    const list = all ?? []
    if (!industry) return list
    // An untagged direction describes a job rather than a sector and always
    // shows. Hiding "Minimal" from a café because nobody tagged it for food
    // would be the filter working against the person using it.
    return list.filter((d) => d.industries.length === 0 || d.industries.includes(industry))
  }, [all, industry])

  const top = useMemo(
    () =>
      recommended
        .map((id) => (all ?? []).find((d) => d.id === id))
        .filter((d): d is Direction => d != null),
    [recommended, all],
  )

  if (all === null) {
    return (
      <div className="row" style={{ gap: 8, padding: '30px 0' }}>
        <Spinner />
        <span className="type-secondary">Loading the ways to make this…</span>
      </div>
    )
  }
  if (all.length === 0) return null

  return (
    <section style={{ marginTop: 30 }}>
      <div className="suggest-group-label">HOW SHOULD IT BE MADE?</div>
      <p className="type-secondary" style={{ margin: '0 0 14px' }}>
        Pick a direction and everything below is decided for you. Promotional ones are typeset from
        your catalogue, so the words on them are never wrong.
      </p>

      {industries.length > 0 ? (
        <div className="row" style={{ gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={industry === null}
            onClick={() => setIndustry(null)}
          >
            All
          </button>
          {industries.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={industry === name}
              onClick={() => setIndustry(industry === name ? null : name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {top.length > 0 ? (
        <div style={{ marginBottom: 26 }}>
          <div className="suggest-group-label">RECOMMENDED FOR YOUR BRIEF</div>
          <Grid list={top} selectedId={selectedId} onPick={onPick} large />
        </div>
      ) : null}

      {GROUPS.map((group) => {
        const list = shown.filter((d) => d.group === group.id)
        if (list.length === 0) return null
        return (
          <div key={group.id} style={{ marginBottom: 26 }}>
            <div className="row" style={{ gap: 7, marginBottom: 3 }}>
              <Icon name={group.icon} size={14} />
              <span className="type-body-strong">{group.label}</span>
            </div>
            <p className="type-caption" style={{ margin: '0 0 11px', color: 'var(--text-muted)' }}>
              {group.hint}
            </p>
            <Grid list={list} selectedId={selectedId} onPick={onPick} />
          </div>
        )
      })}
    </section>
  )
}

function Grid({
  list,
  selectedId,
  onPick,
  large = false,
}: {
  list: Direction[]
  selectedId?: string | null | undefined
  onPick: (d: Direction) => void
  large?: boolean | undefined
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${large ? 236 : 190}px, 1fr))`,
        gap: 12,
      }}
    >
      {list.map((d) => (
        <button
          key={d.id}
          type="button"
          className="direction-card"
          data-selected={selectedId === d.id ? 'true' : undefined}
          aria-pressed={selectedId === d.id}
          onClick={() => onPick(d)}
        >
          <span className="direction-card__art">
            {d.previewUrl ? (
              /* A generated example, in our own bucket. No `crossOrigin` here:
                 the bucket answers with a wildcard origin, and asking for
                 credentials against one is refused. The opposite of the
                 template render below, which is on the API origin and needs
                 them — the two look identical and behave oppositely. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.previewUrl} alt={`${d.name} example`} loading="lazy" />
            ) : d.previewTemplateSlug ? (
              /* An API render behind CONTENT_READ. A bare <img> sends no cookies
                 cross-origin and every tile came back 401 — `use-credentials` is
                 required here, and forbidden on bucket URLs, which answer with a
                 wildcard origin. The two look identical and behave oppositely. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${api.base}/design-templates/${d.previewTemplateSlug}/preview?ratio=1%3A1`}
                alt={`${d.name} sample`}
                crossOrigin="use-credentials"
                loading="lazy"
              />
            ) : (
              // No real example yet. Deliberately blank rather than stock art.
              <span className="direction-card__pending">
                <Icon name="sparkles" size={17} />
              </span>
            )}
          </span>

          <span className="direction-card__body">
            <span className="direction-card__name">{d.name}</span>
            <span className="direction-card__blurb">{d.blurb}</span>
            <span className="direction-card__tag">
              {d.kind === 'template' ? 'Typeset — text always correct' : 'Drawn by AI'}
              {d.needs === 'product' ? ' · needs a product' : ''}
              {d.needs === 'photo' ? ' · needs a photo' : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
