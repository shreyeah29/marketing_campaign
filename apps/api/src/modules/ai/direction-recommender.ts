import { CREATIVE_DIRECTIONS, findDirection } from './creative-directions.js'

/**
 * Which three directions fit this brief.
 *
 * The shelf has thirty-eight cards on it, which is a better problem than the one
 * before it — but a person who types "Raksha Bandhan campaign for my café, 1+1
 * offer" should not then have to learn what thirty-eight things mean. They
 * described the campaign; the system knows its own catalogue; matching them is
 * the system's job.
 *
 * ## Why the model only ever picks from a list
 *
 * It is given the ids and told to return three of them. It cannot invent a
 * direction, and anything it returns that is not in the catalogue is dropped
 * rather than trusted — a recommender that can name a card that does not exist
 * produces a screen with three dead tiles on it.
 *
 * ## Why there is a fallback that needs no model at all
 *
 * The recommendation is a convenience, not a gate: the whole shelf is still on
 * screen underneath. So when no LLM is configured, or the call fails, or the
 * reply is unparseable, a keyword pass over the brief answers instead. Something
 * sensible at the top beats an empty row and an apology.
 */

export interface Recommendation {
  readonly id: string
  /** One short line on why this one, shown under the card. */
  readonly reason: string
}

/** The catalogue as the model sees it: id, name, and what it is for. */
function catalogueLines(): string {
  return CREATIVE_DIRECTIONS.map(
    (d) => `${d.id} | ${d.name} | ${d.group} | needs: ${d.needs} | ${d.blurb}`,
  ).join('\n')
}

export function buildRecommendPrompt(brief: string): string {
  return [
    'You choose which creative directions suit a marketing brief.',
    '',
    'THE CATALOGUE — id | name | group | what it needs | what it is for:',
    catalogueLines(),
    '',
    'GROUPS, and when each is right:',
    '- promotional: the layout engine typesets the words, so the price and the offer are always spelled correctly. Best whenever the brief names a specific offer, discount, price or deadline. Needs the client to have products in their catalogue.',
    '- ai-poster: an image model draws the whole poster including its words. Best for a mood, an occasion or an announcement with no exact figures to get right.',
    '- product: the client has a product photograph and wants a world built around it.',
    '- transform: the client already has a photograph and wants it re-rendered in another style.',
    '',
    'RULES:',
    '- Return exactly three, best first, and only ids from the catalogue above.',
    '- Pick from at least two different groups unless the brief clearly rules one out. Three near-identical suggestions waste the row.',
    '- When the brief names a concrete offer — "1+1", "40% off", "flat 500 off", a deadline — at least one recommendation must be promotional, because those are the ones that cannot spell it wrong.',
    '- Never recommend a `product` or `transform` direction unless the brief mentions a product photograph or an existing image.',
    '- Each reason is one short clause about THIS brief, at most twelve words. Not a description of the direction.',
    '',
    'Reply with JSON only, no code fence:',
    '{"picks":[{"id":"...","reason":"..."},{"id":"...","reason":"..."},{"id":"...","reason":"..."}]}',
    '',
    `THE BRIEF:\n${brief.slice(0, 2000)}`,
  ].join('\n')
}

/**
 * Read the model's reply, keeping only real directions.
 *
 * Tolerant of a markdown fence, because models add one about half the time even
 * when told not to — the same tolerance the campaign parser has, for the same
 * reason. Duplicates are dropped: a row showing the same card twice is worse
 * than a row of two.
 */
export function parseRecommendations(raw: string): Recommendation[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  const picks = (parsed as { picks?: unknown })?.picks
  if (!Array.isArray(picks)) return []

  const out: Recommendation[] = []
  const seen = new Set<string>()
  for (const entry of picks) {
    const id =
      typeof (entry as { id?: unknown })?.id === 'string' ? (entry as { id: string }).id : ''
    // Dropped rather than trusted: a card that does not exist renders as a dead
    // tile, and the model has no way of knowing it invented one.
    if (!id || seen.has(id) || !findDirection(id)) continue
    const reason =
      typeof (entry as { reason?: unknown })?.reason === 'string'
        ? (entry as { reason: string }).reason.trim().slice(0, 90)
        : ''
    seen.add(id)
    out.push({ id, reason })
    if (out.length === 3) break
  }
  return out
}

/**
 * Three directions chosen by keyword, when no model answers.
 *
 * Deliberately simple and deliberately biased toward `promotional`: a brief that
 * names a real offer is the case where drawn letters go wrong, and the typeset
 * path is the one that cannot. Everything else falls back to poster looks, which
 * need nothing but the brief itself.
 */
export function fallbackRecommendations(brief: string): Recommendation[] {
  const t = brief.toLowerCase()
  const picks: Recommendation[] = []
  const add = (id: string, reason: string) => {
    if (picks.length < 3 && !picks.some((p) => p.id === id) && findDirection(id)) {
      picks.push({ id, reason })
    }
  }

  if (/\b1\s*\+\s*1\b|buy one|bogo|buy 1/.test(t)) add('promo-pair', 'Built for a 1+1')
  if (/\d+\s*%|percent off|flat \d|discount|sale/.test(t))
    add('promo-flash', 'Puts the discount first')
  if (/until|ends|last day|limited|weekend|deadline|till/.test(t)) {
    add('promo-countdown', 'Shows the deadline')
  }
  if (/diwali|rakhi|raksha|holi|eid|onam|pongal|christmas|navratri|festive|festival/.test(t)) {
    add('ai-festive', 'Made for the occasion')
  }
  if (/launch|new |introduc/.test(t)) add('promo-launch', 'Quiet enough for a launch')
  if (/menu|dish|café|cafe|restaurant|coffee|food/.test(t))
    add('promo-menu', 'Shows dishes and prices')
  if (/luxur|premium|exclusive/.test(t)) add('ai-luxury', 'Restrained and expensive-looking')

  /**
   * Fill the row out with looks that suit almost any brief.
   *
   * More than three on purpose: the keyword rules above may already have taken
   * one or two slots, and a shorter list here silently returned a row of two
   * for a brief that matched nothing. `add` stops at three, so the extras cost
   * nothing and the row is never short.
   *
   * Every one needs nothing but the brief itself — no product, no photograph —
   * because a filler that sends someone to an empty screen is worse than no
   * filler.
   */
  for (const [id, reason] of [
    ['ai-editorial', 'Works for most briefs'],
    ['ai-minimal', 'Simple and quick to read'],
    ['ai-premium', 'Restrained and brand-safe'],
    ['ai-bold-sale', 'Reads from across a room'],
  ] as const) {
    add(id, reason)
  }
  return picks.slice(0, 3)
}
