# Marketing OS — Developer Guide

Complete developer documentation for the platform: a multi-tenant AI marketing SaaS
built as a pnpm + Turborepo monorepo (NestJS/Fastify API, Next.js frontend, BullMQ
worker, PostgreSQL + pgvector, Redis/Valkey).

> This is the current, authoritative developer reference. Older topic docs live
> alongside it in `docs/` (`ARCHITECTURE.md`, `AUTHENTICATION.md`, `SECURITY.md`,
> `FEATURE_REGISTRY.md`, …) and go deeper on individual subjects.

## Table of contents

1. [System architecture](#1-system-architecture)
2. [Folder structure](#2-folder-structure)
3. [Database schema](#3-database-schema)
4. [Module descriptions](#4-module-descriptions)
5. [API documentation](#5-api-documentation)
6. [Environment variables](#6-environment-variables)
7. [Worker architecture](#7-worker-architecture)
8. [Queue architecture](#8-queue-architecture)
9. [Background jobs](#9-background-jobs)
10. [AI flow](#10-ai-flow)
11. [Campaign generation flow](#11-campaign-generation-flow)
12. [RAG pipeline](#12-rag-pipeline)
13. [Local development setup](#13-local-development-setup)
14. [Deployment guide](#14-deployment-guide)
15. [Troubleshooting guide](#15-troubleshooting-guide)

---

## 1. System architecture

Three deployable applications share a set of internal packages:

```
                         ┌───────────────────────────┐
   Browser  ───────────► │  apps/web  (Next.js)      │  Vercel
                         │  App Router, RSC + client │
                         └────────────┬──────────────┘
                                      │ HTTPS  (fetch, credentials: include)
                                      ▼
                         ┌───────────────────────────┐
                         │  apps/api  (NestJS/Fastify)│  Render (web service)
                         │  /v1 REST, Better Auth,    │
                         │  guards, RLS, Swagger      │
                         └───┬───────────────┬────────┘
             DATABASE_URL    │               │  BullMQ enqueue (Redis)
             (vsp_app, RLS)  ▼               ▼
                   ┌──────────────────┐  ┌──────────────────────────┐
                   │ PostgreSQL 16    │  │  apps/worker (BullMQ)    │  Render (bg worker)
                   │ + pgvector + RLS │◄─┤  executors, pollers,     │
                   └──────────────────┘  │  outbox dispatcher       │
                          ▲              └───────────┬──────────────┘
       DIRECT_DATABASE_URL│  (owner, migrations,     │  Redis / Valkey
       + cross-tenant infra│  outbox, embeddings)    ▼
                          └───────────────────  BullMQ queues
```

### Core principles

- **Multi-tenant with 3 layers of isolation** (defence in depth):
  1. **Request context** — `AsyncLocalStorage` carries the `organizationId` for the
     duration of a request/job (`packages/database/src/tenant-context.ts`).
  2. **Prisma client extension** — auto-injects `organizationId` into every query
     for tenant-scoped models and refuses unsafe operations
     (`packages/database/src/tenant-scope.ts`, model list in `model-registry.ts`).
  3. **PostgreSQL Row-Level Security** — every tenant table has a `tenant_isolation`
     policy keyed on a transaction-local `app.organization_id` set by
     `withTenantTransaction`. Even a bug in layers 1–2 cannot cross tenants.
- **Fail-closed**: a query with no tenant context returns zero rows (RLS), never a
  cross-tenant read. The API refuses to boot if its DB role is _not_ subject to RLS.
- **Two database roles**: the app connects as `vsp_app` (RLS-subject) via
  `DATABASE_URL`; migrations, seeds, the outbox dispatcher and the embeddings/
  schedule pollers use the owner role via `DIRECT_DATABASE_URL` (they must read
  across tenants by design).
- **Modular platform**: what a feature _is_ lives in code (`packages/contracts`);
  whether an org _has_ it is data (`FeatureAssignment`). Entitlement = plan ∪ grants
  − revokes. Registries are synced into DB tables at API boot (`syncRegistries`).
- **Transactional outbox**: domain events are written in the same transaction as
  the state change (`outbox_event`) and relayed to queues by a polling dispatcher —
  at-least-once, never lost.
- **Platform-managed AI**: one operator-owned `OPENAI_API_KEY` powers all AI for
  every tenant. Customers never configure providers or keys.

### Tech stack

| Layer    | Technology                                                         |
| -------- | ------------------------------------------------------------------ |
| Frontend | Next.js (App Router), React, hand-rolled CSS design system         |
| API      | NestJS on Fastify, Zod validation, Swagger, Better Auth            |
| Worker   | BullMQ on Redis/Valkey, `tsx` runtime                              |
| Database | PostgreSQL 16, Prisma ORM, pgvector, citext, pg_trgm, RLS          |
| Auth     | Better Auth (tenant realm) + a separate platform-admin token realm |
| Monorepo | pnpm workspaces + Turborepo, TypeScript (ESM)                      |
| Errors   | RFC 9457 `application/problem+json`                                |

---

## 2. Folder structure

```
marketing/
├── apps/
│   ├── api/                      # NestJS/Fastify REST API (:4000)
│   │   ├── src/
│   │   │   ├── main.ts           # bootstrap: preflight, syncRegistries, guards
│   │   │   ├── app.module.ts     # controllers + providers + global guards
│   │   │   ├── config/env.ts     # Zod-validated environment
│   │   │   ├── common/           # crud, guards, rbac, http, crypto, filters, interceptors
│   │   │   ├── infrastructure/   # database.module, mailer, redis, rate-limit
│   │   │   ├── modules/          # feature modules (see §4)
│   │   │   └── scripts/          # ops scripts (grant-features, ensure-default-pipeline)
│   │   └── .env
│   ├── web/                      # Next.js frontend (:3000)
│   │   └── src/
│   │       ├── app/              # routes (App Router)
│   │       │   ├── (auth)/       # login, register, forgot/reset, accept-invitation
│   │       │   ├── app/          # tenant shell + all product pages
│   │       │   ├── platform/     # operator console
│   │       │   ├── f/[slug]/     # public hosted lead form
│   │       │   └── p/[slug]/     # public hosted landing page
│   │       ├── components/       # kit.tsx, ui.tsx, resource-page.tsx, charts.tsx…
│   │       └── lib/              # api.ts, auth-client.ts, workspace.ts, resource.ts
│   └── worker/                   # BullMQ background worker
│       └── src/
│           ├── main.ts           # workers, dispatcher, schedule poller
│           ├── queues.ts         # queue names + per-queue policies
│           ├── config.ts         # worker env
│           ├── outbox-dispatcher.ts
│           ├── schedule-poller.ts    # email delivery + social publishing
│           ├── workflow/executor.ts  # workflow engine executor
│           └── embeddings/indexer.ts # RAG document indexer
├── packages/
│   ├── database/                 # Prisma schema, client, RLS, tenant scope, outbox
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── scripts/provision-app-role.sql
│   │   └── src/{client,tenant-scope,tenant-context,entitlements,outbox,model-registry}.ts
│   ├── contracts/               # feature/plan/preset registries, events, providers, pagination
│   ├── ai-core/                 # agent roster, model catalog, cost governance, ports
│   ├── observability/           # structured logger + redaction
│   ├── providers/               # provider integration stubs
│   └── config/                  # shared config
├── docs/                        # this guide + topic docs
├── package.json                 # root scripts (turbo)
├── turbo.json
└── pnpm-workspace.yaml
```

---

## 3. Database schema

- **Engine**: PostgreSQL 16 with extensions `citext`, `pg_trgm`, `vector` (pgvector).
- **ORM**: Prisma (`packages/database/prisma/schema.prisma`), ~84 models.
- **Isolation**: every tenant table carries `organization_id` and a `tenant_isolation`
  RLS policy; parent-scoped tables (e.g. `pipeline_stage`) are protected by an
  `EXISTS` policy against their parent. The canonical scoping lists live in
  `packages/database/src/model-registry.ts` (`TENANT_SCOPED_MODELS`,
  `PARENT_SCOPED_MODELS`, `GLOBAL_MODELS`).

### Model groups

| Group              | Key models                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity (global)  | `User`, `Session`, `Account`, `Verification`, `Organization`                                                                                                                                                                             |
| Tenancy / platform | `Membership`, `Invitation`, `OrganizationSettings`, `Subscription`, `Plan`, `Feature`, `FeatureAssignment`, `PlanFeature`, `OrganizationLimit`, `Branding`, `ProviderConfiguration`, `PlatformAdmin`                                     |
| CRM                | `Company`, `Contact`, `Lead`, `Pipeline`, `PipelineStage`, `Deal`, `Activity`, `Task`, `Appointment`, `Note`                                                                                                                             |
| Marketing          | `Campaign`, `CampaignChannel`, `CampaignAsset`, `CampaignAssetComment`, `LeadForm`, `FormSubmission`, `LandingPage`, `EmailCampaign`, `EmailSequence`, `EmailSend`, `SocialAccount`, `SocialPost`, `SocialPostTarget`, `MessageTemplate` |
| Comms              | `Conversation`, `Message`, `PhoneNumber`, `Call`                                                                                                                                                                                         |
| AI / RAG           | `Prompt`, `PromptVersion`, `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk` (pgvector), `AiUsage`, `AgentRun`, `AgentRunStep`, `ToolCall`, `CustomAgent`, `AgentAssignment`                                                        |
| Automation         | `Workflow`, `WorkflowVersion`, `WorkflowRun`, `WorkflowRunStep`, `Webhook`, `WebhookDelivery`                                                                                                                                            |
| Analytics          | `MetricDaily`, `AttributionTouch`, `UsageRecord`                                                                                                                                                                                         |
| Support            | `SupportTicket`, `SupportTicketComment`                                                                                                                                                                                                  |
| Platform infra     | `OutboxEvent`, `AuditLog`, `PlatformAuditLog`, `Notification`, `IdempotencyKey`, `ApiKey`, `Template`, `TemplateInstall`, `IntegrationConnection`, `ProviderCredential`                                                                  |

### Migrations (`packages/database/prisma/migrations/`)

| Migration                            | Contents                                                             |
| ------------------------------------ | -------------------------------------------------------------------- |
| `…_init`                             | Base schema + extensions (citext, pg_trgm, vector) + all core tables |
| `…_row_level_security`               | `app.current_organization_id()` + `tenant_isolation` policies        |
| `…_modular_platform`                 | Feature/Plan/limit tables                                            |
| `…_campaign_assets`                  | AI review-queue tables                                               |
| `…_lead_forms_landing_pages_support` | LeadForm, FormSubmission, LandingPage, SupportTicket(+Comment)       |
| `…_email_send_claim`                 | `EmailSend.SENDING` status + `attempts` (worker claim/retry)         |

RLS blocks are **hand-appended** to each migration (Prisma does not generate them).
Migrations run as the **owner** role via `DIRECT_DATABASE_URL`.

### The pgvector RAG tables

- `KnowledgeDocument`: `content`, `contentHash`, `status` (GenerationStatus
  `PENDING|QUEUED|PROCESSING|READY|FAILED|CANCELED`), `chunkCount`, `indexedAt`.
- `KnowledgeChunk`: `content`, `position`, and `embedding vector(1536)` (Prisma
  `Unsupported("vector(1536)")` — written/queried via raw SQL). Cosine search uses
  the `<=>` operator; `score = 1 - (embedding <=> query)`.

---

## 4. Module descriptions

API feature modules (`apps/api/src/modules/*`). Each is a set of controllers +
optional services; cross-cutting concerns (auth, entitlements, permissions,
logging, tenant context) are applied globally.

| Module          | Responsibility                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | Better Auth mount, `AuthGuard` (session → Principal), identity, lockout, email port                                                                  |
| `organizations` | Org profile + settings                                                                                                                               |
| `members`       | Members, roles, invitations                                                                                                                          |
| `crm`           | Contacts, Companies, Leads, Deals, Pipelines, Tasks, Notes                                                                                           |
| `marketing`     | Email campaigns, message templates, social posts, **review queue** (AI assets), **lead forms** (+ public), campaign generation                       |
| `content`       | Landing pages (+ public render)                                                                                                                      |
| `social`        | Social account connections + composer/scheduler                                                                                                      |
| `ai`            | Chat, copywriter, image, voice, history; `AiService`, `CampaignGenerationService`, `KnowledgeService`; prompts; knowledge bases + documents + search |
| `automation`    | Workflows, versioned graphs, runs, webhooks; `WorkflowEngineService`                                                                                 |
| `analytics`     | Overview, timeseries, funnel, channel performance, AI usage, audit logs                                                                              |
| `comms`         | Conversations + messages (Inbox)                                                                                                                     |
| `campaigns`     | Campaign records + launch                                                                                                                            |
| `agents`        | Agent runs                                                                                                                                           |
| `notifications` | In-app notifications                                                                                                                                 |
| `support`       | Support tickets                                                                                                                                      |
| `settings`      | API keys, provider config                                                                                                                            |
| `config`        | Provider/branding/agent configuration surface                                                                                                        |
| `workspace`     | `/me/workspace` bootstrap (nav, branding, plan, user)                                                                                                |
| `platform`      | Operator console realm (provisioning, org management) — separate auth                                                                                |
| `realtime`      | WebSocket gateway                                                                                                                                    |
| `health`        | Liveness/readiness                                                                                                                                   |

Frontend mirrors these under `apps/web/src/app/app/*`. Most list/CRUD pages are
generated from the shared `ResourcePage` component (search + cursor pagination +
create/edit drawer + delete + all states). Bespoke pages: dashboard, analytics,
campaigns (kanban), workflow builder, inbox, knowledge base detail, forms/pages
builders.

---

## 5. API documentation

- **Base URL**: `/v1` (global prefix; `health` is exempt). Better Auth mounts at
  `/api/auth/*`.
- **Auth**: session cookie (Better Auth) for the tenant app; `Authorization: Bearer`
  for API keys; a separate bearer token for the platform realm.
- **Validation**: Zod on every body/untrusted query → `400` with issue list.
- **Errors**: RFC 9457 `application/problem+json` with a stable `code` and `traceId`.
- **Pagination**: opaque **cursor** (keyset) pagination — `?cursor&limit`, response
  `{ data, nextCursor, hasMore }`. (No offset paging — a concurrent write can't make
  a client skip/duplicate rows.)
- **Docs**: Swagger UI at `/docs` when `SWAGGER_ENABLED=true`.

### Guard pipeline (global, in order)

`AuthGuard` (resolve session → `Principal`, never rejects) → `EntitlementGuard`
(`@RequiresFeature('…')` — plan/subscription active + feature enabled) →
`PermissionsGuard` (`@RequirePermissions(PERMISSIONS.X)` — RBAC). `@Public()` bypasses
all three. Permissions are checked, never roles directly.

### Route groups (base paths, all under `/v1`)

```
Auth/session   /auth            /me
CRM            /contacts /companies /leads /deals /pipelines /tasks /notes
Marketing      /email-campaigns /message-templates /social-posts /social
               /campaign-assets  /campaigns  /lead-forms  /landing-pages
Public         /public/forms/:slug   /public/pages/:slug          (@Public)
AI             /ai   /prompts   /knowledge-bases
Comms          /conversations
Automation     /workflows   /workflow-runs   /webhooks
Analytics      /analytics   /audit-logs   /agent-runs
Platform infra /notifications /api-keys /organization /members /support/tickets
Operator       /platform                                          (platform realm)
Health         /health                                            (@Public)
```

### Representative endpoints (recently completed)

**Inbox** (`/conversations`)

- `POST /conversations` — create a conversation (`channel` default `WEB_CHAT`).
- `GET /conversations/:id/messages?cursor&limit` — paginated history (newest-first).
- `POST /conversations/:id/messages` — send/record `{ body, direction? }` (OUTBOUND default).
- `POST /conversations/:id/read` — clear unread + mark inbound READ.

**Knowledge / RAG** (`/knowledge-bases`)

- CRUD on knowledge bases (list/create/update/delete).
- `GET /:id/documents` — list documents (+ `indexingAvailable`).
- `POST /:id/documents` — add extracted text `{ title, content, mimeType?, sourceType? }` → enqueues indexing.
- `POST /:id/documents/:docId/reprocess` — re-chunk + re-embed.
- `DELETE /:id/documents/:docId` — delete document + chunks.
- `POST /:id/search` — semantic search `{ query, k? }` → `{ results: [{ documentTitle, content, score }] }`.

**Deals selectors** (`/pipelines`)

- `GET /pipelines/options` — pipelines with nested stages, for dependent dropdowns.

---

## 6. Environment variables

### API (`apps/api/src/config/env.ts`) — Zod-validated; the API refuses to boot if invalid

| Variable                     | Required | Default                                      | Purpose                                                    |
| ---------------------------- | -------- | -------------------------------------------- | ---------------------------------------------------------- |
| `NODE_ENV`                   | no       | `development`                                | Runtime mode                                               |
| `LOG_LEVEL`                  | no       | `info`                                       | Pino level                                                 |
| `API_PORT`                   | no       | `4000`                                       | Listen port                                                |
| `API_HOST`                   | no       | `0.0.0.0`                                    | Listen host                                                |
| `DATABASE_URL`               | **yes**  | —                                            | App role (`vsp_app`), RLS-subject                          |
| `DIRECT_DATABASE_URL`        | no*      | —                                            | Owner role — migrations, public slug lookups (SYSTEM_DB)   |
| `REDIS_URL`                  | **yes**  | —                                            | BullMQ / cache                                             |
| `CORS_ALLOWED_ORIGINS`       | no       | `http://localhost:3000`                      | Comma-separated origins                                    |
| `BETTER_AUTH_SECRET`         | **yes**  | —                                            | Session signing (≥32 chars)                                |
| `BETTER_AUTH_URL`            | no       | —                                            | API base for auth links                                    |
| `APP_URL`                    | no       | `http://localhost:3000`                      | Frontend base for email links                              |
| `EMAIL_FROM`                 | no       | `Marketing OS <no-reply@marketing-os.local>` | Mail From                                                  |
| `RESEND_API_KEY`             | no       | —                                            | Email delivery (Resend REST); unset → mailer logs          |
| `REQUIRE_EMAIL_VERIFICATION` | no       | prod=on                                      | Gate first login on verified email                         |
| `ENCRYPTION_MASTER_KEY`      | **yes**  | —                                            | Envelope encryption of provider creds (≥32 chars)          |
| `OPENAI_API_KEY`             | no       | —                                            | Platform AI (chat/copywriter/image/voice/embeddings query) |
| `OPENAI_MODEL`               | no       | —                                            | LLM model id (e.g. `gpt-5.4-mini`)                         |
| `SWAGGER_ENABLED`            | no       | —                                            | Expose `/docs`                                             |
| `SENTRY_DSN`                 | no       | —                                            | Error reporting                                            |

\* Strongly recommended in production; required for public form/page resolution
(`SYSTEM_DB`) and for running migrations.

### Worker (`apps/worker/src/config.ts`)

| Variable                | Required | Purpose                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `NODE_ENV`, `LOG_LEVEL` | no       | Runtime/logging                                                         |
| `DATABASE_URL`          | **yes**  | App role (RLS applies to job handlers)                                  |
| `DIRECT_DATABASE_URL`   | **yes**  | Owner — outbox dispatcher + schedule poller + embeddings (cross-tenant) |
| `REDIS_URL`             | **yes**  | BullMQ                                                                  |
| `ENCRYPTION_MASTER_KEY` | **yes**  | Decrypt provider credentials                                            |
| `RESEND_API_KEY`        | no       | Email delivery (schedule poller)                                        |
| `EMAIL_FROM`            | no       | Mail From                                                               |
| `OPENAI_API_KEY`        | no       | **Embeddings** — required for RAG indexing to run                       |

> **Important:** the API and worker are separate services with separate env. RAG
> indexing runs in the worker, so `OPENAI_API_KEY` must be set on **both**.

### Frontend (`apps/web`)

| Variable              | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | API base (defaults to `http://localhost:4000`) |

Never hard-code secrets; see `.env.example`.

---

## 7. Worker architecture

`apps/worker` is a **separate process**, not a thread inside the API — agent/AI/
delivery work is IO/CPU heavy and must not touch request latency, and a crashing job
must not take down the API.

Boot sequence (`apps/worker/src/main.ts`):

1. **RLS preflight** — `assertRowLevelSecurityEnforced` on `DATABASE_URL`. If the
   role is a superuser / owner / `BYPASSRLS`, the worker **refuses to start** (a
   worker that bypasses RLS is a hole in tenant isolation).
2. Build two clients: a **tenant-scoped** client (`DATABASE_URL`) for job handlers,
   and an **owner** client (`DIRECT_DATABASE_URL`) for cross-tenant infra.
3. Create one **BullMQ Worker per queue** (13), each wrapped so the job's
   `organizationId` opens the tenant context (`withTenant`) before the handler runs.
   A job with no `organizationId` is rejected — the worker never guesses a tenant.
4. Attach a **dead-letter queue** to every worker: an exhausted job is moved to
   `<queue>.dlq` (never auto-retried) so failures are alertable and replayable.
5. Start the **outbox dispatcher** and the **schedule poller**.
6. Graceful shutdown on SIGTERM/SIGINT: stop dispatcher → stop poller → drain
   in-flight jobs → close Redis/DB.

Handlers with real implementations today: `WORKFLOW_EXECUTION` (workflow executor)
and `EMBEDDINGS` (RAG indexer). Email + social delivery run via the schedule poller.
Other queues acknowledge (logged, never fake side effects) until their module lands.

---

## 8. Queue architecture

Queues + policies live in `apps/worker/src/queues.ts`. Every queue uses exponential
backoff (only the ceiling differs) and retains completed/failed jobs for
inspection; exhausted jobs dead-letter.

| Queue (`name`)       | Concurrency | Attempts | Handler / notes                                       |
| -------------------- | ----------: | -------: | ----------------------------------------------------- |
| `workflow-execution` |           5 |        3 | **Workflow executor** (real)                          |
| `embeddings`         |           8 |        4 | **RAG indexer** (real)                                |
| `outbox-dispatch`    |           5 |        5 | (dispatcher relay)                                    |
| `email-send`         |          10 |        5 | routed; delivery via schedule poller                  |
| `social-publish`     |           3 |        2 | publish; duplicate is publicly visible → low attempts |
| `whatsapp-send`      |          10 |        3 | gated on provider                                     |
| `telephony`          |           5 |        1 | no auto-retry (side-effecting calls)                  |
| `agent-runs`         |           3 |        2 | agent pipeline                                        |
| `content-generation` |           5 |        3 | content jobs                                          |
| `media-generation`   |           2 |        2 | media jobs                                            |
| `analytics-rollup`   |           2 |        3 | metric aggregation                                    |
| `scheduled-triggers` |           5 |        3 | time/event triggers                                   |
| `webhook-delivery`   |          10 |        5 | outbound webhooks                                     |

**Dead-letter queues**: each queue has a `<name>` DLQ; exhausted jobs land there with
the original payload and failure reason, retained and never auto-retried.

---

## 9. Background jobs

Four kinds of background work run in the worker:

### a) Outbox dispatcher (`outbox-dispatcher.ts`)

Polls `outbox_event` (owner connection, cross-tenant) every ~500ms, turns committed
events into BullMQ jobs, then marks them dispatched. At-least-once; consumers
dedupe by event id. `EVENT_ROUTES` maps event names → queues.

### b) Schedule poller (`schedule-poller.ts`)

Time-driven delivery on the owner connection. Each tick:

- **Reclaim stale claims**: rows stuck in an intermediate state >5 min (a worker
  died mid-delivery) are returned to the queue.
- **Email**: atomically **claims** each `EmailSend` (`QUEUED → SENDING`, so multiple
  worker pods can't double-send), delivers via the mailer, and records `SENT` /
  bounded-retry `QUEUED` / `FAILED` with campaign counters.
- **Social**: atomically claims each due `SocialPost` (`SCHEDULED → PUBLISHING`),
  publishes each target, records permalinks, sets `PUBLISHED` / `FAILED`, notifies.

### c) Workflow executor (`workflow/executor.ts`)

Consumes `workflow-execution`. Walks a versioned node graph (`action`/`condition`/
`delay`), runs each node's real side effect, writes a `WorkflowRunStep` per node,
and tracks a completed-node set so a BullMQ retry resumes at the failed node.
`delay` re-enqueues a delayed continuation (waits without holding a worker). A
**cycle guard** caps total steps; the run is only marked FAILED + notified on the
final attempt.

### d) Embeddings indexer (`embeddings/indexer.ts`)

Consumes `embeddings`. See §12.

---

## 10. AI flow

AI is a **built-in platform service** — one operator `OPENAI_API_KEY`, no per-tenant
config. Users never see providers or keys; failures return a generic message that
never mentions OpenAI.

```
Controller (/ai/*)  ─►  AiService.resolve('LLM')  ─►  { providerId, apiKey(env), model(env) }
        │                                                    │
        ▼                                                    ▼
  getLlmAdapter(providerId)  ───────────────►  adapter.chat({ apiKey, model, messages })
        │                                                    │
        ▼                                                    ▼
  recordUsage (AiUsage ledger)                     OpenAI /v1/chat/completions
```

- `AiService.resolve(capability)` returns the platform key from **env only** (never
  DB, never user) for LLM; media capabilities resolve similarly.
- **Adapters** (`modules/ai/adapters/`): `llm.ts` (OpenAI + compatible providers,
  with a forward-compatible retry that renames `max_tokens → max_completion_tokens`
  and drops unsupported `temperature` for reasoning-era models), `openai-media.ts`
  (images `/v1/images/generations`, TTS `/v1/audio/speech`), `embeddings.ts`.
- **Surfaces**: `POST /ai/chat` (RAG-augmented, see §12), `POST /ai/generate`
  (copywriter), `POST /ai/image`, `POST /ai/voice`, `GET /ai/history`.
- Every call is written to the **`AiUsage`** ledger (tokens, latency, cost, success).
- Errors are logged server-side with the real provider detail; the client gets a
  generic `503`.

Model catalog + cost governance + the agent roster live in `packages/ai-core`.

---

## 11. Campaign generation flow

`CampaignGenerationService.generate(principal, brief)`
(`apps/api/src/modules/ai/campaign-generation.service.ts`):

```
User brief ("Launch our eco water bottle")
      │  POST /campaign-assets/generate
      ▼
resolve LLM (platform key) ─► adapter.chat(system=strategist prompt, user=brief)
      ▼
parse a single JSON plan { campaignName, objective, strategy, goals, audience,
                           schedule, suggestedBudget, assets[] }
      ▼  (one transaction)
create Campaign (DRAFT)
create N CampaignAsset rows (status GENERATED, one per platform + ad copy)
write AuditLog + a "N assets ready for review" Notification
      ▼
Review queue (kanban)  /app/marketing/campaigns
  edit · regenerate (single asset) · approve · reject · schedule · duplicate
      ▼
approve ─► WorkflowEngineService.fireEvent('asset.approved') ─► matching workflows run
```

The whole plan is persisted transactionally; assets land in the **review queue** as
`GENERATED` for a human to approve. Scheduling an approved asset hands it to the
schedule poller / publishing path.

---

## 12. RAG pipeline

End-to-end retrieval-augmented generation over an org's uploaded documents.

### Indexing (write path)

```
Upload (drag&drop / paste)  ─►  client reads text  ─►  POST /knowledge-bases/:id/documents
      ▼
KnowledgeDocument (status QUEUED, content, contentHash)   +  KB documentCount++
      ▼
KnowledgeService.enqueueIndex(org, kb, doc)  ─►  BullMQ 'embeddings' queue
      ▼  (worker: embeddings/indexer.ts)
status PROCESSING ─► chunk text (~1200 chars, sentence/paragraph aware, 150 overlap)
      ▼
OpenAI /v1/embeddings (text-embedding-3-small, 1536-dim), batched
      ▼  (tenant transaction, raw SQL)
INSERT knowledge_chunk (..., embedding vector(1536))     [pgvector]
      ▼
status READY, chunkCount set, KB chunkCount recomputed
   (no key → status FAILED with an honest reason; never a fake spinner)
```

### Retrieval (read path)

```
Query text  ─►  OpenAI /v1/embeddings  ─►  query vector
      ▼  (tenant transaction — RLS scopes the scan to the org)
SELECT ..., 1 - (embedding <=> $query::vector) AS score
  FROM knowledge_chunk JOIN knowledge_document
 ORDER BY embedding <=> $query::vector  LIMIT k
      ▼
top-k chunks with scores
```

- **Semantic search UI**: `POST /knowledge-bases/:id/search` → results with match %.
- **Chat grounding**: `AiController.chat` calls `KnowledgeService.retrieveForOrg`
  for the latest user turn and prepends the top chunks as a system message before
  calling the LLM. Best-effort — no knowledge/key ⇒ normal chat.
- Vectors are written and queried with raw SQL (`$executeRawUnsafe` /
  `$queryRawUnsafe`) because Prisma can't express the `vector` type; both run inside
  `withTenantTransaction` so RLS applies.

---

## 13. Local development setup

### Prerequisites

- Node ≥ 20, pnpm, Docker (or local PostgreSQL 16 + Redis), `psql`.
- PostgreSQL must have the `vector`, `citext`, `pg_trgm` extensions available.

### Steps

```bash
# 1. Install
pnpm install

# 2. Bring up Postgres + Redis (Docker example)
docker run -d --name mos-pg  -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16
docker run -d --name mos-redis -p 6379:6379 redis:7

# 3. Configure env (copy and fill)
cp .env.example .env          # root / package envs as needed
#   packages/database/.env : DATABASE_URL, DIRECT_DATABASE_URL
#   apps/api/.env          : DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET,
#                            ENCRYPTION_MASTER_KEY, OPENAI_API_KEY, OPENAI_MODEL
#   apps/web/.env(.local)  : NEXT_PUBLIC_API_URL=http://localhost:4000

# 4. Apply migrations (owner connection) + generate client
pnpm --filter @marketing-os/database migrate:deploy
pnpm db:generate

# 5. Create the RLS-subject app role (vsp_app) and point DATABASE_URL at it
psql "$DIRECT_DATABASE_URL" -v app_password="$(openssl rand -base64 32)" \
  -f packages/database/scripts/provision-app-role.sql

# 6. (optional) Seed demo data + grant features + default pipeline
pnpm db:seed
(cd apps/api && DATABASE_URL="$DIRECT_DATABASE_URL" npx tsx scripts/grant-features.ts)
(cd apps/api && DATABASE_URL="$DIRECT_DATABASE_URL" npx tsx scripts/ensure-default-pipeline.ts)

# 7. Run everything
pnpm dev                      # turbo: api (:4000) + web (:3000) + worker
#   or individually:
pnpm --filter @marketing-os/api dev
pnpm --filter @marketing-os/web dev
pnpm --filter @marketing-os/worker dev
```

Useful root scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:studio`,
`pnpm db:migrate` (dev), `pnpm db:reset`.

> Two roles matter locally too: `DATABASE_URL` = `vsp_app` (RLS applies),
> `DIRECT_DATABASE_URL` = owner (migrations/seeds). If the API says _"the database
> role is not subject to row-level security"_, `DATABASE_URL` is pointing at the owner.

---

## 14. Deployment guide

| Component      | Host                           | Notes                                                        |
| -------------- | ------------------------------ | ------------------------------------------------------------ |
| `apps/web`     | **Vercel**                     | Set `NEXT_PUBLIC_API_URL` to the API URL. Runs `next build`. |
| `apps/api`     | **Render** (Web Service)       | Runs via `tsx src/main.ts` (not a `tsc` build).              |
| `apps/worker`  | **Render** (Background Worker) | Runs via `tsx src/main.ts`.                                  |
| PostgreSQL     | **Render** Postgres 16         | pgvector enabled; two roles (owner + `vsp_app`).             |
| Redis / Valkey | **Render** Key-Value           | `maxmemory-policy noeviction` recommended for queues.        |

### Deploy checklist

1. **Env vars** — set on each Render service (see §6). The **worker needs
   `OPENAI_API_KEY`** for RAG indexing, in addition to the API.
2. **Migrations are manual** (no auto-migrate on deploy). Apply new migrations with
   the owner connection before/with the code deploy:
   ```bash
   DATABASE_URL="$OWNER_URL" DIRECT_DATABASE_URL="$OWNER_URL" \
     pnpm --filter @marketing-os/database migrate:deploy
   # (or apply the migration.sql via psql, then record it in _prisma_migrations)
   ```
3. **Registry sync** happens automatically on API boot (`syncRegistries` upserts
   Feature/Plan rows). New features still need granting per org
   (`scripts/grant-features.ts`) — presets cover new orgs.
4. **Push to `main`** → Render (API + worker) and Vercel (web) auto-deploy.
5. Free-tier services cold-start (~30–60s) — the frontend tolerates it; upgrade the
   tier to remove cold starts in production.

### Ops scripts (`apps/api/scripts/`)

- `grant-features.ts` — idempotently grant a curated feature set to every org.
- `ensure-default-pipeline.ts` — seed a "Sales Pipeline" per org (Deals needs one).

---

## 15. Troubleshooting guide

| Symptom                                                       | Likely cause / fix                                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API won't boot: _"role is not subject to row-level security"_ | `DATABASE_URL` points at the owner. Point it at `vsp_app` (run `provision-app-role.sql`); keep the owner in `DIRECT_DATABASE_URL`.                          |
| API won't boot: _"Invalid environment configuration"_         | A required env var is missing/short. Check `BETTER_AUTH_SECRET` and `ENCRYPTION_MASTER_KEY` are ≥32 chars; `DATABASE_URL`/`REDIS_URL` set.                  |
| Queries return **empty** where data exists                    | The read ran outside a tenant transaction. All handler DB access must be inside `withTenantTransaction` (or `CrudService`); RLS hides everything otherwise. |
| AI returns `503 "AI is temporarily unavailable"`              | Check the API logs for the real OpenAI error. Usually `OPENAI_API_KEY` unset or `OPENAI_MODEL` not a model your account serves.                             |
| Newer OpenAI model 400s                                       | The adapter self-heals `max_tokens`/`temperature`; if it still fails, the model id is wrong for the account — check `platform.openai.com` Models.           |
| Knowledge docs stick at `FAILED` "no embedding provider"      | `OPENAI_API_KEY` not set **on the worker** service. Set it and reprocess.                                                                                   |
| Knowledge search / chat grounding returns nothing             | Docs not `READY` yet (poll status), or the API lacks `OPENAI_API_KEY` for the query embedding.                                                              |
| Uploaded file rejected                                        | Only text-based files (≤400 KB) are supported (no server-side PDF/docx extractor). Paste text or convert first.                                             |
| Deals create shows "No pipelines yet"                         | Run `ensure-default-pipeline.ts` for the org (or add a pipeline).                                                                                           |
| A page 403s / missing from nav                                | The org lacks the feature. Grant it (`grant-features.ts`) or add to the preset. Nav is server-driven from entitlements.                                     |
| Emails not delivered (logged only)                            | `RESEND_API_KEY` unset on the API (transactional) and/or worker (campaigns). Set it on both.                                                                |
| Duplicate emails / social posts                               | Should be impossible — pollers claim rows atomically (`SENDING`/`PUBLISHING`). If seen, check for a stale-claim reclaim window or a manual DB edit.         |
| Workflow run flaps FAILED then succeeds                       | Expected on retryable node errors; the run is only marked FAILED + notified on the final attempt.                                                           |
| Mobile: no navigation                                         | Fixed — the shell has an off-canvas drawer + hamburger below 900px. Hard-refresh if cached.                                                                 |
| Cold start / first request slow                               | Free-tier Render service spinning up (~30–60s). Upgrade the tier.                                                                                           |
| A queued job "did nothing" (logged _handler not implemented_) | That queue has no real handler yet (scaffolding). Real handlers: `workflow-execution`, `embeddings`; delivery via the schedule poller.                      |
| Jobs stuck / exhausted                                        | Inspect the `<queue>` DLQ for the payload + failure reason; fix and replay.                                                                                 |

---

### Related docs

- `docs/ARCHITECTURE.md` — deeper architecture narrative.
- `docs/AUTHENTICATION.md` — Better Auth + platform realm.
- `docs/SECURITY.md` — tenant isolation, RLS, encryption, threat model.
- `docs/FEATURE_REGISTRY.md`, `docs/MODULE_REGISTRY.md`, `docs/PLUGIN_REGISTRY.md` — the modular platform.
- `docs/SUPER_ADMIN_GUIDE.md` — operator console.
- `BUILD_STATUS.md` — build/roadmap status.
