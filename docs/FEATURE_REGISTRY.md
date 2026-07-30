# Feature Registry

The registry is the source of truth for **what features exist**. Whether an
organisation **has** a feature is data (`FeatureAssignment`); this document
describes the code model that data points at.

- **Definition:** `packages/contracts/src/features.ts` (`FEATURES`)
- **Per-feature config:** `packages/contracts/src/feature-config.ts` (`FEATURE_CONFIG`)
- **Synced to DB:** `syncFeatureRegistry()` in `packages/database/src/entitlements.ts`, run at deploy
- **Validated at boot:** `assertFeatureRegistryValid()` — fatal on a broken registry
- **Current size:** 44 features across 9 categories

## The rule

> A feature's code must exist. What is configuration is *who gets it*, on *what
> plan*, at *what limit*, with *what per-feature settings*. Onboarding a client
> with any combination of existing features is code-free. A genuinely new module
> is one plugin manifest registered here, after which it is assignable like any
> other — the core never changes.

## Manifest shape

```ts
interface FeatureManifest {
  id: string                 // '<category>.<name>', never renamed once shipped
  name: string
  description: string
  category: FeatureCategory  // CRM | Marketing | AI | Automation | Analytics
                             // | Communication | Commerce | Support | Documents
  version: number
  dependencies: string[]     // enforced: enabling a feature pulls its closure
  defaultEnabled: boolean
  billingCategory: 'included' | 'seat' | 'usage' | 'addon' | 'enterprise'
  navEntry?: NavEntry        // sidebar entry when enabled; omitted = invisible
  requiredPermissions: string[]  // RBAC gate (also drives UI affordance hiding)
  apiRoutes: string[]        // route prefixes the feature guard attaches to
  frontendRoutes: string[]   // routes the frontend router gates
  backendModule: string      // the code module that implements it
  custom?: boolean           // true for single-client plugin modules
}
```

## Categories

`CRM` · `Marketing` · `AI` · `Automation` · `Analytics` · `Communication` ·
`Commerce` · `Support` · `Documents`

Each renders as an expandable, searchable section in the admin wizard with bulk
enable/disable — never a flat list.

## Dependency validation

Three functions, all exercised by the resolver and the admin UI:

- `resolveDependencies(ids)` → the full closure, plus what was auto-added.
  Enabling `crm.deals` auto-adds `crm.pipelines`.
- `dependentsOf(id)` → features that break if this is disabled; the UI warns
  before a disable.
- `assertFeatureRegistryValid()` → boot check: no unknown dependency, no
  default-enabled feature with a non-default dependency, no duplicate nav path.

## Per-feature configuration

A feature that needs settings declares a Zod schema in `FEATURE_CONFIG`, keyed by
feature id. The schema does three jobs: validates writes, generates the admin
form, and supplies defaults so a preset can enable the feature **with no manual
configuration**. Example (`ai.voice_calling`): provider, voice provider, caller
id, monthly minute limit, and `identifyAsAi` (defaulted on and legally load-bearing).

`defaultFeatureConfig(id)` and `validateFeatureConfig(id, config)` are the entry
points. A feature with no `FEATURE_CONFIG` entry simply has no settings.

## How each request enforces a feature

```
Authenticated → Tenant-scoped → Subscription active → Feature enabled
  → Permission granted → Under limit → execute
```

`FeatureGuard` reads `@RequiresFeature('crm.contacts')` on a handler and returns
`403 feature_not_enabled` if the organisation's resolved entitlements lack it.
The frontend hides the sidebar item and route for UX; the guard is the security
boundary.

## Adding a feature

1. Add a `FeatureManifest` to `FEATURES` (and a `FEATURE_CONFIG` entry if it has
   settings). CI's boot check validates it.
2. If it needs a backend module, build it; annotate its handlers with
   `@RequiresFeature(id)`.
3. Add it to the relevant plans in `PLANS`, or leave it as a grant-only add-on.
4. Deploy — `syncFeatureRegistry` mirrors it into the `feature` table. It is now
   assignable from the admin portal with zero further code.
