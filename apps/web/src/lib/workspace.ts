/**
 * Tenant workspace bootstrap.
 *
 * `/me/workspace` is the single call that tells the client how to render itself
 * for the signed-in organisation: which features are on, the navigation tree, the
 * branding and the limits. The tenant shell renders entirely from this — nothing
 * about the sidebar or dashboard is hardcoded.
 *
 * Tenant authentication (Better Auth) lands in Phase 6; until then this endpoint
 * fails closed with 401 for lack of a principal, which the shell surfaces as an
 * explicit "sign-in pending" state rather than a broken page.
 */

import { api } from './api'
import type { Workspace } from './types'

export const workspace = {
  bootstrap: () => api.get<Workspace>('/me/workspace'),
}

/**
 * Applies an organisation's branding by rewriting the brandable CSS variables.
 *
 * This is the white-label mechanism on the client: three colours and two fonts
 * from the branding response become `--color-primary` / `--brand-*-font`, so the
 * same shell reskins per-org without shipping any per-tenant CSS.
 */
export function applyBranding(branding: Workspace['branding']): void {
  if (typeof document === 'undefined' || !branding) return
  const root = document.documentElement
  if (branding.primaryColor) root.style.setProperty('--color-primary', branding.primaryColor)
  if (branding.accentColor) root.style.setProperty('--color-accent', branding.accentColor)
  if (branding.primaryColor) root.style.setProperty('--color-primary-hover', branding.primaryColor)
  if (branding.headingFont) root.style.setProperty('--brand-heading-font', branding.headingFont)
  if (branding.bodyFont) root.style.setProperty('--brand-body-font', branding.bodyFont)
}
