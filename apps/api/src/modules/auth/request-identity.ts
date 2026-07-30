import type { Principal } from '../../common/auth/principal.js'

/**
 * The authenticated user, independent of any organisation.
 *
 * A session proves *who* you are before it says anything about *where* you are
 * acting. A freshly-registered user with no organisation yet, or one deciding
 * which org to enter, has an identity but no principal. Identity-only routes
 * (session, list organisations, switch, accept invitation) read this; org-scoped
 * routes require the fuller `Principal`.
 */
export interface RequestIdentity {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly sessionId: string
  readonly emailVerified: boolean
}

/** The request shape the auth guard populates and the rest of the app reads. */
export interface AuthenticatedRequest {
  principal?: Principal
  identity?: RequestIdentity
  headers: Record<string, string | string[] | undefined>
}
