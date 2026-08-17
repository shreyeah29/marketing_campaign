'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/icon'

/**
 * The same boundary for the operator realm.
 *
 * Separate from the tenant one because the exit link differs and because the two
 * realms must not share a component that could leak one's chrome into the other.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[platform] unhandled render error', error)
  }, [error])

  return (
    <div className="state" style={{ maxWidth: '60ch', margin: '0 auto' }}>
      <div
        className="state-badge"
        style={{ background: 'var(--crimson-100)', color: 'var(--crimson-600)' }}
      >
        <Icon name="alert-triangle" size={22} />
      </div>
      <h3>This console screen hit an error</h3>
      <p>No tenant data was changed. Retry the segment, or go back to the organization list.</p>
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
        <Link href="/platform" className="btn">
          Organizations
        </Link>
      </div>
    </div>
  )
}
