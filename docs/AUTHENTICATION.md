# Authentication & Identity

Phase 6. Tenant authentication is [Better Auth](https://better-auth.com); org/role
resolution is ours. This document is the map of how a request becomes an
authenticated, organisation-scoped, permission-bearing principal — and how the
tenant realm stays completely separate from the platform-admin realm.

## Two realms, never crossed

| | Tenant realm | Platform-admin realm |
| --- | --- | --- |
| Who | A customer's users | The platform operator |
| Store | `user` / `session` / `account` / `verification` | `platform_admin` |
| Credential | Better Auth (scrypt), cookie session | Salted hash, HMAC bearer token |
| Cookie | `vsp.session_token` (HttpOnly) | none — `Authorization: Bearer` |
| Entry | `/api/auth/*`, `/v1/auth/*` | `/v1/platform/*` |

There is **no shared session table, no shared login, no shared cookie**. Nothing
in the tenant realm can grant platform access, and nothing in the platform realm
can grant tenant access. They are different tables, different secrets, different
transports.

## The credential lifecycle (Better Auth)

Mounted on the raw Fastify instance at `/api/auth/*`, outside the Nest pipeline —
reaching them cannot require a session, since they are how one is obtained.

| Action | Endpoint |
| --- | --- |
| Register | `POST /api/auth/sign-up/email` |
| Login | `POST /api/auth/sign-in/email` |
| Logout | `POST /api/auth/sign-out` |
| Current session | `GET /api/auth/get-session` |
| Send verification | `POST /api/auth/send-verification-email` |
| Verify email | `GET /api/auth/verify-email?token=…` |
| Request reset | `POST /api/auth/forget-password` |
| Reset password | `POST /api/auth/reset-password` |
| List sessions | `GET /api/auth/list-sessions` |
| Revoke a session | `POST /api/auth/revoke-session` |
| Revoke others | `POST /api/auth/revoke-other-sessions` |

- **Password hashing** is Better Auth's scrypt, exported through
  `modules/auth/password.ts` and shared with provisioning, so a provisioned owner
  can log in immediately with no separate activation.
- **Sessions** are database-backed, 7-day expiry with a sliding 1-day refresh
  (rotation). "Remember me" is the persistent default; a client sending
  `rememberMe: false` gets a session that dies with the browser.
- **Email** (verification, reset) goes through the `EmailPort`. In development the
  `LogEmailTransport` prints the link to the server log, so the whole flow is
  exercisable with no mail provider. `REQUIRE_EMAIL_VERIFICATION` gates whether an
  unverified user may log in (off in dev, on in prod).

## How a request becomes a principal

Ordering matters and is the crux of the design.

```
request
  → AuthGuard        (global, runs FIRST)   — session → identity → principal
  → EntitlementGuard (subscription active? feature enabled?)
  → PermissionsGuard (permission granted?)
  → TenantInterceptor (opens the RLS tenant context for the handler)
  → handler
```

`AuthGuard` (`modules/auth/auth.guard.ts`) is the one place a Better Auth session
becomes a `Principal`. It **never rejects** — "who are you" is separate from "may
you". Resolution is two-stage:

1. A valid session yields an **identity** (the user), attached always.
2. If the session has an active organisation the user still belongs to, a
   **principal** (user + org + role + permissions) is attached too.

A user with no organisation — freshly registered, not yet invited — keeps their
identity but gets no principal: org routes 401, identity routes (`/v1/auth/*`)
still work. The active organisation lives on `session.activeOrganizationId`; when
unset, the user's first live membership is chosen and persisted.

Permissions are resolved **once**, here: the role's permissions from the RBAC
matrix (`common/rbac/permissions.ts`) unioned with the membership's per-member
grants. Nothing downstream re-derives them.

### The read-path / RLS detail

The tenant context has two mechanisms that must both be satisfied for a
tenant-scoped or RLS-protected query:

- The **AsyncLocalStorage context** (opened by `withTenant`) — the Prisma
  extension reads it to inject `organizationId` and to refuse an unscoped query.
- The **`app.organization_id` SQL setting** (set by `withTenantTransaction`) —
  Postgres row-level security policies read it.

The `TenantInterceptor` opens the ALS context, but only `withTenantTransaction`
sets the SQL variable. So every handler DB access — reads included — runs inside
`withTenantTransaction`. Entitlement resolution runs in the *guard* phase, before
the interceptor, so `EntitlementService.resolve` opens its own `withTenant`.

## Organisation awareness (`/v1/auth/*`)

Better Auth answers *who*; these answer *which organisation, and which others*.
They are identity routes (`@Public()` to skip the org-permission guard,
authenticated by `@CurrentIdentity()`), so a user with no org, or choosing between
several, can call them.

| Route | Purpose |
| --- | --- |
| `GET /v1/auth/session` | Identity + every org it can act in + the active one |
| `GET /v1/auth/organizations` | Organisations the user belongs to (the switcher) |
| `POST /v1/auth/switch-organization` | Set the active org for this session |
| `POST /v1/auth/leave-organization` | Leave an org (refused for a sole owner) |
| `POST /v1/auth/transfer-ownership` | Owner-only; new owner promoted, old → ADMIN |
| `GET /v1/me/workspace` | The full render payload once an org is active |

A user may belong to **many organisations**; switching rewrites
`session.activeOrganizationId`, and the next request resolves the new org's role
and permissions.

## Roles & permissions

Five built-in roles, each a strict superset of the one below:

`VIEWER ⊂ MEMBER ⊂ MANAGER ⊂ ADMIN ⊂ OWNER`

Roles are what customers administer; **permissions** are what the code checks. The
mapping lives only in `common/rbac/permissions.ts`. Per-member **grants** are
additive on top of a role (custom roles without a new role type); there is no
subtractive mechanism by design. Ownership is not invitable — it transfers through
the explicit, owner-guarded flow.

## Security posture

See [SECURITY.md](./SECURITY.md) for the full list. In brief: HttpOnly + SameSite
cookies (Secure in prod), CSRF via a trusted-origin allowlist, rate limiting on
the credential endpoints, Redis-backed account lockout, session rotation and
revocation, every auth event audited, and a 2FA-ready schema (`user.two_factor_enabled`).
