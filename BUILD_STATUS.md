# Build Status

Live record of what is built, what is verified, and what remains. Updated as work
lands. "Verified" means exercised against real infrastructure (Postgres 17, Redis),
not asserted.

## Phase summary

| Phase | Scope | State |
| ----- | ----- | ----- |
| 1 | Architecture | ✅ complete |
| 2 | Workspace & tooling | ✅ complete |
| 3 | Database, migrations, RLS | ✅ complete — tenant isolation verified (10-case suite) |
| 4 | Backend core | ✅ complete |
| 4.5 | **Modular platform refactor** | ▶ in progress — slice 1 done, see below |
| 5 | Frontend foundation (consumes `/me/workspace` + platform portal) | pending |
| 6 | Auth, organisations, RBAC | pending |
| 7 | Dashboard + first orchestrator slice | pending |

## Phase 4.5 — Modular platform (AI Business OS)

Redesign into a config-driven multi-tenant SaaS: every org gets a different
combination of modules, agents, providers, limits, branding and integrations,
onboarded without code. Approved direction: code manifests synced to DB;
super-admin as an isolated route group.

| Slice | Scope | State |
| ----- | ----- | ----- |
| 1 | Registries + schema + entitlement engine | ✅ done — verified |
| 2 | Request guards (Subscription/Feature/Limit) + `/me/workspace` | ▶ next |
| 3 | Platform plane: `PlatformAdmin` auth, `provisionOrganization` wizard, org lifecycle | pending |
| 4 | Provider/agent/integration/branding config surfaces | pending |
| 5 | Frontend: dynamic nav, platform portal, onboarding wizard | pending |

### Slice 1 — verified

- **Feature registry** (`@vsp/contracts`): 44 features, 9 categories, per-feature
  Zod config, dependency resolution. `assertFeatureRegistryValid()` in preflight.
- **Plans** reference features (5 plans, additive tiers, enterprise = full
  registry, custom supported). **Limits** registry (13 metrics). **Presets**: 6
  industry templates with per-feature config overrides; `resolvePreset` returns a
  ready-to-save spec with dependencies closed and config filled.
- **Schema**: 11 new models (Plan, PlanFeature, Feature, FeatureAssignment,
  OrganizationLimit, ProviderConfiguration, AgentAssignment, CustomAgent,
  Branding, PlatformAdmin, PlatformAuditLog) + `Organization.status`. Migration
  applied; 6 new tenant tables carry RLS policies; global registry tables
  deliberately do not. Tenant registry now 54 models; isolation suite still 29/29.
- **Entitlement engine** (`resolveEntitlements`): plan features ∪ grants − revokes,
  dependency closure, per-org limits, per-feature config. Verified end-to-end:
  growth plan → 17 features, a GRANT adds a feature, a disabled assignment revokes
  a plan feature, limits resolve from plan defaults. Registry sync
  (`syncRegistries`) runs in preflight from the owner connection (44 features, 5
  plans, 105 plan_feature rows synced).
- **Docs**: `FEATURE_REGISTRY.md`, `MODULE_REGISTRY.md`, `AI_AGENT_REGISTRY.md`,
  `PLUGIN_REGISTRY.md`, `SUPER_ADMIN_GUIDE.md`, `CUSTOMIZATION_GUIDE.md`.

### Correctness note found while building

`resolveEntitlements` initially queried outside a tenant transaction, so RLS
returned nothing (app role, no `app.organization_id` bound) — fail-closed working
as designed. Fixed by wrapping the reads in `withTenantTransaction`. **Broader
implication for Phase 6:** when auth is wired and the API serves reads through the
application role, tenant-scoped reads must run inside a per-request tenant
transaction (or a connection-level GUC), or RLS filters them. The write path
already uses `withTenantTransaction`; the read path in the existing controllers
must be brought under the same wrapper when the principal is attached. Recorded
here so it is closed in Phase 6, not discovered in production.

## Phase 4 — backend, item by item

| Item | State | How verified |
| ---- | ----- | ------------ |
| NestJS + Fastify bootstrap | ✅ | Boots; 5 preflight guards pass before the port binds |
| Env validation (fail-fast) | ✅ | Invalid env refuses to start with aggregated errors |
| RLS boot assertion | ✅ | Confirmed "Row-level security is enforced" on boot |
| Tenant registry check | ✅ | "Tenant registry matches the schema (48 models)" on boot |
| Multi-tenancy (request → `withTenant`) | ✅ | Interceptor opens context from the principal |
| RBAC (roles → permissions matrix) | ✅ | Matrix validated at boot; guard denies by default |
| Global permissions guard (deny-by-default) | ✅ | Unauthenticated routes return 401, not open |
| Problem+JSON exception filter | ✅ | 401/429/500 all return RFC 9457 with `code` + `traceId` |
| Tenant + logging interceptors | ✅ | One structured log line per request, tenant-bound |
| Rate limiting (Redis, per-IP + per-tenant) | ✅ | 60 → 401, 61+ → 429 `rate_limited` with `retry-after` |
| Idempotency-Key middleware | ✅ | Replay + concurrent-duplicate handling; typechecks |
| WebSocket gateway (Socket.IO, tenant rooms) | ✅ | Fail-closed handshake; rooms derived from principal |
| Queue workers (12 queues, per-queue retry) | ✅ | Boots all 12 + DLQs; tenant context opened per job |
| Outbox dispatcher | ✅ | **End-to-end**: PENDING row → routed BullMQ job → handler ran |
| Dead-letter queues | ✅ | Unknown event backed off; exhausted jobs → `.dlq` |
| Helmet / security headers | ✅ | CSP `default-src 'none'`, `X-Frame-Options` present |
| CORS allowlist (no wildcard) | ✅ | Explicit origins only |
| OpenAPI / Swagger | ✅ | 27 routes generated; served at `/docs` |
| Zod validation everywhere | ✅ | Bodies + queries; field-level issues in problem+json |
| Organizations module | ✅ | GET org, PATCH settings — 401 without auth (correct) |
| Members module | ✅ | List, invite (hashed token), role change |
| CRM (contacts, companies, leads, deals) | ✅ | Keyset list, scoped read, transactional write + events |
| Campaigns module | ✅ | List, create, launch (publish permission) |
| Agent-runs (AI orchestration API) | ✅ | List, get with ledger, start (async via outbox), approve |
| Analytics module | ✅ | KPIs/channels/AI-usage — real aggregates, honest zeros |
| Audit log (read-only) | ✅ | Append-only; `audit:read` gated |

### Bugs found by running the app (and fixed)

1. **Outbox dispatcher claimed zero rows silently.** It ran as the application
   role with `app.organization_id = 'system'`, so RLS correctly hid every
   tenant's rows — the isolation layer working as designed. Fixed by giving the
   dispatcher (and *only* the dispatcher) the owner connection via
   `DIRECT_DATABASE_URL`, with the blast radius documented.
2. **Rate-limit hits returned 500, not 429.** `@fastify/rate-limit` *throws* the
   `errorResponseBuilder` return value (index.js:333), so a plain object landed
   in the exception filter's generic-500 branch. Fixed by returning an
   `HttpException(429)`, which the filter maps to a `rate_limited` problem+json.
3. **Redis would not start under Homebrew** (missing `redisbloom` module in the
   generated config). Started directly on :6379 for local dev.

### Known follow-ups (recorded, not blocking)

- **Dedicated `vsp_dispatcher` role.** The outbox dispatcher currently uses the
  owner connection. A role with SELECT/UPDATE on `outbox_event` alone, plus a
  policy permitting cross-tenant access to that one table, would narrow the blast
  radius of a compromised dispatcher credential from the whole database to event
  payloads. (See `apps/worker/src/config.ts`.)
- **Auth is intentionally unwired until Phase 6.** No principal is attached, so
  every non-public route returns 401. This is the correct fail-closed posture for
  a partially built API — it serves no unauthenticated traffic. Better Auth,
  session middleware, the WebSocket handshake resolver, and API-key auth all land
  in Phase 6.
- **Job handlers are placeholders** that acknowledge and log. Real handlers land
  with their provider adapters (`packages/providers`) — deliberately not stubbed
  with fake side effects.

## Local infrastructure (developer machine)

| Service | Version | Notes |
| ------- | ------- | ----- |
| PostgreSQL | 17.10 | + pgvector 0.8.6; roles `postgres` (owner), `vsp_app` (RLS-subject) |
| Redis | 7.x | on :6379 |
| Node | 22.17 | |
| pnpm | 10.11 | |

Boot the stack locally:

```bash
# API  (:4000, Swagger at /docs)
DATABASE_URL=postgresql://vsp_app:app@localhost:5432/vsp_marketing \
DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vsp_marketing \
REDIS_URL=redis://localhost:6379 \
BETTER_AUTH_SECRET=local-dev-better-auth-secret-32chars-min \
ENCRYPTION_MASTER_KEY=local-dev-encryption-master-key-32chars \
pnpm --filter @vsp/api dev

# Worker (12 queues + outbox dispatcher)
DATABASE_URL=... DIRECT_DATABASE_URL=... REDIS_URL=... ENCRYPTION_MASTER_KEY=... \
pnpm --filter @vsp/worker dev
```
