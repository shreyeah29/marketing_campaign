'use client'

import { api } from '@/lib/api'
import { Icon } from '@/components/icon'

/**
 * The picture on a creative-direction card, from whichever source has one.
 *
 * Shared because two screens show these cards — the shelf on the brief screen
 * and the transform gallery — and they were drifting: the shelf showed real
 * examples while transform showed a grid of grey placeholders for styles that
 * had a picture sitting in storage the whole time.
 *
 * Three sources, in order of preference, and the CORS handling is opposite
 * between them, which is the entire reason this is one component:
 *
 * 1. **A committed file**, served by the API. Free, identical in every
 *    environment, no network beyond our own. Behind `CONTENT_READ`, so a bare
 *    `<img>` sends no cookies cross-origin and needs `use-credentials`.
 * 2. **A generated picture** in object storage, for directions whose file has
 *    not been committed yet. The bucket answers with a wildcard origin and
 *    *refuses* a credentialed request — the exact opposite of (1), and the two
 *    look identical in the markup.
 * 3. **A live template render**, for the promotional directions. API origin
 *    again, so credentials again.
 *
 * With none of those it is deliberately blank. Stock artwork on one of these
 * cards is a promise about what the direction produces, and the promise has to
 * be kept by something real.
 */

/** The preview fields every direction carries, whichever screen renders it. */
export interface DirectionArtSource {
  id: string
  name: string
  /** A committed sample file exists for this direction. */
  hasSample?: boolean
  /** A generated picture, when no file is committed yet. */
  previewUrl?: string | null
  /** A layout to render live, for template directions. */
  previewTemplateSlug?: string | null
}

export function DirectionArt({ direction }: { direction: DirectionArtSource }) {
  if (direction.hasSample) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${api.base}/creative-directions/${direction.id}/sample`}
        alt={`${direction.name} example`}
        crossOrigin="use-credentials"
        loading="lazy"
      />
    )
  }
  if (direction.previewUrl) {
    // No `crossOrigin`: see (2) above. Adding it here is the failure that makes
    // every tile a broken image, and it looks like a fix.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={direction.previewUrl} alt={`${direction.name} example`} loading="lazy" />
  }
  if (direction.previewTemplateSlug) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${api.base}/design-templates/${direction.previewTemplateSlug}/preview?ratio=1%3A1`}
        alt={`${direction.name} sample`}
        crossOrigin="use-credentials"
        loading="lazy"
      />
    )
  }
  return (
    <span className="direction-card__pending">
      <Icon name="sparkles" size={17} />
    </span>
  )
}

/** Whether anything real can be shown, for callers that label the tile. */
export function hasDirectionArt(direction: DirectionArtSource): boolean {
  return Boolean(direction.hasSample || direction.previewUrl || direction.previewTemplateSlug)
}
