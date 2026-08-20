import { describe, expect, it } from 'vitest'

import { detailOf } from '../problem.filter.js'

/**
 * Every validation failure in the application reported "[object Object]".
 *
 * Nest carries a validation response's `message` as an *array* of issues, and
 * the filter ran `String()` over it. A 400 that named the offending field
 * reached the screen as a string that looks like a crash — so the response
 * already said what was wrong, and nobody could read it.
 */

describe('the detail on a problem response', () => {
  it('reads an array of validation issues rather than stringifying it', () => {
    // The exact body that produced "[object Object]": a strict schema rejecting
    // keys a newer frontend sent.
    const detail = detailOf(
      {
        message: [
          {
            code: 'unrecognized_keys',
            keys: ['productImageUrl', 'pictureKinds'],
            path: [],
            message: "Unrecognized key(s) in object: 'productImageUrl', 'pictureKinds'",
          },
        ],
      },
      'Bad Request Exception',
    )
    expect(detail).toContain('Unrecognized key')
    expect(detail).not.toContain('[object Object]')
  })

  it('names the field for a nested issue', () => {
    // An unattached "Required" is only half an error message.
    const detail = detailOf(
      { message: [{ path: ['audience', 'locations'], message: 'Required' }] },
      'Bad Request Exception',
    )
    expect(detail).toBe('audience.locations: Required')
  })

  it('joins several issues and stops before it becomes a paragraph', () => {
    const many = Array.from({ length: 9 }, (_unused, i) => ({
      path: [`field${String(i)}`],
      message: 'Required',
    }))
    const detail = detailOf({ message: many }, 'Bad Request Exception')
    expect(detail.split(' · ')).toHaveLength(4)
  })

  it('keeps a plain string message untouched', () => {
    expect(detailOf({ message: 'Asset not found' }, 'fallback')).toBe('Asset not found')
    expect(detailOf('Asset not found', 'fallback')).toBe('Asset not found')
  })

  it('falls back to the exception message when there is nothing to read', () => {
    // An empty issue array must not produce an empty detail — a blank message is
    // as unhelpful as "[object Object]" and harder to spot.
    expect(detailOf({ message: [] }, 'Bad Request Exception')).toBe('Bad Request Exception')
    expect(detailOf(null, 'Bad Request Exception')).toBe('Bad Request Exception')
  })
})
