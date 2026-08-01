# Plugin Registry

How a genuinely new module — built for one client or shared — is added **without
modifying the core**.

## What a plugin is

A package that registers manifests into the existing registries:

- **Feature manifests** → `FEATURES` (via a registration hook), synced to the
  `feature` table. Gives the plugin navigation, permissions, billing category,
  API/frontend routes.
- **Provider adapters** (optional) → implement a port from `@vsp/ai-core`,
  register in the provider registry. Gives per-org selectability.
- **Custom agents** (optional) → `CustomAgent` rows or manifest registration.
- **Tools** (optional) → `ToolDefinition`s registered into the tool registry.

Because navigation, permissions, billing, audit, limits and the API guard are all
driven by the manifest, a registered plugin integrates with every one of them the
moment it is assigned to an organisation.

## What the core provides the plugin for free

| Concern        | Mechanism                                               |
| -------------- | ------------------------------------------------------- |
| Navigation     | `FeatureManifest.navEntry` → dynamic sidebar            |
| Access control | `requiredPermissions` (RBAC) + feature guard            |
| Billing        | `billingCategory` + plan/assignment                     |
| Audit          | every mutating command writes the append-only audit log |
| Limits         | `LimitDefinition` + `OrganizationLimit`                 |
| Multi-tenancy  | tenant-scoped client + RLS, automatically               |
| API surface    | `@RequiresFeature` + the standard controller shape      |

## Example — a single-client custom module

`AI Legal Assistant` for one law firm:

1. Plugin package declares `{ id: 'custom.legal_assistant', category: 'AI',
custom: true, ... }` and its controller/tools.
2. Registered at boot; synced to the `feature` table (`is_custom = true`).
3. Assigned to that one organisation via the admin portal (`source: CUSTOM`).
4. It now appears in that firm's sidebar, respects its permissions and limits,
   writes to its audit log, and bills on its plan — and is invisible to every
   other organisation. **Zero changes to core code.**

> Status: the registration hook and provider registry land in a later slice; the
> data model (`Feature.isCustom`, `FeatureAssignment.source = CUSTOM`,
> `CustomAgent`) is in place now.
