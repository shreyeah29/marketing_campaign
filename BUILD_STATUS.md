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
| 4 | Backend core | ✅ complete — see below |
| 5 | Frontend foundation | ▶ next |
| 6 | Auth, organisations, RBAC | pending |
| 7 | Dashboard + first orchestrator slice | pending |

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
