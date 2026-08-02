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

/** Inline custom properties written by earlier builds of `applyBranding`. */
const RETIRED_BRAND_PROPERTIES = [
  '--color-primary',
  '--color-primary-hover',
  '--color-accent',
  '--brand-heading-font',
  '--brand-body-font',
]

/**
 * Applies an organisation's branding.
 *
 * White-labelling is logo + display name only (owner decision, 2026-08-02). A
 * tenant no longer repaints the palette or the type: colour carries status
 * meaning in this product, and a per-org repaint would make an amber pill mean
 * something different in every workspace. The logo and name render in the shell;
 * this function's remaining job is to strip the inline custom properties older
 * builds wrote onto `<html>`, which would otherwise survive in a tab that was
 * open across the deploy and keep overriding the design tokens.
 *
 * The `/me/workspace` branding response shape is unchanged — colour and font
 * fields are simply no longer read.
 */
export function applyBranding(_branding: Workspace['branding']): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const property of RETIRED_BRAND_PROPERTIES) root.style.removeProperty(property)
}
