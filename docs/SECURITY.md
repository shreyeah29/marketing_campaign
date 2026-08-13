# Security

The controls that make this platform safe to run for paying customers. Written to
be auditable: each control says what it defends against and where it lives.

## Tenant isolation (three layers)

Isolation is defence in depth — any one layer failing does not expose data.

1. **Request context** (`AsyncLocalStorage`) — the tenant is derived from the
   authenticated principal, never from a request parameter. Opened once, in the
   `TenantInterceptor`, after authentication.
2. **Prisma query extension** — injects `organizationId` into every tenant-scoped
   query and _throws_ if no context is present. A forgotten `where` clause cannot
   leak; it fails closed.
3. **Postgres row-level security** — every tenant table has a policy keyed on
   `app.organization_id`, set transaction-locally by `withTenantTransaction`. The
   app connects as a non-superuser role that RLS actually constrains; boot refuses
   to start if RLS is not enforced (`assertRowLevelSecurityEnforced`).

Identity tables (`user`, `session`, `account`, `verification`) are global by
design — a user spans organisations — and access to org data is always mediated
through `membership`.

## Authentication

See [AUTHENTICATION.md](./AUTHENTICATION.md) for the full flow. Security-relevant
properties:

| Control            | Implementation                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| Password storage   | scrypt (Better Auth), shared with provisioning — never plaintext                    |
| Sessions           | database-backed, HttpOnly cookie, 7-day expiry, sliding 1-day rotation              |
| Cookie flags       | `HttpOnly`, `SameSite=Lax`, `Secure` in production, `mos` prefix                    |
| CSRF               | state-changing requests accepted only from the trusted-origin allowlist             |
| Session revocation | `list-sessions`, `revoke-session`, `revoke-other-sessions`                          |
| Rate limiting      | per-IP (anon) / per-org global limiter + per-endpoint limits on credentials         |
| Account lockout    | Redis, 5 failed logins → 15-min cooldown, per-identifier                            |
| Brute-force        | rate limit (velocity) + lockout (per-account) together                              |
| 2FA                | schema-ready (`user.two_factor_enabled`); enable via Better Auth's twoFactor plugin |
| Auth auditing      | every auth event logged; org-scoped events in the tenant `AuditLog`                 |

### Privilege changes take effect immediately

The principal — role and effective permissions — is re-resolved from `membership`
on **every request**. A role change, a permission grant, or a revocation is live on
the user's next request; there is no stale-token window to wait out. Suspending an
organisation invalidates its entitlement cache immediately, so a suspended tenant
is locked out now, not after a TTL.

## Authorisation

- **Deny by default.** The global `PermissionsGuard` rejects any route that is not
  explicitly `@Public()`. Forgetting a decorator makes a route unreachable, not
  unprotected — the inverse of the previous system's default.
- **Permissions, not roles, are checked.** Guards test `campaigns:publish`, not
  `role === 'ADMIN'`. The role→permission mapping lives in exactly one place.
- **Every request is gated in order:** authenticated → subscription active →
  feature enabled → permission granted → tenant-scoped. A suspended subscription,
  a disabled feature and a missing permission each produce a distinct, correct
  status (403/402-style, 403, 403) rather than a generic failure.

## Platform-admin isolation

The platform-operator plane is a **separate realm**: its own table
(`platform_admin`), its own HMAC bearer tokens signed with a platform-derived key,
no cookies, and no shared session storage with tenants. Nothing a tenant can do
reaches it, and nothing it does can grant tenant access. Its routes are all under
`/v1/platform/*` behind the `PlatformAdminGuard`.

## Secrets & credentials

- **Provider credentials** (customer API keys) are envelope-encrypted (AES-256-GCM,
  per-record data key wrapped by an HKDF-derived master key from
  `ENCRYPTION_MASTER_KEY`). The master key never touches a row; a database dump
  alone decrypts nothing. Only a masked hint is ever returned or logged. This
  replaces the previous system's plaintext key columns.
- **No secrets in source or logs.** Environment is validated at boot with no unsafe
  fallbacks (the previous system shipped a hardcoded JWT secret); the process
  refuses to start on a missing variable.

## Transport & headers

- Helmet with a strict CSP (`default-src 'none'`), `frame-ancestors 'none'`, HSTS
  in production. The API serves JSON only.
- CORS is an explicit origin allowlist with credentials — no wildcard, even in
  development. It covers both the Nest routes and the raw-mounted `/api/auth/*`.
- `trustProxy` so per-client rate limiting and audit see the real client address
  behind the edge TLS terminator.

## Known follow-ups

- Email delivery uses a log transport in development; wire a real provider
  (Resend/SES/SendGrid — already in the provider registry) before production so
  verification and reset emails actually send.
- 2FA is architecturally ready but not enabled; turning it on is adding the plugin
  and its migration.
- Set `REQUIRE_EMAIL_VERIFICATION=true` in production once email delivery is live.
