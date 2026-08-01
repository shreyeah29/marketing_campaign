# Super Admin Guide

The platform-owner portal manages every organisation and is **never visible to
client organisations**. Isolation is by _identity_, not by role: a platform admin
is not a member of any organisation.

## Isolation model

|               | Tenant plane                   | Platform plane                     |
| ------------- | ------------------------------ | ---------------------------------- |
| Identity      | `User` + `Membership`          | `PlatformAdmin` (separate table)   |
| URL namespace | `/v1/*`                        | `/platform/v1/*`                   |
| Auth realm    | Better Auth session            | separate platform login            |
| DB connection | application role (RLS applies) | owner role (cross-tenant, audited) |
| Audit         | `audit_log` (per org)          | `platform_audit_log` (per admin)   |

There is no row linking a platform admin to a tenant's user space, so the tenant
API cannot see the platform plane exists.

## Roles

- `SUPER_ADMIN` — full control, including creating other platform admins.
- `OPERATOR` — manage organisations, not other admins.
- `SUPPORT` — read-only: usage, billing, logs.

## Onboarding a client (the wizard)

The goal: create a fully-configured client with no code. Steps:

1. **Company** — name, slug, industry, email, website, phone, country, timezone.
2. **Admin user** — name, email, password (first `OWNER` of the org).
3. **Plan** — Starter / Growth / Business / Enterprise / Custom.
4. **Preset (optional, recommended)** — pick an industry template (Marketing
   Agency, Law Firm, Medical Clinic, E-commerce, Real Estate, Simple CRM). It
   pre-selects features _and_ their per-feature config, resolving dependencies —
   so onboarding is a template pick, not forty checkboxes.
5. **Features** — adjust the preset: expandable categories, search, bulk enable.
6. **AI / providers / integrations / limits / branding** — all optional; defaults
   applied from the plan and preset.
7. **Save** — one transactional `provisionOrganization` command creates the org,
   admin, subscription, feature assignments (with config), limits and branding
   atomically, and emits `iam.organization.created`.

## Lifecycle operations

Create · Edit · **Suspend** (org rejected by the SubscriptionGuard before any
feature check) · Activate · Delete · Upgrade/Downgrade plan · **Clone** (copy an
org's feature+config bundle to a new org) · View usage / billing / logs / AI
usage / storage / active users.

> Status: the platform-admin realm, `provisionOrganization` command and lifecycle
> endpoints are **built and verified end-to-end** — one call provisions a fully
> configured org from a preset, and suspend/plan/features/clone all work with cache
> invalidation and audit. Endpoints live under `/v1/platform/*`, guarded by
> `PlatformAdminGuard` (a separate realm; tenants get 401). The portal UI is Phase 5. First super-admin: `PlatformAuthService.ensureBootstrapAdmin` (seed/CLI in
> Phase 6).

## Endpoints (built)

| Method | Path                                      | Purpose                                     |
| ------ | ----------------------------------------- | ------------------------------------------- |
| POST   | `/v1/platform/auth/login`                 | Platform admin login → token                |
| GET    | `/v1/platform/catalog`                    | Features/plans/presets for the wizard       |
| POST   | `/v1/platform/organizations`              | Provision a fully-configured org            |
| GET    | `/v1/platform/organizations`              | List all orgs                               |
| GET    | `/v1/platform/organizations/:id`          | Detail + usage (members, contacts, AI cost) |
| PATCH  | `/v1/platform/organizations/:id/status`   | Suspend / activate / delete                 |
| PATCH  | `/v1/platform/organizations/:id/plan`     | Change plan (re-syncs plan features)        |
| PUT    | `/v1/platform/organizations/:id/features` | Set the enabled feature set                 |
| POST   | `/v1/platform/organizations/:id/clone`    | Clone an org's bundle to a new org          |
