# API Status

Endpoint inventory and status. `✅` verified end-to-end against the running app.

## Realms

- **Tenant credential** — `/api/auth/*` (Better Auth, raw-mounted on Fastify).
- **Tenant app** — `/v1/*` (Nest, session cookie → principal).
- **Platform operator** — `/v1/platform/*` (separate realm, HMAC bearer).

## Authentication — `/api/auth/*` (Better Auth)

| Method   | Path                                                                     | Status                              |
| -------- | ------------------------------------------------------------------------ | ----------------------------------- |
| POST     | `/api/auth/sign-up/email`                                                | ✅ register                         |
| POST     | `/api/auth/sign-in/email`                                                | ✅ login (+ lockout, rate limit)    |
| POST     | `/api/auth/sign-out`                                                     | ✅ logout                           |
| GET      | `/api/auth/get-session`                                                  | ✅                                  |
| POST     | `/api/auth/forget-password`                                              | ✅ sends reset link (logged in dev) |
| POST     | `/api/auth/reset-password`                                               | ✅                                  |
| GET      | `/api/auth/verify-email`                                                 | ✅                                  |
| GET/POST | `/api/auth/list-sessions` · `/revoke-session` · `/revoke-other-sessions` | ✅ built-in                         |

## Org-awareness — `/v1/auth/*`

| Method | Path                           | Status                                          |
| ------ | ------------------------------ | ----------------------------------------------- |
| GET    | `/v1/auth/session`             | ✅ identity + orgs + active + needsOrganization |
| GET    | `/v1/auth/organizations`       | ✅ switcher source                              |
| POST   | `/v1/auth/switch-organization` | ✅ re-resolves role/perms/features              |
| POST   | `/v1/auth/leave-organization`  | ✅ refused for sole owner                       |
| POST   | `/v1/auth/transfer-ownership`  | ✅ owner-only                                   |
| POST   | `/v1/auth/invitations/accept`  | ✅ email-bound, joins + activates               |

## Workspace & members — `/v1/*`

| Method   | Path                                                                       | Status                                     |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| GET      | `/v1/me/workspace`                                                         | ✅ dynamic nav, features, limits, branding |
| GET      | `/v1/members`                                                              | ✅                                         |
| GET      | `/v1/members/roles`                                                        | ✅ role templates + permissions            |
| GET/POST | `/v1/members/invitations`                                                  | ✅ list / invite (emails token)            |
| POST     | `/v1/members/invitations/:id/resend`                                       | ✅                                         |
| DELETE   | `/v1/members/invitations/:id`                                              | ✅ revoke                                  |
| PATCH    | `/v1/members/:id/role`                                                     | ✅ (last-owner protected)                  |
| PATCH    | `/v1/members/:id/permissions`                                              | ✅ custom grants                           |
| GET      | `/v1/organization` · `/v1/config/*` · CRM · campaigns · agents · analytics | ✅ reads run in tenant tx (RLS)            |

## Platform operator — `/v1/platform/*`

| Method | Path                                              | Status                                   |
| ------ | ------------------------------------------------- | ---------------------------------------- |
| POST   | `/v1/platform/auth/login`                         | ✅                                       |
| GET    | `/v1/platform/catalog`                            | ✅ features/plans/presets                |
| POST   | `/v1/platform/organizations`                      | ✅ provisioning wizard (owner loginable) |
| GET    | `/v1/platform/organizations[/:id]`                | ✅ list / detail + usage                 |
| PATCH  | `/v1/platform/organizations/:id/status` · `/plan` | ✅                                       |
| PUT    | `/v1/platform/organizations/:id/features`         | ✅                                       |
| POST   | `/v1/platform/organizations/:id/clone`            | ✅                                       |

## Cross-cutting (verified)

- Deny-by-default auth; 401 without a session, 403 without the permission.
- Subscription gate: suspended org → 403 "workspace is suspended".
- Feature gate: a route for a disabled feature → 403 feature-not-enabled.
- Account lockout: 5 failed logins → 429 even with the correct password.
- CORS preflight covers `/api/auth/*` and `/v1/*` with credentials.
