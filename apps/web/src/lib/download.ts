/**
 * Save a remote file to disk.
 *
 * `<a href download>` is not enough for either kind of URL this app holds. On a
 * cross-origin href the browser ignores the `download` attribute entirely and
 * navigates to the image instead; on the API's own render endpoint the anchor
 * sends no credentials, so the request comes back 401 and the file that lands is
 * an error page. Fetching the bytes first sidesteps both: the blob is same-origin
 * by the time the anchor sees it.
 *
 * `credentials: 'include'` is passed only for our API, which authorises the
 * render with the session cookie. Storage-bucket URLs must not send credentials —
 * the bucket answers `Access-Control-Allow-Origin: *`, and a wildcard with
 * credentials is refused by the browser.
 */

export interface DownloadOptions {
  /** Send the session cookie. True only for API-origin URLs. */
  readonly withCredentials?: boolean
}

/** Strips characters a filesystem will not take, and collapses the gaps. */
export function safeFilename(parts: (string | null | undefined)[], extension: string): string {
  const stem =
    parts
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'download'
  return `${stem}.${extension.replace(/^\./, '')}`
}

/**
 * Fetches `url` and saves it as `filename`.
 *
 * Throws with a readable message rather than failing silently — a download that
 * does nothing and says nothing is the worst version of this.
 */
export async function downloadUrl(
  url: string,
  filename: string,
  options: DownloadOptions = {},
): Promise<void> {
  const res = await fetch(url, {
    credentials: options.withCredentials ? 'include' : 'omit',
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'Not allowed to download that file — try reloading the page.'
        : `Could not fetch the file (${String(res.status)}).`,
    )
  }

  const blob = await res.blob()
  if (blob.size === 0) throw new Error('The file came back empty.')

  const href = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    // Firefox needs the anchor in the document for a programmatic click.
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoked on the next tick: revoking synchronously can cancel the download
    // in Safari before it has read the blob.
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
  }
}

/** The file extension implied by a URL, defaulting to png for our renders. */
export function extensionFromUrl(url: string, fallback = 'png'): string {
  const match = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(url)
  return match?.[1]?.toLowerCase() ?? fallback
}
