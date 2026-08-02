# CLAUDE.md — rules for every session in this repository

This repository is mid-way through a **frontend-only redesign** driven by
`docs/DESIGN_BRIEF.md` (the frozen design system + IA + screen specs) and
`docs/API_CONTRACT.md` (the frozen frontend↔backend contract). Read both
before touching UI code.

## Scope — what may change

**In scope (the redesign may modify):**

- `apps/web/src/app/**` — pages, layouts (presentation only)
- `apps/web/src/components/**`
- `apps/web/src/app/globals.css`, fonts, static assets in `apps/web/public/**`
- `apps/web/src/lib/**` ONLY for presentation-side helpers; the request/
  response wiring inside `lib/api.ts`, `lib/auth-client.ts`, `lib/platform.ts`,
  `lib/workspace.ts` is contract surface — see below.
- `docs/DESIGN_BRIEF.md`, `docs/UI_AUDIT.md`, `docs/REDESIGN_VERIFICATION.md`

**READ-ONLY (never modify during the redesign):**

- `apps/api/**` — all backend source, routes, guards, services
- `apps/worker/**` — pollers, queues, publishers
- `packages/database/**` — schema, migrations, RLS, tenant scoping
- `packages/contracts/**`, `packages/ai-core/**`, `packages/observability/**`
- Any env config, deploy config, CI workflow, `scripts/**`

If a redesign task appears to require touching a read-only path or changing a
contract shape: **STOP and ask the owner.** Do not work around it with mocks.

## The API contract is frozen

Every shape recorded in `docs/API_CONTRACT.md` — paths, methods, field names,
casing, types, headers, auth flows (tenant cookie, platform bearer,
`x-vsp-view-as`), polling behaviours — is frozen. Redesign work rearranges
presentation around these calls; it never changes what is sent or how a
response is read. If markup and data logic are tangled, separate them without
changing behaviour.

- Route paths do not change without per-route owner approval (the brief's
  route map in Part 2.3 is mapped onto existing paths during Phase 4).
- **No mock data, stubs or fixtures in production paths, ever.**

## Design rules that are enforced, not aspirational

From `docs/DESIGN_BRIEF.md` Part 1.1:

1. AI output renders provisional (iris surface + 3px iris rail + "AI draft")
   until approved; approval resolves it to white with a jade rail.
2. Colour means status, nothing else. Channel glyphs are monochrome. No
   decorative colour.
3. Amber appears **only** for "human decision required".

Status display goes through `StatusPill`/`StatusRail` once they exist (Phase 3) — never hand-rolled. Tokens only; zero hardcoded style values.

Agreed product adaptations (owner-approved 2026-08-02): the brief replaces the
former Hanzo direction; white-label tenant branding is **logo + display name
only** (no per-org colour repaint); there is **no client-facing billing UI**;
the platform console (operator realm, incl. view-as) adopts the same system.

## Workflow conventions

- Full autonomy is granted: commit + push to `main` per milestone without
  asking; report what shipped. Multiple sessions may run concurrently —
  always `git fetch` + rebase before pushing.
- pnpm via `corepack pnpm`; per-package scripts
  (`corepack pnpm --filter @vsp/web typecheck|build|lint`). The turbo wrapper
  fails locally.
- Prettier is CI-enforced: `corepack pnpm exec prettier --write <files>`
  before committing.
- TypeScript `exactOptionalPropertyTypes` is on: optional fields need
  `| undefined`.
- CI is authoritative; verify with `gh run list` / `gh run view <id>
--log-failed`.
- Redesign phases run one per session, in the order defined in the design
  brief's Part 4; commit between phases.

## Stack (recorded at Phase 0)

- Next.js 15 (App Router) + React 19, TypeScript 5.7 strict
- Styling: hand-rolled CSS custom properties in
  `apps/web/src/app/globals.css` + utility classnames — no Tailwind, no
  component library
- Motion: framer-motion 12 via `components/motion.tsx`
- State: React state + context (`app/app/layout.tsx` WorkspaceContext); no
  Redux/Zustand/SWR/React Query — data fetching is hand-rolled per page via
  `lib/api.ts`
- Icons: `components/icon.tsx` (~70 inline Lucide-style SVGs, no dependency)
- Charts: `components/charts.tsx` (hand-rolled SVG)
- Tests: none in `apps/web` (API and worker have vitest suites — read-only)
- Build: `next build`; deploys — web on Vercel, API+worker on Render
