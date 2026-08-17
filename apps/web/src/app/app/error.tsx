'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/icon'

/**
 * The last line of defence for every screen under /app.
 *
 * Without this file, one thrown exception anywhere in the tree replaces the
 * entire application with Next's own bare sentence — "a client-side exception
 * has occurred" on an otherwise black page, no navigation, no way back. That is
 * what a single non-null assertion in the Creatives tab did: the campaign, the
 * sidebar and every other section disappeared along with it.
 *
 * A boundary here cannot make the failure not have happened, but it can keep the
 * failure the size it actually is. The chrome survives, the person can leave, and
 * `reset()` re-renders the segment — which is genuinely enough when the cause was
 * a transient fetch or a state combination they can back out of.
 *
 * The message is shown rather than hidden. This is an internal operations tool,
 * not a consumer storefront: the person reading it is the one who will report it,
 * and "Cannot read properties of null" in their screenshot is worth more than a
 * polite non-statement.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Reaches the browser console and any error reporter attached to it. The
    // boundary swallows the throw, so without this the stack is gone.
    console.error('[app] unhandled render error', error)
  }, [error])

  return (
    <div className="state" style={{ maxWidth: '60ch', margin: '0 auto' }}>
      <div
        className="state-badge"
        style={{ background: 'var(--crimson-100)', color: 'var(--crimson-600)' }}
      >
        <Icon name="alert-triangle" size={22} />
      </div>
      <h3>This screen hit an error</h3>
      <p>
        Nothing you were looking at was changed or lost. Try it again — if it happens twice, the
        detail below is what to send us.
      </p>
      {error.message ? (
        <p className="type-caption" style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
          {error.message}
          {error.digest ? ` · ${error.digest}` : ''}
        </p>
      ) : null}
      <div className="row mt" style={{ gap: 8, justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={reset}>
          <Icon name="refresh" size={14} /> Try again
        </button>
        <Link href="/app/dashboard" className="btn">
          Back to Today
        </Link>
      </div>
    </div>
  )
}
