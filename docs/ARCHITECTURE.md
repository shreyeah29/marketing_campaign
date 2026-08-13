# Marketing OS — Architecture

> **Your AI Marketing Team in One Platform.**
>
> A multi-tenant AI operating system in which specialised AI employees collaborate to
> perform the work of a full-service digital marketing agency.

**Status:** Phase 3 complete — architecture, workspace, and the database layer, with tenant
isolation verified against a real PostgreSQL instance. Implementation proceeds phase by phase.
**Supersedes:** the .NET 9 implementation, preserved at git tag `dotnet-final`.

---

## 1. Guiding principles

1. **Business logic never imports a provider SDK.** Providers are plugins behind ports.
2. **Multi-tenancy is enforced by infrastructure, never by developer discipline.** A forgotten
   `where` clause must not be able to leak another tenant's data.
3. **Modular monolith, microservice-ready.** Modules communicate through the event bus and
   published contracts — never by importing each other's internals.
4. **Everything expensive is a durable job.** AI work is long-running and costs money; it must
   survive process restarts and never be silently retried into a double charge.
5. **Every AI action is auditable.** Which agent, which model, which prompt, which tokens,
   what cost, on whose behalf.
6. **The orchestrator plans; it does not follow hardcoded workflows.**

---

## 2. System topology

```
┌────────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 15 (Vercel)                                    │
│  App Router · RSC · TanStack Query · Zustand · shadcn/ui           │
└───────────────┬───────────────────────────────┬────────────────────┘
                │ REST /v1 (OpenAPI)            │ Socket.IO (org rooms)
                ▼                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  apps/api — NestJS + Fastify (Railway)                             │
│                                                                     │
│  Interface   Controllers · Socket.IO gateways · Better Auth handler │
│  Application CQRS commands / queries / event handlers               │
│  Domain      Entities · value objects · domain events · policies    │
│  Infra       Prisma repositories · port adapters · outbox           │
└───────┬─────────────────┬──────────────────┬───────────────────────┘
        │                 │                  │
        ▼                 ▼                  ▼
┌──────────────┐  ┌────────────────┐  ┌─────────────────────────────┐
│ Neon         │  │ Upstash Redis  │  │ Cloudflare R2               │
│ Postgres 17  │  │ cache · BullMQ │  │ media · brand assets        │
│ + pgvector   │  │ · rate limits  │  │ · exports                   │
└──────┬───────┘  └────────┬───────┘  └─────────────────────────────┘
       │                   │
       │            ┌──────▼──────────────────────────────────────────┐
       └───────────▶│  apps/worker — BullMQ workers (Railway)         │
                    │  agent runs · sends · publishing · embeddings   │
                    │  · outbox dispatch · scheduled campaigns        │
                    └─────────────────────────────────────────────────┘
```

`apps/api` and `apps/worker` share every `packages/*` library and the same Prisma client.
The API never performs long-running work inline; it enqueues and streams progress back.

---

## 3. Repository layout

```
marketing-os/
├── apps/
│   ├── web/                  Next.js 15 App Router frontend
│   ├── api/                  NestJS + Fastify HTTP + realtime
│   └── worker/               BullMQ workers (no HTTP surface)
├── packages/
│   ├── contracts/            Zod schemas + inferred types — the API contract
│   ├── database/             Prisma schema, client, extensions, migrations, seed
│   ├── ai-core/              Orchestrator, agent registry, tool protocol, ports
│   ├── providers/            Adapters implementing the ports (plugins)
│   ├── observability/        pino logger, Sentry, PostHog, metrics
│   └── config/               Shared tsconfig / eslint / prettier presets
├── docs/                     Architecture and decision records
└── .github/workflows/        CI
```

**Dependency rule (enforced in CI):**

```
apps/*        → packages/*        ✅
packages/*    → packages/*        ✅ (contracts, config, observability only)
ai-core       → providers         ❌  ai-core defines ports; providers implement them
providers     → ai-core           ✅  (imports port interfaces only)
packages/*    → apps/*            ❌  never
```

`ai-core` must remain free of every vendor SDK. That is what makes providers swappable.

---

## 4. Module map (bounded contexts)

Each is a NestJS module with its own domain/application/infrastructure folders, its own
Prisma models, and its own events. Each is independently extractable.

| Module       | Responsibility                                                         |
| ------------ | ---------------------------------------------------------------------- |
| `iam`        | Users, organisations, memberships, roles, invitations, sessions        |
| `billing`    | Stripe subscriptions, plans, entitlements, usage-based invoicing       |
| `crm`        | Companies, contacts, leads, deals, pipelines, activities, appointments |
| `campaigns`  | Campaign aggregate, channels, budgets, scheduling                      |
| `content`    | Copy, drafts, revisions, TipTap documents, approvals                   |
| `media`      | Images, video, brand assets, R2 objects, media library                 |
| `messaging`  | Email, WhatsApp, SMS — unified conversation model                      |
| `telephony`  | Outbound/inbound voice calls, transcripts, dispositions                |
| `social`     | Accounts, scheduled posts, publishing, engagement ingestion            |
| `automation` | Trigger → condition → action graphs, run history                       |
| `analytics`  | Metric rollups, attribution, reporting                                 |
| `knowledge`  | RAG corpus, chunking, embeddings, retrieval (pgvector)                 |
| `agents`     | Agent runs, orchestration sessions, tool-call ledger                   |
| `templates`  | Template marketplace, install/fork                                     |
| `audit`      | Append-only audit log across every module                              |
| `platform`   | Health, feature flags, API keys, webhooks, settings                    |

Cross-module communication is **events only**. `crm` never imports from `campaigns`.

---

## 5. Multi-tenancy

This is the decision that matters most, and the previous implementation got it wrong by
relying on every query author to remember a `where` clause. Three layers now:

**Layer 1 — Request context.** An `AsyncLocalStorage` tenant context is populated by a Nest
middleware from the authenticated session. Worker jobs carry `organizationId` in the payload
and open the same context. There is no ambient global.

**Layer 2 — Prisma client extension.** A `$extends` query interceptor injects
`organizationId` into every `where`, `create`, `update` and `delete` on any tenant-scoped
model. A query issued without a tenant context **throws** rather than returning
unscoped rows — fail closed, never fail open. A single explicit `systemClient` escape hatch
exists for platform-level operations and is lint-banned outside `packages/database`.

**Layer 3 — Postgres Row-Level Security.** Policies keyed on
`current_setting('app.organization_id', true)`, set transaction-locally so a pooled connection
cannot leak the setting into the next request. Applied to all 48 tables carrying a tenant
column, to `organization` itself, and — via `EXISTS` on the parent — to the 13 child tables
that have no tenant column of their own. When the setting is absent the predicate is `NULL`
and every row is filtered: it fails closed.

The privilege boundary is the **database role**, not a flag:

- Migrations and seeds connect as the table **owner**, which is exempt from RLS.
  → `DIRECT_DATABASE_URL`
- The application connects as a **non-owner role** with no `BYPASSRLS` and no superuser bit,
  for which the policies are absolute. → `DATABASE_URL`

_An earlier revision of this design offered an `app.bypass_rls` GUC as the escape hatch. It
was tested and it failed: PostgreSQL lets any role `SET` a custom GUC, so the application role
could grant itself a full cross-tenant read. It was removed in favour of the role boundary,
which cannot be forged by `SET`. The regression is now case 7 of the isolation suite._

`packages/database/scripts/verify-tenant-isolation.sql` asserts all ten guarantees against a
real PostgreSQL instance as the application role, and runs in CI on every push. The API also
asserts at boot that its own connection is genuinely subject to RLS, so a misconfigured
deployment fails immediately rather than silently losing isolation.

**Tenant model:** shared database, shared schema, `organization_id` on every business table,
composite indexes leading with `organization_id`. Schema-per-tenant is rejected — it does not
survive thousands of tenants or online migrations.

**Audit trail:** `UPDATE` on `audit_log` is rejected by trigger for every role including the
owner — rewriting history is never legitimate. `DELETE` is withheld from the application role
by privilege instead, because retention windows and GDPR erasure are real obligations that a
blanket prohibition would make impossible.

---

## 6. AI architecture

### 6.1 Layers

```
Orchestrator          plans, routes, supervises, streams
   │
   ├── Agent registry            12 AI employees, each a module
   │      └── Tools              typed, Zod-validated, permission-checked
   │
   ├── Model router              capability + cost + latency → concrete model
   │      └── LlmPort adapters   OpenAI · Anthropic · Gemini · xAI · DeepSeek
   │
   ├── Run store                 durable steps, tool-call ledger, token/cost meter
   └── Guardrails                input validation, output schema, budget, PII
```

### 6.2 AI employees

`cmo` · `copywriter` · `designer` · `video-creator` · `email-specialist` · `seo-expert`
· `crm-assistant` · `voice-agent` · `whatsapp-agent` · `sales-agent` · `analytics-agent`
· `automation-agent`

An agent is a declarative manifest, not a class hierarchy:

```ts
interface AgentDefinition {
  id: AgentId
  role: string
  systemPrompt: PromptTemplate
  tools: ToolDefinition[] // what it may do
  capabilities: ModelCapability[] // what model class it needs
  delegatesTo: AgentId[] // the CMO fans out to specialists
  budget: BudgetPolicy
}
```

A tool is the only way an agent affects the world:

```ts
interface ToolDefinition<I, O> {
  name: string
  description: string // the model reads this
  input: ZodSchema<I>
  output: ZodSchema<O>
  requiredPermission: Permission // RBAC checked before execution
  idempotencyKey?: (input: I) => string
  execute(input: I, ctx: ToolContext): Promise<O>
}
```

Tools dispatch CQRS commands. They never touch Prisma directly, so every AI action passes
through the same validation, authorisation and audit path as a human action. **This is the
core invariant of the system.**

### 6.3 Orchestration

The `cmo` agent receives a goal, produces a plan, and delegates. Each step becomes a durable
BullMQ job with a persisted transcript. Nothing is hardcoded: adding an agent or tool changes
the plan space without any change to the orchestrator.

Runs are resumable, cancellable, and stream `run.step.*` events to the client over Socket.IO.

### 6.4 Cost governance

Every model call records tokens, latency and computed cost against the organisation. Budget
policies are enforced _before_ dispatch. Usage feeds Stripe metered billing. An AI SaaS
without per-tenant cost metering is an unbounded liability.

---

## 7. Provider abstraction (ports and adapters)

Ports live in `packages/ai-core/ports`. Adapters live in `packages/providers`.

| Port            | Adapters                                       |
| --------------- | ---------------------------------------------- |
| `LlmPort`       | OpenAI · Anthropic · Gemini · xAI · DeepSeek   |
| `ImagePort`     | OpenAI Images · Ideogram · Stability · Flux    |
| `VideoPort`     | Runway · Kling · Luma · Pika                   |
| `VoicePort`     | ElevenLabs · OpenAI Voice · Deepgram           |
| `TelephonyPort` | Twilio · Vapi · Retell                         |
| `SocialPort`    | Meta (FB/IG) · LinkedIn · X · TikTok · YouTube |
| `EmailPort`     | Resend                                         |
| `StoragePort`   | Cloudflare R2                                  |
| `PaymentPort`   | Stripe                                         |
| `EmbeddingPort` | OpenAI · Gemini · Voyage                       |

Each adapter is registered in a capability registry and resolved at runtime per organisation.
Adding a provider means adding one file and one registry entry — no business logic changes.

**Credential handling:** per-organisation provider keys are envelope-encrypted
(AES-256-GCM, data key wrapped by a KMS master key), decrypted only in memory at call time,
never logged, never returned by an API. The previous implementation stored them as plaintext
columns; that is corrected here by design.

---

## 8. Event-driven design

**In-process:** domain events via `@nestjs/cqrs` for same-transaction reactions.

**Durable:** the **transactional outbox**. Domain events are written to an `outbox_event`
table inside the same transaction as the state change; a worker relays them to BullMQ. This
is what makes "event-driven" trustworthy — no lost events when the process dies between
the database commit and the queue publish.

Events are versioned, namespaced (`crm.lead.created.v1`), and published in `contracts` so a
module can be extracted without renegotiating its interface.

Queues: `agent-runs` · `content-generation` · `media-generation` · `email-send`
· `social-publish` · `telephony` · `embeddings` · `analytics-rollup` · `outbox-dispatch`
· `scheduled-triggers`. Each has its own concurrency, retry/backoff and DLQ policy.

---

## 9. Authentication and authorisation

**Decision: Better Auth**, mounted inside `apps/api` as the single source of truth, with the
Prisma adapter and the organisation plugin. `apps/web` consumes it through the client SDK.

_Why not Clerk:_ Clerk is faster to integrate but externalises the tenant model, prices per
MAU, and would make organisations, roles and invitations someone else's schema. For a product
whose core object _is_ the organisation, identity must be ours. _Reversal trigger:_ if SSO/SAML
and SCIM for enterprise buyers arrive before we can build them, revisit — that is Clerk's
strongest argument and a legitimate reason to change this decision.

- HTTP-only, `Secure`, `SameSite` session cookies; short-lived access + rotating refresh tokens
  with reuse detection.
- Session management: list, revoke individual, revoke all.
- **RBAC:** `owner` · `admin` · `manager` · `member` · `viewer`, plus granular permissions
  (`campaigns:publish`, `billing:manage`, `agents:run`) resolved per organisation membership.
- Agents execute **on behalf of** a user and can never exceed that user's permissions.
- API keys for programmatic access: scoped, prefixed, hashed at rest, individually revocable.

Hardening: Helmet, CSRF on cookie-authenticated mutations, Redis-backed rate limits (per IP,
per user, per organisation), Zod validation on every boundary, strict CORS allowlist,
structured errors that never leak internals.

---

## 10. API design

- `/v1` prefix; OpenAPI generated from Zod via `contracts` — one source of truth, no drift.
- **Cursor pagination** everywhere: `?cursor=&limit=` → `{ data, nextCursor, hasMore }`.
  Offset pagination is not offered; it breaks under concurrent writes.
- Uniform filtering/sorting grammar; `Idempotency-Key` on all unsafe mutations.
- `RFC 9457 problem+json` errors carrying a stable `code`, plus `traceId`.

---

## 11. Frontend architecture

- App Router with route groups: `(auth)`, `(app)`, `(marketing)`.
- Server Components for data-dense reads; Client Components only where interaction demands it.
- TanStack Query owns all server state — no `useEffect` fetching. Zustand holds only ephemeral
  UI state (command palette, panels, drafts).
- Every mutation is optimistic with rollback; every list has real loading, empty and error
  states. No `alert()` — a toast system ships in the foundation.
- `⌘K` command palette as a first-class navigation and agent-invocation surface.
- Streaming agent output rendered from Socket.IO events.
- WCAG 2.2 AA: focus management, keyboard reachability, `prefers-reduced-motion`, semantic
  landmarks. Dark mode is the default, light mode fully supported.

---

## 12. Quality gates

Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
ESLint with import-boundary rules enforcing §3, Prettier, Husky + lint-staged,
Vitest for unit/integration, Playwright for E2E, GitHub Actions running
typecheck → lint → test → build → migrate-check on every PR.

**Non-negotiable test coverage:** tenant isolation, permission enforcement, outbox delivery,
and tool authorisation. These are the four places where a bug becomes a breach.

---

## 13. Phase plan

| Phase | Deliverable                                                | State            |
| ----- | ---------------------------------------------------------- | ---------------- |
| 1     | Architecture                                               | ✅ this document |
| 2     | Workspace, tooling, configuration                          | ▶ in progress    |
| 3     | Prisma schema + migrations + RLS                           |                  |
| 4     | Backend core: tenancy, CQRS, outbox, ai-core, ports        |                  |
| 5     | Frontend foundation: design system, shell, command palette |                  |
| 6     | Authentication, organisations, RBAC                        |                  |
| 7     | Dashboard + first vertical slice through the orchestrator  |                  |

Later: provider adapters, remaining modules, billing, RAG, marketplace.

---

## 14. Deployment

| Layer             | Target                                    |
| ----------------- | ----------------------------------------- |
| Frontend          | Vercel                                    |
| API + workers     | Railway (separate services, shared image) |
| Postgres          | Neon (+ pgvector)                         |
| Redis             | Upstash                                   |
| Object storage    | Cloudflare R2                             |
| Email             | Resend                                    |
| Payments          | Stripe                                    |
| Errors            | Sentry                                    |
| Product analytics | PostHog                                   |

Environments: `development` → `preview` (per PR) → `production`. Migrations run as a
release step, never at application boot — the previous implementation's `EnsureCreated`
approach cannot evolve a schema safely.
