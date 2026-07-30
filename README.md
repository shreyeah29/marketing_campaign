# VSP AI Marketing OS

> **Your AI Marketing Team in One Platform.**

A multi-tenant AI operating system where specialised AI employees collaborate to perform the
work of a full-service digital marketing agency.

This is not a dashboard over a database. It is an orchestration platform: a Chief Marketing
Officer agent plans, delegates to specialists — copywriter, designer, SEO, email, voice,
sales, analytics — and each specialist acts through typed, permission-checked tools that pass
the same validation and audit path as a human operator.

---

## Status

**Phase 3 of 7.** Architecture, workspace, and a verified database layer in place.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — read it before changing structure.

| Phase | Deliverable                                                 | State  |
| ----- | ----------------------------------------------------------- | ------ |
| 1     | Architecture                                                | ✅     |
| 2     | Workspace, tooling, configuration                           | ✅     |
| 3     | Prisma schema, migrations, row-level security               | ✅     |
| 4     | Backend core — tenancy, CQRS, outbox, ai-core, ports        | ▶ next |
| 5     | Frontend foundation — design system, shell, command palette |        |
| 6     | Authentication, organisations, RBAC                         |        |
| 7     | Dashboard and first vertical slice through the orchestrator |        |

> The previous .NET 9 implementation is preserved at tag `dotnet-final`
> (`git show dotnet-final`). It is not part of this codebase.

---

## Stack

**Frontend** — Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · shadcn/ui ·
Framer Motion · TanStack Query · Zustand · React Hook Form · Zod · TipTap · Recharts

**Backend** — NestJS + Fastify · Prisma · PostgreSQL · Redis · BullMQ · Socket.IO · CQRS ·
event-driven with a transactional outbox · DDD

**Infrastructure** — Neon Postgres (pgvector) · Upstash Redis · Cloudflare R2 · Vercel ·
Railway · Resend · Stripe · Sentry · PostHog

**Auth** — Better Auth with organisations, RBAC, rotating refresh tokens

---

## Layout

```
apps/
  web/       Next.js frontend
  api/       NestJS HTTP + realtime
  worker/    BullMQ workers
packages/
  contracts/     Zod schemas + inferred types (the API contract)
  database/      Prisma schema, tenant-scoped client, migrations
  ai-core/       Orchestrator, agent registry, tool protocol, provider ports
  providers/     Port adapters — the only place a vendor SDK may appear
  observability/ Logger, Sentry, PostHog
  config/        Shared ESLint presets
```

---

## Getting started

Requires Node 22+, pnpm 10+, and **PostgreSQL 17 with pgvector** plus Redis.

```bash
pnpm install
cp .env.example .env        # read the DATABASE_URL comments — two roles, not one
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev                    # web :3000 · api :4000
```

Generate the required secrets:

```bash
openssl rand -base64 48     # BETTER_AUTH_SECRET
openssl rand -base64 32     # ENCRYPTION_MASTER_KEY
```

Then provision the application database role — **once per environment, after migrations**:

```bash
cd packages/database
psql "$DIRECT_DATABASE_URL" \
  -v app_password="$(openssl rand -base64 32)" \
  -f scripts/provision-app-role.sql
```

`DATABASE_URL` must point at that role and `DIRECT_DATABASE_URL` at the owner. This is a
security boundary: row-level security does not constrain a superuser or a table owner, so an
application connecting as either would have no tenant isolation at all. The API refuses to
start if its own connection is not subject to RLS.

Verify isolation at any time — it is also a CI gate:

```bash
psql "$DIRECT_DATABASE_URL" -f scripts/seed-isolation-fixtures.sql
psql "$DATABASE_URL"        -f scripts/verify-tenant-isolation.sql
```

### Commands

| Command           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Run every app in watch mode                   |
| `pnpm build`      | Build all packages and apps                   |
| `pnpm typecheck`  | Strict TypeScript across the workspace        |
| `pnpm lint`       | ESLint, including architecture boundary rules |
| `pnpm test`       | Vitest unit and integration tests             |
| `pnpm test:e2e`   | Playwright end-to-end tests                   |
| `pnpm db:migrate` | Create and apply a development migration      |
| `pnpm db:studio`  | Browse the database                           |

---

## Non-negotiable rules

These are enforced by ESLint and CI, not left to reviewer memory.

1. **Business logic never imports a vendor SDK.** `openai`, `stripe`, `twilio` and friends
   may only be imported inside `packages/providers`, behind a port.
2. **`ai-core` never imports `providers`.** It defines ports; DI supplies implementations.
3. **Packages never import from `apps/`.** Dependencies point inward.
4. **Never import `@prisma/client` directly.** Use the tenant-scoped client from
   `@vsp/database`, which cannot be made to return another organisation's rows.
5. **Every tenant-scoped table carries `organizationId`**, with composite indexes leading
   on it and a row-level security policy behind it.
6. **No `useEffect` fetching, no `alert()`** in the frontend.
7. **Migrations are a release step**, never applied at application boot.
8. **Every AI action goes through a tool** → a CQRS command → the same authorisation and
   audit path as the equivalent human action.

---

## Contributing

Conventional commits, enforced by commitlint. Husky runs lint-staged pre-commit.
CI must be green before merge: typecheck → lint → format → test → build → migration drift.

## License

Private and proprietary.
