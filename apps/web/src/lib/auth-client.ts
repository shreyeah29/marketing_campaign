/**
 * Tenant auth client.
 *
 * Two surfaces, one thin wrapper:
 *   - Better Auth's credential endpoints under `/api/auth/*` (register, login,
 *     logout, password reset) — called directly, since they sit outside `/v1`.
 *   - The org-awareness endpoints under `/v1/auth/*` — through the shared `api`
 *     client, which already sends the session cookie.
 *
 * Everything uses `credentials: 'include'` so the HttpOnly session cookie set by
 * Better Auth rides along.
 */

import { api } from './api'

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_BASE']) || 'http://localhost:4000'

export interface AuthError {
  code?: string
  message: string
}

async function authFetch<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
  }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${API_BASE}/api/auth${path}`, init)
  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = (data ?? {}) as { message?: string; code?: string }
    const problem: AuthError = { message: err.message ?? `Request failed (${String(res.status)})` }
    if (err.code !== undefined) problem.code = err.code
    throw problem
  }
  return data as T
}

// ── Org membership summary (mirrors IdentityService) ───────────────────────────

export interface OrgMembership {
  organizationId: string
  name: string
  slug: string
  status: string
  role: string
  isActive: boolean
}

export interface AuthSession {
  user: { id: string; email: string; name: string; emailVerified: boolean }
  organizations: OrgMembership[]
  activeOrganizationId: string | null
  needsOrganization: boolean
}

export const authClient = {
  // ── Credentials (Better Auth) ────────────────────────────────────────────────
  signUp: (name: string, email: string, password: string) =>
    authFetch('/sign-up/email', { name, email, password }),

  signIn: (email: string, password: string, rememberMe = true) =>
    authFetch('/sign-in/email', { email, password, rememberMe }),

  signOut: () => authFetch('/sign-out', {}),

  requestPasswordReset: (email: string) =>
    authFetch('/forget-password', { email, redirectTo: '/reset-password' }),

  resetPassword: (newPassword: string, token: string) =>
    authFetch('/reset-password', { newPassword, token }),

  // ── Org awareness (/v1/auth) ─────────────────────────────────────────────────
  session: () => api.get<AuthSession>('/auth/session'),

  switchOrganization: (organizationId: string) =>
    api.post<{ ok: true; organization: OrgMembership }>('/auth/switch-organization', {
      organizationId,
    }),

  leaveOrganization: (organizationId: string) =>
    api.post<{ ok: true }>('/auth/leave-organization', { organizationId }),

  acceptInvitation: (token: string) =>
    api.post<{ ok: true; organizationId: string; role: string }>('/auth/invitations/accept', {
      token,
    }),
}
