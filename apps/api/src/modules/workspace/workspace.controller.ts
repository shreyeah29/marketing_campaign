import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { FEATURES, findLimit, findPlan, type NavEntry } from '@marketing-os/contracts'
import {
  applicableLimits as applicableLimitIds,
  withTenantTransaction,
  type DatabaseClient,
  type EntitlementSnapshot,
} from '@marketing-os/database'

import { can, type Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { CurrentEntitlements } from '../../common/decorators/current-entitlements.decorator.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Sidebar section order. Marketing-led: the creative/AI surfaces lead, analytics
 * follows, and CRM sits beneath analytics. Sections not listed fall to the end.
 */
/** Categories retired from the product — mirrors the operator catalog. */
const RETIRED_CATEGORIES = new Set(['Commerce', 'Support', 'Communication', 'Automation'])

/** Sections that no longer render in the client sidebar (pages stay routable). */
const HIDDEN_NAV_SECTIONS = new Set(['AI'])

const SECTION_ORDER: Record<string, number> = {
  Overview: 0,
  'AI Engine': 1,
  Create: 1,
  Channels: 2,
  Marketing: 3,
  AI: 3,
  Automation: 3,
  Analytics: 4,
  CRM: 5,
  Communication: 6,
  Commerce: 7,
  Support: 8,
  Documents: 9,
  Settings: 20,
}

/**
 * The workspace bootstrap endpoint.
 *
 * One call returns everything the frontend needs to render itself for this
 * organisation: which features are on, the navigation tree computed from them,
 * the branding, and a limits snapshot. The sidebar, the routes, the dashboard
 * cards — none are hardcoded; they are derived from this response.
 *
 * The navigation is the intersection of three things: features the organisation
 * has, features that declare a nav entry, and features the *user* has permission
 * to use. A viewer and an admin in the same org get different menus from the same
 * enabled feature set, because a nav entry the user cannot act on is noise.
 *
 * This endpoint is not itself feature-gated — every authenticated user needs it
 * to render anything at all.
 */
@ApiTags('Workspace')
@Controller('me')
export class WorkspaceController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get('workspace')
  @ApiOperation({ summary: 'Everything the frontend needs to render for this organisation' })
  async workspace(
    @CurrentPrincipal() principal: Principal,
    @CurrentEntitlements() entitlements: EntitlementSnapshot,
  ): Promise<unknown> {
    // Wrapped in a tenant transaction so the RLS `app.organization_id` setting is
    // established for these reads. Opening the AsyncLocalStorage context (which the
    // interceptor does) satisfies the Prisma extension, but `Organization` and
    // `Branding` are also RLS-protected, and only the transaction sets the SQL
    // variable the policies read.
    const { org, branding } = await withTenantTransaction(this.db, async (tx) => {
      const [orgRow, brandingRow] = await Promise.all([
        tx.organization.findFirst({
          where: { id: principal.organizationId },
          select: { id: true, name: true, slug: true, industry: true, timezone: true },
        }),
        tx.branding.findFirst(),
      ])
      return { org: orgRow, branding: brandingRow }
    })

    const plan = entitlements.planKey === null ? null : findPlan(entitlements.planKey)

    return {
      user: {
        id: principal.id,
        email: principal.email,
        name: principal.displayName,
        role: principal.role,
        permissions: [...principal.permissions],
      },
      // True when a platform admin is viewing this workspace read-only; the
      // shell shows a banner and the API rejects every mutating request.
      viewOnly: principal.impersonation?.readOnly === true,
      organization: org && {
        id: org.id,
        name: org.name,
        slug: org.slug,
        industry: org.industry,
        timezone: org.timezone,
        status: entitlements.status,
      },
      plan: plan && { key: plan.id, name: plan.name },
      // The flat set, so the frontend can gate a button or a widget on any
      // feature without walking the nav tree.
      enabledFeatures: [...entitlements.features],
      navigation: this.buildNavigation(principal, entitlements),
      branding: branding && {
        displayName: branding.displayName,
        logoUrl: branding.logoUrl,
        logoDarkUrl: branding.logoDarkUrl,
        faviconUrl: branding.faviconUrl,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor,
        headingFont: branding.headingFont,
        bodyFont: branding.bodyFont,
        loginTagline: branding.loginTagline,
      },
      limits: this.buildLimitsSnapshot(entitlements),
    }
  }

  /**
   * Builds the sidebar from enabled features the user may act on.
   *
   * Grouped by section, ordered within a section. A feature contributes its nav
   * entry only if: the org has it, it declares an entry, and the user holds every
   * permission the entry requires. This is the dynamic-navigation requirement made
   * concrete — nothing here is a hardcoded menu.
   */
  private buildNavigation(
    principal: Principal,
    entitlements: EntitlementSnapshot,
  ): { section: string; items: NavEntry[] }[] {
    const visible = FEATURES.filter((feature) => {
      if (feature.navEntry === undefined) return false
      // Retired categories never render, even for orgs still holding stale
      // assignments — the product no longer offers them.
      if (RETIRED_CATEGORIES.has(feature.category)) return false
      // The AI grab-bag section is retired from the sidebar: its useful surfaces
      // (image/video generation) moved into the AI Engine section.
      if (HIDDEN_NAV_SECTIONS.has(feature.navEntry.section)) return false
      if (!entitlements.features.has(feature.id)) return false
      // Every permission the feature requires must be held, or the menu item
      // would lead to a 403.
      return feature.requiredPermissions.every((permission) => can(principal, permission as never))
    })

    const bySection = new Map<string, NavEntry[]>()
    for (const feature of visible) {
      const entry = feature.navEntry
      if (entry === undefined) continue
      const list = bySection.get(entry.section) ?? []
      list.push(entry)
      bySection.set(entry.section, list)
    }

    return (
      [...bySection.entries()]
        .map(([section, items]) => ({
          section,
          items: items.sort((a, b) => a.order - b.order),
        }))
        // Explicit section order (marketing-led workspace): Overview, then the
        // creative/marketing surfaces, then analytics, with CRM below it. Unknown
        // sections fall to the end, tie-broken by their lowest item order.
        .sort((a, b) => {
          const rank = (s: string): number => SECTION_ORDER[s] ?? 90
          return (
            rank(a.section) - rank(b.section) || (a.items[0]?.order ?? 0) - (b.items[0]?.order ?? 0)
          )
        })
    )
  }

  /**
   * The limits that apply to this org, with their definitions.
   *
   * Only limits whose governing feature is enabled appear — showing a voice-minute
   * limit to an org without voice would be noise. Current usage is resolved
   * lazily by the usage endpoints; this is the caps, not the meter.
   */
  private buildLimitsSnapshot(entitlements: EntitlementSnapshot): unknown[] {
    return applicableLimitIds(entitlements)
      .map((metric) => {
        const def = findLimit(metric)
        if (!def) return null
        return {
          metric,
          name: def.name,
          unit: def.unit,
          period: def.period,
          limit: entitlements.limits.get(metric) ?? null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }
}
