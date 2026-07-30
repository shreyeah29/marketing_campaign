# Super Admin Guide

The platform-owner portal manages every organisation and is **never visible to
client organisations**. Isolation is by *identity*, not by role: a platform admin
is not a member of any organisation.

## Isolation model

| | Tenant plane | Platform plane |
| --- | --- | --- |
| Identity | `User` + `Membership` | `PlatformAdmin` (separate table) |
| URL namespace | `/v1/*` | `/platform/v1/*` |
| Auth realm | Better Auth session | separate platform login |
| DB connection | application role (RLS applies) | owner role (cross-tenant, audited) |
| Audit | `audit_log` (per org) | `platform_audit_log` (per admin) |

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
   pre-selects features *and* their per-feature config, resolving dependencies —
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

> Status: the registries, entitlement resolver, schema (`PlatformAdmin`,
> `PlatformAuditLog`, `Organization.status`) and preset resolution are built and
> verified. The `/platform/v1` endpoints, the `provisionOrganization` command and
> the portal UI are the next slice.
