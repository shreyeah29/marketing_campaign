'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { RECIPES, RECIPE_INDUSTRIES, recipeOutputs, recipesFor, type Recipe } from './recipes'

/**
 * The recipe gallery — start from something that already works.
 *
 * This sits under the brief coach on the New brief screen, where Launch / Grow /
 * Channel / Analyse used to be. Those were sentences; these are campaigns. The
 * difference that matters is on the card: each one states exactly what it will
 * produce, so the count of pictures — the biggest driver of what a run costs and
 * how long it takes — is a decision made before generation rather than a surprise
 * discovered after it.
 *
 * The industry filter is a filter, not a gate: recipes that describe a marketing
 * job rather than a sector carry no tags and always show. Hiding "Product launch"
 * from a café because nobody tagged it for food would be the filter working
 * against the person using it.
 */

export function RecipeGallery({
  industry,
  onPick,
}: {
  /** The workspace's industry, when known. Narrows the list; never hides it. */
  industry?: string | null
  onPick: (recipe: Recipe) => void
}) {
  const [filter, setFilter] = useState<string | null>(industry ?? null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const shown = useMemo(() => recipesFor(filter), [filter])

  return (
    <section style={{ marginTop: 30 }}>
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 4 }}>
        <div className="suggest-group-label">START FROM A RECIPE</div>
        <span className="type-caption" style={{ color: 'var(--text-muted)' }}>
          {shown.length} of {RECIPES.length}
        </span>
      </div>
      <p className="type-secondary" style={{ margin: '0 0 14px' }}>
        Each one sets the brief, the number of pictures and whether they are designed posters or
        photographs. Everything stays editable afterwards.
      </p>

      <div className="row" style={{ gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          className="chip"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
        >
          All
        </button>
        {RECIPE_INDUSTRIES.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            aria-pressed={filter === name}
            onClick={() => setFilter(filter === name ? null : name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 12 }}
      >
        {shown.map((recipe) => {
          const open = expanded === recipe.id
          return (
            <div key={recipe.id} className="card recipe-card">
              <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                <span className="recipe-card__glyph">
                  <Icon name={recipe.icon} size={15} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="type-body-strong" style={{ margin: 0 }}>
                    {recipe.name}
                  </p>
                  <p
                    className="type-caption"
                    style={{ margin: '2px 0 0', color: 'var(--text-tertiary)' }}
                  >
                    {recipe.blurb}
                  </p>
                </div>
              </div>

              {/* What you actually get, stated before you commit to it. */}
              <ul className="recipe-card__outputs">
                {recipeOutputs(recipe).map((line) => (
                  <li key={line}>
                    <Icon name="check" size={12} />
                    {line}
                  </li>
                ))}
              </ul>

              {open ? <p className="recipe-card__brief">{recipe.brief}</p> : null}

              <div className="row" style={{ gap: 7, marginTop: 'auto', paddingTop: 10 }}>
                <button type="button" className="btn primary sm" onClick={() => onPick(recipe)}>
                  Use this
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setExpanded(open ? null : recipe.id)}
                >
                  {open ? 'Hide brief' : 'Read the brief'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
