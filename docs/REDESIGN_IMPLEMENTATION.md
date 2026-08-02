# Redesign implementation guide — Phases 3 to 6

This document is the executable plan for the rest of the frontend redesign. It is
written to be handed to a coding agent (Cursor) and followed literally, one phase
per session, in order.

Three documents govern this work and this one does not replace them:

- `docs/DESIGN_BRIEF.md` — the frozen design system, IA and screen specs. When
  this guide and the brief disagree, **the brief wins**.
- `docs/API_CONTRACT.md` — the frozen frontend↔backend contract. Every endpoint,
  field name, casing, header and auth flow in it is fixed.
- `CLAUDE.md` (repo root) — scope rules, read-only paths, workflow conventions.

Read all three before starting a phase.

---

## 0. Rules that apply to every phase

### Scope

**May change:** `apps/web/src/app/**`, `apps/web/src/components/**`,
`apps/web/src/app/globals.css`, `apps/web/public/**`, presentation helpers in
`apps/web/src/lib/**`, and the docs listed above.

**Never change:** `apps/api/**`, `apps/worker/**`, `packages/**`, any env,
deploy, CI or `scripts/**` file. If a task looks like it needs a backend change,
**stop and ask the owner**. Do not work around it with a mock.

**No mock data, stubs or fixtures in production paths, ever.** If a screen in the
brief needs data that no endpoint provides, build the screen around what exists
and leave the rest out, then note the gap. Inventing a fake number is worse than
shipping a smaller screen.

### The three design rules (enforced, not aspirational)

1. **AI output renders provisional until approved.** Anything the AI produced
   that nobody has reviewed gets `--iris-050` surface, a 3px `--iris-600` left
   rail, and an "AI draft" label. Approval resolves it to `--surface-raised` with
   a jade rail. This is the product's signature; do not reduce it to a badge.
2. **Colour means status, nothing else.** No decorative colour. Channel glyphs
   are monochrome at `--text-secondary`. No brand colours for platforms.
3. **Amber means "you need to decide" and appears nowhere else.** Not warnings,
   not highlights, not charts.

Status display goes through `StatusPill` / `StatusRail` once they exist (Phase
3). Never hand-roll a status again. Tokens only — zero hardcoded style values.

### Verification (run before every commit)

```bash
corepack pnpm exec prettier --write <files you touched>
corepack pnpm --filter @vsp/web typecheck
corepack pnpm --filter @vsp/web lint
corepack pnpm --filter @vsp/web build
```

The turbo wrapper fails locally — always use the `--filter` form. CI is
authoritative afterwards: `gh run list`, `gh run view <id> --log-failed`.

TypeScript runs with `exactOptionalPropertyTypes: true`. Optional properties need
an explicit `| undefined` in their type, and conditional spreads
(`...(x ? { k: x } : {})`) rather than `k: x ?? undefined`.

### Git

Full autonomy is granted: commit and push to `main` per milestone without
asking, then report what shipped. Multiple sessions may run concurrently, so
always `git fetch` and rebase before pushing. One commit per phase minimum; a
phase with several independent milestones may be several commits.

### Stack facts (do not fight them)

- Next.js 15 App Router, React 19, TypeScript 5.7 strict.
- **No Tailwind, no component library, no CSS modules.** Styling is CSS custom
  properties plus utility class names in `apps/web/src/app/globals.css`.
- Motion: framer-motion 12 via `components/motion.tsx`.
- State: React state and context. No Redux/Zustand/SWR/React Query. Data
  fetching is hand-rolled per page through `lib/api.ts`.
- Icons: `components/icon.tsx` (inline SVG, no dependency). Platform glyphs:
  `components/platform-icon.tsx`.
- Charts: `components/charts.tsx` (hand-rolled SVG).
- No tests exist in `apps/web`. Do not add a test framework as part of the
  redesign; verification is typecheck + lint + build + the checklist in Phase 6.

---

## 1. What is already done

**Phase 0 (commit `3fc1fb5`)** — `docs/DESIGN_BRIEF.md`, `docs/API_CONTRACT.md`,
root `CLAUDE.md`.

**Phase 1 (commit `9a5faa6`)** — `docs/UI_AUDIT.md`. This is your map. It
contains, with file and line numbers:

- §2 the rule-violation inventory (every place rules 1–3 are broken today),
- §3 the `StatusPill` migration inventory (nine duplicate mappers, ~45 call
  sites),
- §4 the component inventory vs the Phase 3 primitives,
- §5 the route map with a verdict per brief route,
- §6 a screen-by-screen verdict with the biggest gap in each,
- §7 the frozen surfaces, §8 state coupling, §9 behaviours worth preserving.

**Phase 2 (commit `db7a592`)** — the token layer. Already in `globals.css`:

- Every brief token from Part 1.2–1.7: surfaces, borders, text, the six-hue
  semantic ramp (`--cobalt/amber/jade/crimson/iris/slate-*`), the chart ramp
  (`--chart-1` … `--chart-6`), `--space-1` … `--space-10`, `--radius-sm/md/lg/xl`
  (4/6/10/14px), `--elev-0` … `--elev-3`, `--dur-fast/base/slow`, `--ease-out`.
- The type ramp as `--type-*` custom properties plus matching `.type-*` utility
  classes (`.type-metric-hero`, `.type-title`, `.type-body`, `.type-label`, …).
  The brief names its 13px step `--text-secondary`, which collides with the
  colour token of the same name — hence the `--type-` prefix.
- A clearly-marked **legacy alias block** mapping the old names (`--bg`,
  `--text-muted`, `--ok`, `--radius`, `--shadow`, `--color-primary`, …) onto
  brief tokens, so screens not yet redesigned inherit the new palette instead of
  breaking. **Do not add new consumers of the alias block.** Phases 3–5 migrate
  the existing ones; Phase 6 deletes the block.
- A dark theme under `:root[data-theme='dark']` that overrides brief tokens only
  and preserves every pairing contract (`-600` mark, `-100` surface, `-800` text
  on it).
- Gradient, glass and pill tokens are **deleted, not aliased**. All 22
  `backdrop-filter` declarations, the full-pill buttons and nav items, and the
  Instrument Serif accent face are gone.

Also shipped in Phase 2: General Sans (400/500/600/700) and IBM Plex Mono
(400/500) self-hosted in `apps/web/public/fonts/`, wired via `next/font/local` in
`apps/web/src/app/layout.tsx`; `applyBranding` reduced to logo + display name
(it now only strips inline properties older builds wrote onto `<html>`); the
organisation logo rendering in the shell via `BrandMark`; colour inputs removed
from `settings/branding` and the operator provisioning wizard; `charts.tsx` moved
to the categorical ramp; and **`/design-system`** — a route that renders every
token from the token itself, in both themes. Open it whenever you need to check a
value, and extend it as you build primitives.

---

## 2. Decisions already made (do not re-litigate)

The audit ended with ten open questions. They are answered here so no phase is
blocked. If the owner overrides one, that overrides this document.

| #   | Question                    | Decision                                                                                                                                                                                                                                       |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Sidebar counts / amber dots | **Frontend-computed.** `NavEntry` gains nothing; the backend is read-only. The shell fetches the two counts it can get from existing endpoints (assets needing review, new leads) and renders dots from those. Anything else renders no count. |
| Q2  | The `/` collision           | **Keep the `/app` prefix.** Brief route `/x` maps to `/app/x`. `/` stays the public landing. This breaks no auth redirect and no bookmark.                                                                                                     |
| Q3  | Register page               | **Keep and restyle.** The backend supports it. Do not link it from the app shell.                                                                                                                                                              |
| Q4  | Landing page                | **Keep and restyle** to the new tokens. It already inherits them through the alias layer; Phase 5 gives it a proper pass.                                                                                                                      |
| Q5  | "Coming soon" nav entries   | **Restyle `ModuleIntro`, leave the backend alone.** Disabling them is a `packages/contracts` change and out of scope.                                                                                                                          |
| Q6  | Public renderers `f/`, `p/` | **Out of scope.** They render tenant-authored pages with their own palettes by design.                                                                                                                                                         |
| Q7  | Google SSO on login         | **Omit.** No backend support exists. Build the login split without it; leave room in the layout.                                                                                                                                               |
| Q8  | Live lead arrival flash     | **Drop the flash.** It needs a polling mechanism that does not exist, and polling behaviour is contract-frozen.                                                                                                                                |
| Q9  | Lead stage vocabulary       | **Relabel only.** Use the real backend enum values as the source of truth and give them the brief's labels where they map. Do not invent a PROPOSAL stage.                                                                                     |
| Q10 | Branding colour retirement  | **Done in Phase 2.** Colour fields are no longer read or sent client-side; stored values stay in the DB. `loginTagline` stays.                                                                                                                 |

---

## 3. Phase 3 — the primitives

**Goal:** every status in the app renders through one component, and the shared
component vocabulary (`ui.tsx`, `kit.tsx`, `motion.tsx`, `platform-icon.tsx`,
`charts.tsx`) matches the brief. Retheming these files carries roughly 80% of the
app, because `resource-page.tsx` (11 screens) and every page importing
`PageHeader`/`DataTable` inherit from them.

**Do not redesign any screen in this phase.** Only primitives and their call
sites.

### 3.1 `components/status.tsx` — new file, build this first

One source of truth for the eleven states in brief 1.6. Create
`apps/web/src/components/status.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'

/**
 * The eleven states in the design brief's status vocabulary (1.6). Every status
 * in the product is one of these — screens map their backend enum to a kind and
 * render it here, never hand-rolling a colour or a label.
 */
export type StatusKind =
  | 'draft'
  | 'ai-draft'
  | 'needs-review'
  | 'needs-changes'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'live'
  | 'rejected'
  | 'failed'
  | 'completed'

type Hue = 'slate' | 'iris' | 'amber' | 'jade' | 'cobalt' | 'crimson'
type Rail = 'none' | 'solid' | 'dashed' | 'pulse' | 'animated'

const STATUS: Record<StatusKind, { label: string; hue: Hue; rail: Rail }> = {
  draft: { label: 'Draft', hue: 'slate', rail: 'none' },
  'ai-draft': { label: 'AI draft', hue: 'iris', rail: 'solid' },
  'needs-review': { label: 'Needs review', hue: 'amber', rail: 'solid' },
  'needs-changes': { label: 'Needs changes', hue: 'amber', rail: 'dashed' },
  approved: { label: 'Approved', hue: 'jade', rail: 'solid' },
  scheduled: { label: 'Scheduled', hue: 'cobalt', rail: 'solid' },
  publishing: { label: 'Publishing', hue: 'cobalt', rail: 'animated' },
  live: { label: 'Live', hue: 'jade', rail: 'pulse' },
  rejected: { label: 'Rejected', hue: 'crimson', rail: 'solid' },
  failed: { label: 'Failed', hue: 'crimson', rail: 'solid' },
  completed: { label: 'Completed', hue: 'slate', rail: 'none' },
}

/**
 * Backend enums → status kinds. The API speaks in per-resource enums
 * (`GENERATED`, `NEEDS_REVIEW`, `ACTIVE`, `PAUSED`…); users should never see one.
 * Add a row here rather than a ternary in a page.
 */
const FROM_API: Record<string, StatusKind> = {
  DRAFT: 'draft',
  GENERATED: 'ai-draft',
  NEEDS_REVIEW: 'needs-review',
  CHANGES_REQUESTED: 'needs-changes',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'live',
  ACTIVE: 'live',
  LIVE: 'live',
  REJECTED: 'rejected',
  FAILED: 'failed',
  ERROR: 'failed',
  COMPLETED: 'completed',
  ARCHIVED: 'completed',
  PAUSED: 'draft',
  // …extend as you migrate each screen; every added row is one deleted ternary.
}

/** Maps a raw backend status to a kind, falling back to neutral — never amber. */
export function toStatus(raw: string | null | undefined): StatusKind {
  if (!raw) return 'draft'
  return FROM_API[raw.toUpperCase()] ?? 'draft'
}

export function statusLabel(kind: StatusKind): string {
  return STATUS[kind].label
}

export function StatusPill({ status }: { status: StatusKind }) {
  const { label, hue, rail } = STATUS[status]
  return (
    <span className="status-pill" data-hue={hue}>
      {rail === 'pulse' ? <span className="status-dot" /> : null}
      {label}
    </span>
  )
}

/**
 * The left rail. Wrap any row, card or panel whose state should read from across
 * the room. Colour transitions over --dur-slow, which is what makes approval feel
 * like it landed (brief 1.7).
 */
export function StatusRail({
  status,
  children,
  className,
}: {
  status: StatusKind
  children: ReactNode
  className?: string | undefined
}) {
  const { hue, rail } = STATUS[status]
  return (
    <div
      className={`status-rail ${className ?? ''}`}
      data-hue={hue}
      data-rail={rail}
      data-provisional={status === 'ai-draft' ? '' : undefined}
    >
      {children}
    </div>
  )
}
```

Then append to `globals.css` (mirror the `.ds-pill` / `.ds-railed` rules already
on the `/design-system` page — that page is the visual spec):

```css
/* ── Status vocabulary (brief 1.6) — the only way status renders ─────────────── */

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font: var(--type-label);
  letter-spacing: var(--type-label-tracking);
  text-transform: uppercase;
  white-space: nowrap;
}
.status-pill[data-hue='slate'] {
  background: var(--slate-100);
  color: var(--text-secondary);
}
.status-pill[data-hue='iris'] {
  background: var(--iris-100);
  color: var(--iris-800);
}
.status-pill[data-hue='amber'] {
  background: var(--amber-100);
  color: var(--amber-800);
}
.status-pill[data-hue='jade'] {
  background: var(--jade-100);
  color: var(--jade-800);
}
.status-pill[data-hue='cobalt'] {
  background: var(--cobalt-100);
  color: var(--cobalt-800);
}
.status-pill[data-hue='crimson'] {
  background: var(--crimson-100);
  color: var(--crimson-800);
}

.status-rail {
  border-left: 3px solid transparent;
  padding-left: var(--space-4);
  transition:
    border-left-color var(--dur-slow) var(--ease-out),
    background var(--dur-slow) var(--ease-out);
}
.status-rail[data-hue='iris'] {
  border-left-color: var(--iris-600);
}
.status-rail[data-hue='amber'] {
  border-left-color: var(--amber-600);
}
.status-rail[data-hue='jade'] {
  border-left-color: var(--jade-600);
}
.status-rail[data-hue='cobalt'] {
  border-left-color: var(--cobalt-600);
}
.status-rail[data-hue='crimson'] {
  border-left-color: var(--crimson-600);
}
.status-rail[data-rail='dashed'] {
  border-left-style: dashed;
}
.status-rail[data-rail='none'] {
  border-left-color: transparent;
}
/* Rule 1: unreviewed AI output sits on the iris surface until someone approves. */
.status-rail[data-provisional] {
  background: var(--iris-050);
}
.status-rail[data-rail='animated'] {
  animation: rail-pulse 1.4s var(--ease-out) infinite;
}
@keyframes rail-pulse {
  50% {
    border-left-color: var(--cobalt-100);
  }
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
```

### 3.2 Migrate every status call site

`docs/UI_AUDIT.md` §3 is the checklist; work through it top to bottom.

1. **Delete the nine duplicate mappers** and replace with `toStatus()`:
   `marketing/campaigns/page.tsx:104`, `creative-library.tsx:37` (byte-identical
   to the first, both defaulting to amber — a Rule 3 violation),
   `social-hub.tsx:57`, `marketing/forms/page.tsx:29` (maps ARCHIVED to danger),
   `ai/knowledge/[id]:78`, `support/tickets:69` and `:76`,
   `marketing/pages/page.tsx:28`, `marketing/pages/[id]:63`, `crm/leads:37-44`.
2. **Replace every inline `<Badge status="…">`** listed in §3 with `StatusPill`.
   Where the "status" is really a tag or a count chip (`settings/roles:66`,
   `crm/leads:152,153,196,217,220`, `support/helpdesk:106`,
   `campaigns:429,449,917`, `analytics/calendar:179`,
   `platform/organizations/[id]:279`, `social-hub:202,203,205,491,596`), it is
   **not a status** — give it a neutral `.chip` style instead. A count must never
   wear a status colour.
3. **Stop showing raw enums.** `GENERATED`, `IMAGE_PROMPT`, `PUBLISHING`,
   `CONNECTED`/`NOT CONNECTED`, `INSTAGRAM · POST` all become human labels
   (`campaigns:641`, `social-hub:256,568`, `meta-connect:126-128`).
4. **Fix every Rule 3 violation** in the audit's §2 table: NURTURING, 0–20%
   conversion, NOT CONNECTED, ARCHIVED, PENDING, HIGH priority, PAUSED, node type
   `condition`, `.badge.SUSPENDED`, the dormancy banner. All become slate,
   crimson or neutral per that table. The only amber that survives is
   `dashboard/page.tsx:348,357` ("needs attention").
5. Once nothing references them, delete `.badge.*` from `globals.css` and the
   `Badge` export from `ui.tsx`.

### 3.3 `ChannelGlyph` — `components/platform-icon.tsx`

`PlatformIcon` is already monochrome and compliant. Fix the four things around it:

- Remove the `style` prop escape hatch (`:66,81`) so no caller can colour a
  glyph, and fix the three call sites that do:
  `marketing/campaigns/page.tsx:637,883`, `social-hub.tsx:244`,
  `meta-connect.tsx:120`.
- Add missing glyphs: EMAIL, WEBSITE, GOOGLE_ANALYTICS (and distinguish Google
  Ads from Google Analytics — today one magnifying glass serves both).
- Replace the X glyph: it currently renders a literal ✗ cross, which reads as
  "delete".
- Unify stroke width with `icon.tsx` (1.75 vs 2 today).
- Default colour is `--text-secondary`. Always.

### 3.4 `MetricTile` — consolidate `Stat` and `StatCard`

Two competing components exist: `ui.tsx:24-31` (`Stat`) and `kit.tsx:399-415`
(`StatCard`, which supports a `delta` prop that **no call site uses**). `Sparkline`
is exported from `charts.tsx` and used nowhere.

Build one `MetricTile` in `kit.tsx`: 11px uppercase label above, value in
`.type-metric` (Plex Mono, tabular figures), delta below coloured jade or
crimson, optional sparkline, optional click-to-filter. Delete the loser, migrate
call sites, keep the export name that fewer files import to minimise churn.

### 3.5 `AssetCard` — new, extract from the campaigns page

There is no component today, only `.asset-row` CSS consumed ad hoc in
`marketing/campaigns/page.tsx` and `creative-library.tsx`. Extract
`components/asset-card.tsx`: `StatusRail` on the left edge, creative preview at
the correct platform aspect ratio (1:1, 9:16, 16:9 — never letterboxed), channel
glyph and type label, caption truncated to two lines, `StatusPill`, hover actions
(Approve / Edit / Regenerate / Reject). This is the unit both the review queue
(screen 9) and the content library are built from, so get it right here.

### 3.6 `DataTable` — `kit.tsx:183-271`

Keep the sort, row-click, selection and actions behaviour. Add: a density toggle
(44px comfortable / 36px compact) persisted in `localStorage` under
`vsp:density`, copying the `ThemeToggle` pattern at `app/app/layout.tsx:440-456`;
a sticky header; and a real sort indicator glyph instead of the text arrow at
`:235`.

### 3.7 Skeletons

`TableSkeleton` exists with ~20 call sites but only one shape, and `.skeleton`
uses a gradient shimmer. Replace the gradient with an opacity pulse, and add card,
tile and chart variants so loading states are shaped like the content that is
coming (brief Part 3 universal rules: skeletons, never spinners).

### 3.8 `motion.tsx`

Retune to the brief's vocabulary: fixed durations and `--ease-out`, not spring
physics. `FadeIn` translates 20px today — the budget is 2–4px. `Pressable` scales
0.96 — scale is not in the allowlist; use a 1px translate. Keep the
reduced-motion handling exactly as it is (it is correct in both places).

Then add the three expressive moments as reusable pieces, because Phase 5 needs
them: generation arrival (staggered fade-in with the rail drawing down),
approval (iris rail wiping to jade over 320ms — the CSS in §3.1 already does the
colour transition; add the wipe), and per-channel publish progress.

### 3.9 `charts.tsx`

The palette is already fixed (Phase 2). Remaining work: multi-series support with
dash-pattern or marker differentiation (brief 1.2 requires series to differ by
more than colour), mono/tabular numerals on SVG text, `<title>`/`aria-label` on
every chart, and an export button. Replace the funnel-rendered-as-donut at
`dashboard/page.tsx:219` with horizontal bars — the brief forbids pies for
comparison.

### Phase 3 acceptance

- `grep -rn "className=\"badge" apps/web/src` returns nothing.
- No file outside `components/status.tsx` maps a backend status to a colour.
- Every amber pixel in the app is a human-decision signal.
- Typecheck, lint and build pass; `/design-system` still renders correctly in
  both themes.

---

## 4. Phase 4 — the shell and the route map

**Goal:** the navigation and page chrome match brief Part 2, and the campaign
container exists as a real route with tabs.

### 4.1 Sidebar — `app/app/layout.tsx`

The tenant sidebar is **fully server-driven** from `ws.navigation`
(`workspace.controller.ts` builds it from `packages/contracts/src/features.ts` —
both read-only). You may change how it looks and how it is grouped for display,
but you may not change the item set from the frontend.

Build toward brief 2.2:

- 244px expanded, 60px collapsed (icons with tooltips), persisted per user in
  `localStorage`.
- 36px items, one level only, no nested accordions.
- Workspace switcher at the top as the identity row. `OrgSwitcher` currently
  hides when the user has one organisation (`:367`) — it should still render as
  an identity row.
- `✦ Create` as an accent-treated first item linking to the Command Center.
- Counts in neutral grey; the **amber dot** is separate and means "your action
  required" (per Q1, computed frontend-side from existing endpoints — assets
  needing review and new leads only; no other item gets a dot).
- Crimson indicator on Connections when a token is expired.
- A 56px desktop top bar (none exists today; there is only a mobile bar).
- Fix the active-route match at `:252` — it is exact equality, so parent
  highlighting breaks for every nested route Phase 4 introduces. Use a prefix
  match on the route segment.

The hardcoded shell furniture (Settings link, user row, ThemeToggle,
SignOutButton, `:267-298`) stays, restyled.

### 4.2 `⌘K` command palette

Nothing exists today. Build `components/command-palette.tsx`: mounted in the
tenant shell, opened with `⌘K`/`Ctrl+K`, searching campaigns, assets, leads and
settings from endpoints the app already calls, plus verb commands ("create
campaign", "connect Instagram"). Keep it keyboard-only-navigable and close on
`Esc`.

### 4.3 The campaign container — the most important structural change

Brief 2.1: **a campaign is the container, and its lifecycle stages are tabs
inside it.** Today there is no `[id]` route at all — `marketing/campaigns/page.tsx`
holds a 12-item in-page section switcher and 1,415 lines.

Create real routes (per Q2, under the `/app` prefix):

```
/app/campaigns                          → campaign list
/app/campaigns/[id]/strategy            → the approved plan, always readable
/app/campaigns/[id]/assets              → the review queue for this campaign
/app/campaigns/[id]/assets/[assetId]    → asset drawer over the queue
/app/campaigns/[id]/schedule            → this campaign's calendar
/app/campaigns/[id]/performance         → appears once published
/app/campaigns/[id]/report              → appears once ended
```

and the creation spine:

```
/app/create                             → AI Command Center
/app/create/intake/[draftId]            → guided questions (?step=objective)
/app/create/strategy/[draftId]          → strategy review
/app/create/generating/[id]             → generation progress (?phase=strategy|assets)
```

plus `/app/content`, `/app/calendar`, `/app/leads`, `/app/leads/[id]`,
`/app/leads/pipeline`, `/app/analytics/{overview,channels,audience,revenue}`,
`/app/connections`.

Two constraints to resolve before writing code:

- **There is no `GET /campaigns/:id`.** `openCampaign()`
  (`marketing/campaigns/page.tsx:189`) refetches the whole list to find one
  campaign. Check `docs/API_CONTRACT.md` §8; if the list call genuinely suffices,
  keep doing that in the route loader and leave a comment saying why. If it does
  not, that is an owner conversation — **not** a mock.
- **There is no draft store.** Plans are client-only state today, lost on
  refresh, so `/create/intake/:draftId` and `/create/strategy/:draftId` have
  nothing to persist to. Check the contract first: if a draft can ride existing
  campaign-creation endpoints, do that. If it cannot, build the intake flow with
  the draft held in `sessionStorage` under a generated id **and say so in the
  UI** ("this draft lives in this browser") rather than implying server
  persistence. Escalate to the owner if that trade-off is unacceptable.

Old routes keep working. Where a brief route maps onto an existing path
(`/app/analytics/calendar` → `/app/calendar`), add the new route and redirect the
old one. Do not delete legacy routes in this phase.

### 4.4 Platform console

Same primitives, same shell treatment. The platform sidebar is a hardcoded
three-item array (`platform/layout.tsx:45-64`) — restyle it to match. Fix the
hardcoded `#fff` logo chips (they break dark mode; `platform/page:105` and
siblings), the hand-rolled badges on org detail, and the raw `＋` glyph. Operator
fee and margin UI is permitted — but keep it out of every view-as surface.

### Phase 4 acceptance

- Every route in brief 2.3 resolves under `/app` or is explicitly listed as
  omitted.
- A user can move Strategy → Assets → Schedule → Performance without leaving the
  campaign.
- Sidebar collapse and density persist across reloads.
- View-as mode still works end to end: banner, no shell cache, no
  `GET /v1/auth/session` call, 401 → `/platform`.

---

## 5. Phase 5 — the screens

One screen per session, in this order. Each is specified in `DESIGN_BRIEF.md`
Part 3 — read the full spec for the screen before building it; the notes below
tell you where the data and the existing behaviour live.

Universal rules for every screen: one primary action; skeletons shaped like the
real content, never spinners; empty states that name the space and offer the
verb; errors that say what failed and what to do; destructive actions confirmable
but never behind a typed phrase (except account deletion).

**Behaviours to preserve** (audit §9 — these are the product's real assets):
two-gate approval, the A/B variant picker with `/choose-variant`, reject-reason
chips feeding regeneration, the template picker round trip, DayComposer's dual
path, the merged calendar model, per-target publish honesty, optimistic stage
moves with revert, skeleton-first loading, inline auth errors (never toasts).

| Order | Screen             | Route                               | Build notes                                                                                                                                                                                          |
| ----- | ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Home               | `/app`                              | Today a redirect stub. Three zones (A brief, B action-required, C metrics). Zone B renders only when count > 0. Fix the wrong count wiring at `dashboard:144` (`assetsGenerated` ≠ awaiting review). |
| 2     | AI Command Center  | `/app/create`                       | Good bones in `PromptView` (`campaigns:247`). Chips become four labelled rows that fill an **editable sentence**, not a tag. Keep ⌘↵ and the template picker.                                        |
| 3     | Guided intake      | `/app/create/intake/[draftId]`      | Greenfield. One question per screen, four steps, autosave. See the draft-store constraint in §4.3.                                                                                                   |
| 4     | Strategy review    | `/app/create/strategy/[draftId]`    | `PlanView:383` is read-only today. Needs per-section editing, `Request changes` that regenerates **only** the commented section, sticky action rail, whole-page iris treatment until approved.       |
| 5     | Review queue       | `/app/campaigns/[id]/assets`        | Three panes (220px filters / fluid grid / 480px drawer). **Bulk select and approve is essential.** J/K/A/R/Esc. Regeneration must be versioned — it overwrites the body today (`campaigns:828`).     |
| 6     | Calendar           | `/app/calendar` + campaign tab      | Month default, week and list toggles, drag and drop with a pre-drop validity indicator, 280px unscheduled-approved rail with its count.                                                              |
| 7     | Publish            | modal over the calendar             | Campaign-level, not per-asset. Preflight checklist, live per-channel progress, honest partial success, closes to Performance.                                                                        |
| 8     | Performance        | `/app/campaigns/[id]/performance`   | Six metric tiles with deltas and sparklines, tile click filters the chart, channel comparison as horizontal bars (never a pie), asset tables, insight rail.                                          |
| 9     | Leads              | `/app/leads`, `/app/leads/pipeline` | Inbox table + pipeline toggle. Score is fetched but never rendered (`crm/leads:28`) — render it, with the **slate** mid band (Rule 3). No live flash (Q8). Keep the optimistic stage move.           |
| 10    | Analytics          | `/app/analytics/*`                  | Four tabs with shared persisted filters. Per-channel metric shapes — do not force one shape on all. Export on every chart. Move `ai-usage` (internal costs) out of the client realm.                 |
| 11    | Connections        | `/app/connections`                  | Card grid for all eight platforms. OAuth in a popup that updates the card in place. Model the expired state. Never mention Graph API, tokens, scopes or app IDs.                                     |
| 12    | Campaign report    | `/app/campaigns/[id]/report`        | Reads like a document, not a dashboard. `apps/worker/src/reports/composeReportHtml` is the content model to mirror (read-only — copy the shape, do not import). Ends by starting the next loop.      |
| 13    | Login + auth       | `/login` and siblings               | One `auth-shell.tsx` rewrite fixes all six auth screens including platform login. 50/50 split, graphite left panel, no marketing copy, no Google SSO (Q7).                                           |
| 14    | Onboarding         | `/app/onboarding/*`                 | Four steps, resumable. Ends by dropping the user into their first intake, not on an empty dashboard.                                                                                                 |
| 15    | Generation screens | `/app/create/generating/[id]`       | Both phases. Show the work arriving, per-asset failure with retry, `Review assets →` as soon as the first group completes.                                                                           |

For each screen: read its brief section in full, check `docs/API_CONTRACT.md` for
the endpoints it needs, check `docs/UI_AUDIT.md` §6 for the specific gaps, then
build. Commit per screen.

`marketing/campaigns/page.tsx` decomposes along the seams in audit §8:
`PromptView`, `PlanView`, `AssetRow` and the section components are pure; all
eleven API calls live in the page shell; `AssetEditor` (seven states, nine
endpoints) becomes the drawer, and `PublishDialog` becomes the publish modal.

---

## 6. Phase 6 — verification

Produce `docs/REDESIGN_VERIFICATION.md` recording evidence, not claims.

Re-run the audit's inventories as the acceptance checklist — both were written to
be greppable:

```bash
# Rule 2 — no decorative colour, no hardcoded hex in TSX
grep -rn "#[0-9a-fA-F]\{3,8\}" apps/web/src --include=*.tsx | grep -v "f/\[slug\]\|p/\[slug\]\|page-blocks"

# No hand-rolled status
grep -rn "className=\"badge" apps/web/src

# Legacy alias block has no consumers left, then delete it from globals.css
grep -rn "var(--bg\b\|var(--text-muted\|var(--text-dim\|var(--ok\b\|var(--danger\b\|var(--warn\b\|var(--info\b\|var(--color-primary\|var(--primary-soft\|var(--shadow\b" apps/web/src

# Forbidden leftovers
grep -rn "backdrop-filter\|radius-pill\|grad-text\|glass-blur" apps/web/src
```

Then check by hand:

- Every one of the eleven statuses renders identically everywhere.
- Rule 1 holds: no unreviewed AI output renders as if it were vetted.
- Rule 3 holds: every amber pixel means a human decision is required.
- Both workflows in brief 2.4 complete without a dead end: the creation spine and
  the morning loop.
- Keyboard: focus is visible everywhere, the review queue is clearable without a
  mouse, `⌘K` works from every screen.
- `prefers-reduced-motion` is honoured; light and dark both pass contrast.
- Responsive down to 360px; no horizontal page scroll.

Finally, delete the legacy alias block from `globals.css` and re-run the full
verification. That deletion is the redesign's real finish line: after it, every
value in the app comes from the brief.

---

## 7. Quick reference

**Token cheat sheet** — surfaces `--surface-canvas/raised/sunken/inverse/hover/selected`
· borders `--border-subtle/default/strong/focus` · text
`--text-primary/secondary/tertiary/inverse/link` · ramp
`--{cobalt,amber,jade,crimson,iris,slate}-{600,100,800}` (iris also has `-050`) ·
charts `--chart-1…6` · space `--space-1…10` (4→64px) · radius
`--radius-sm/md/lg/xl` (4/6/10/14) · elevation `--elev-0…3` · motion
`--dur-fast/base/slow` + `--ease-out` · type `.type-metric-hero`, `.type-metric`,
`.type-title`, `.type-section`, `.type-subhead`, `.type-body`,
`.type-body-strong`, `.type-secondary`, `.type-caption`, `.type-label`.

**Density** — table row 44/36 · input, button 36 (32 small, 44 large) · sidebar
item 36 · top bar 56 · sidebar 244/60 · card padding 20 · page gutter 24.

**Never** — a hardcoded hex or px in a component; a status colour on a count; a
brand colour on a channel glyph; amber on anything but a human decision; a pie
chart for comparison; a toast where an inline error belongs; a spinner where a
skeleton belongs; a mock anywhere.

**Frozen and easy to break** (audit §7) — the tenant cookie / platform bearer /
`x-vsp-view-as` auth realms and their mutual exclusivity; `Content-Type` set only
when a body exists; sign-out landing on `/`; storage keys `vsp.platform.token`,
`vsp.viewas.token`, `vsp:shell:v1` and its five invalidation points, `vsp:theme`
(read by the pre-paint script); `applyBranding`'s response shape.
