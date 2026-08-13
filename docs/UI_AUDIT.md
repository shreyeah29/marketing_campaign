# UI Audit — current frontend vs `DESIGN_BRIEF.md`

**Phase 1 deliverable (redesign program).** Produced 2026-08-02 by a full read of
`apps/web/src` (~18.5k lines, 66 pages/components) against the brief's design
system (Part 1), IA (Part 2) and screen specs (Part 3). **No code was changed
in this phase.** Every claim carries a `file:line` reference against commit
`3fc1fb5`'s tree.

How to read the verdicts: **EXACT** = matches the brief · **PARTIAL** = the
concept exists but diverges · **MISSING** = must be built from scratch ·
**EXISTS-ELSEWHERE** = the capability exists at a different path/shape (route
changes need per-route owner approval in Phase 4).

---

## 0. Executive summary

1. **The token layer is a full replacement, not a rename.** The current
   "Hanzo" system shares essentially zero token names with the brief.
   Only `--radius-sm`/`--radius-lg`/`--border-strong` collide — with wildly
   different values (radius 12→4px, 24→10px), so aliasing would silently
   mis-render everything. Phase 2 should introduce the brief's names and
   delete the old block wholesale.
2. **Rule 1 (iris = AI-unreviewed) has zero implementation.** No iris token,
   no rail, no "AI draft" label anywhere (`grep iris|F5F3FF` → 0 hits). AI
   drafts and approved assets render with identical chrome, distinguished only
   by a raw-enum text pill. The product's signature element is 0% built.
3. **Amber currently means at least five unrelated things** (pending fallback,
   NOT CONNECTED, PAUSED, ARCHIVED, HIGH priority, a workflow node _type_).
   Three duplicated `statusTint()` helpers even use amber as the _default_
   for unknown statuses. Exactly one call site matches the brief's meaning
   (`dashboard/page.tsx:348` "needs attention").
4. **Status display is hand-rolled 9+ different ways** across ~45 call sites
   feeding a `Badge` that is an untyped className passthrough
   (`ui.tsx:6-8`). Two call sites pass classes that don't exist and render
   unstyled today (`inbox/chat/page.tsx:286,320`, `marketing/email/page.tsx:28`).
5. **The entire creation flow lives in one 1,415-line page**
   (`app/app/marketing/campaigns/page.tsx`) behind a 3-value local state
   machine — no routes, no persisted draft, no deep links, refresh loses
   everything. The brief's screens 4–9 map onto it; screens 5, 6, 8 are
   missing outright.
6. **Missing screens:** Home (Zones A/B/C), guided intake, AI-planning
   progress, streamed asset generation, per-campaign performance, campaign
   report UI, `/connections` page, tenant onboarding (nothing exists — users
   land on a redirect to the campaign studio).
7. **696 inline `style={{}}` objects across 57 files**, 60 hardcoded hex
   colours in TSX, fractional font sizes (13.5/12.5/11.5px), no spacing/motion/
   type-scale tokens. Colour rules cannot be enforced centrally because
   nothing is defined centrally.
8. **Tenant colour repaint is live and must be retired first.** `applyBranding`
   (`lib/workspace.ts:28-36`) rewrites `--color-primary/--color-accent/...` at
   runtime from tenant branding, and both the operator wizard and
   `/app/settings/branding` still expose colour inputs. Any Phase 2 token work
   lands on sand until the repaint is reduced to logo + displayName
   (owner-approved 2026-08-02).
9. **High-leverage good news:** `PlatformIcon` is already monochrome
   `currentColor` (Rule 2-compliant — only 3 call sites tint it);
   `kit.tsx`+`ui.tsx` retheme once → all 11 ResourcePage screens and nearly
   every custom page follow; metric values are already mono+tabular; skeletons
   are already the loading idiom; the two-gate approval flow, variant picker,
   reject-reason chips and merged calendar model are behaviours worth keeping.

---

## 1. Design-system layer vs Part 1

All tokens live in `apps/web/src/app/globals.css` (1,693 lines): `:root` at
17-75, dark theme at 77-112.

### 1.1 Token mapping

| Brief group       | Brief tokens                                                                                      | Current nearest                                                                                                                                                                                              | Verdict                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces          | `--surface-canvas/raised/sunken/inverse/hover/selected`                                           | `--bg`, `--bg-elevated`, `--bg-card`, `--bg-input`, `--bg-subtle`, `--primary-soft` (`globals.css:32-36`)                                                                                                    | All renamed. Canvas today is pure `#fff` and `--bg` = `--bg-card`, so the brief's canvas/raised distinction doesn't exist                                                                           |
| Borders           | `--border-subtle/default/strong/focus`                                                            | `--border`, `--border-strong` (`:37-38`)                                                                                                                                                                     | `--border-strong` name reused, value differs (`#d9d9d9` vs `#B4BCC8`). No `--border-focus` (focus ring built from `--color-accent`, `:69`)                                                          |
| Text              | `--text-primary/secondary/tertiary/inverse/link`                                                  | `--text`, `--text-muted`, `--text-dim`, `--on-primary` (`:39-42`)                                                                                                                                            | All renamed. NB the brief itself reuses `--text-secondary` as both a colour and a type-scale token (brief 1.3) — resolve in Phase 2 (suggest `--text-scale-secondary` or similar for the type ramp) |
| Semantic ramp     | 18 tokens: `--cobalt/amber/jade/crimson-600/100/800`, `--iris-600/100/050/800`, `--slate-600/100` | `--ok #0cb300`, `--info #0099ff`, `--warn #b45309` (dark: `#ffd500` pure yellow), `--danger #ff3700` + `-soft` alphas (`:52-58`)                                                                             | None exist. 4 statuses vs the brief's 6 hues × 11 states. **No iris at all**                                                                                                                        |
| Radius            | `sm 4 / md 6 / lg 10 / xl 14`                                                                     | `--radius-sm 12`, `--radius 16`, `--radius-lg 24`, `--radius-pill 999` (`:61-64`)                                                                                                                            | **Landmine:** same names, ~3× values. Buttons/nav are full pills (`:506,:259`) — brief wants 6px                                                                                                    |
| Elevation         | `--elev-0/1/2/3`, graphite-tinted                                                                 | `--shadow-sm/--shadow/--shadow-lg` + vestigial `--glow-primary`, `--glass-blur` (`:65-70`)                                                                                                                   | Renamed, 3 levels vs 4, black-tinted                                                                                                                                                                |
| Type scale        | 9 tokens `--text-metric-hero` … `--text-label`                                                    | None — sizes hardcoded per rule, incl. 21 fractional sizes (13.5px `:261,699,1378,1589`; 12.5 `:578,1300`; 11.5 `:477,584`; 10.5 `:687`; 14.5 `:1334`)                                                       | MISSING                                                                                                                                                                                             |
| Spacing           | `--space` 4-base scale                                                                            | None — literals throughout, incl. off-grid 13/11/9/7/5/3px                                                                                                                                                   | MISSING                                                                                                                                                                                             |
| Motion            | `--dur-fast/base/slow 120/200/320ms`, `--ease-out cubic-bezier(.2,0,0,1)`                         | None — literal durations 0.15/0.16/0.18/0.22/0.24/0.28/0.7/1.3/1.8s; the brief's easing appears nowhere                                                                                                      | MISSING                                                                                                                                                                                             |
| Gradients / glass | none allowed                                                                                      | `--grad-primary/--grad-brand` (neutered to solid, `:73-74`) still referenced in 6 rules; 18 `backdrop-filter` declarations, 2 hardcoded non-zero (`:438,:970`), drawer/modal at live 6px blur (`:987,:1034`) | Delete in Phase 2, don't alias                                                                                                                                                                      |
| Brand override    | retired by owner decision                                                                         | `--color-primary/-hover/secondary/accent/accent-2` (`:18-23`), runtime-rewritten by `applyBranding`                                                                                                          | Retire (see §7)                                                                                                                                                                                     |

### 1.2 Typography

- Loaded via `next/font/google` (`app/layout.tsx:3-29`): **Inter** 400-700
  (`--font-sans`), **Instrument Serif** italic (`--font-serif-accent`),
  **Fragment Mono** (`--font-mono`). Brief wants **General Sans** (Fontshare) +
  **IBM Plex Mono**, self-hosted woff2. Neither exists in the repo; there is no
  `public/fonts/` directory.
- Three families where the brief allows two; the serif display face
  (`.grad-text`, `globals.css:1312-1318`) is explicitly forbidden ("No serif
  display face").
- Body is already 14px (`:128`) ✓; line-height 1.55 vs brief 21px; headings use
  -0.04em tracking vs brief -0.01/-0.02em; page title 28px vs brief 22px.
- Mono is wired only to `.stat .v`/`.kpi .v` (`:488`) and `.mono` (`:879`) —
  brief wants it on _all_ metrics, currency, IDs, timestamps, percentages.

### 1.3 Density vs brief 1.5

| Element       | Current                                               | Brief                             |
| ------------- | ----------------------------------------------------- | --------------------------------- |
| Sidebar width | 252px (`globals.css:201`), no collapse                | 244px / 60px collapsed, persisted |
| Sidebar item  | pad 8×14, pill radius, ~33px (`:255-259`)             | 36px, no pill                     |
| Top bar       | none on desktop (`.mobile-topbar` only, `:294-296`)   | 56px                              |
| Table row     | ~44px (`td` pad 13×14, `:695-699`), no compact mode   | 44/36 toggle, persisted           |
| Button        | ~38px (pad 10×20, `:505`), full pill                  | 36/32/44, 6px radius              |
| Card padding  | 18px (`:346`)                                         | 20px                              |
| Page gutter   | 28px 34px 60px (`:288`) + `max-width:1180px` (`:290`) | 24px                              |

### 1.4 Motion

`components/motion.tsx` exports `spring/Motion/FadeIn/Stagger/StaggerItem/
Pressable` (framer-motion). Mismatches: spring physics vs the brief's fixed
duration+bezier vocabulary; `FadeIn` translates 20px (`:16,:34`) vs the brief's
2-4px budget; `Pressable` scales 0.96 (`:83`) — scale isn't in the allowlist.
Reduced-motion is handled correctly twice (CSS blanket `globals.css:1684-1693`

- `MotionConfig reducedMotion="user"`). None of the brief's three expressive
  moments (generation arrival, iris→jade approval wipe, per-channel publish
  progress) exist. `.pulse-dot` (`:649-665`) exists but has no consumer.

### 1.5 Charts (`components/charts.tsx`, 383 lines)

Hand-rolled SVG: `LineChart`, `BarChart`, `Sparkline`, `DonutChart`, honest
`EmptyChart` (keep). Problems: every chart defaults to a single colour =
`var(--color-primary)` (i.e. black, or whatever a tenant repainted);
`DONUT_COLORS` (`:301-310`) is an off-system pastel ramp with 6 raw hexes
including `#fbbf24` **amber** (Rule 3 on charts); gradient area fill
(`:97-101`); **no multi-series support at all**, hence no dash/marker
differentiation (brief 1.2); no mono/tabular numerals on SVG text; no
`<title>`/`aria-label`; no export buttons anywhere in the app.
`GENDER_COLORS` female→`#d6006c` magenta (`analytics/campaigns/page.tsx:49-53`)
is decorative colour on a demographic. Funnel rendered as a donut
(`dashboard/page.tsx:219`) — category error; brief wants horizontal bars, never
pies.

---

## 2. The three rules — violation inventory

### Rule 1 — AI output renders provisional until approved

**Nothing implements it.** No iris token, no `#6B5DD3`/`#F5F3FF`, no left-rail
CSS pattern, no "AI draft" label (repo-wide grep: 0 hits). Draft vs approved is
a text pill showing the raw enum (`GENERATED`, `NEEDS_REVIEW`) on identical
card chrome (`campaigns/page.tsx:634`, `creative-library.tsx:137`). Biggest
single body of new work in the redesign.

### Rule 2 — colour means status, nothing else

- **Channel glyphs:** `PlatformIcon` is compliant (stroke `currentColor`,
  `platform-icon.tsx:70-84`). Three call sites break it with
  `style={{color:'var(--color-primary)'}}`: `campaigns/page.tsx:637,883`,
  `social-hub.tsx:244` (also `meta-connect.tsx:120`). Glyph gaps: no EMAIL
  glyph in the platform set; X renders as a literal ✗ cross (`:24-29`, reads as
  "delete"); GOOGLE is a magnifying glass with no Ads/Analytics distinction.
  The `style` prop escape hatch (`:66,81`) should be locked down in Phase 3.
- **Decorative colour:** "AI Campaign Studio" tinted pill
  (`campaigns/page.tsx:275-281`); `.grad-text` serif flourish (`:287`, landing
  `page.tsx:44`); tinted avatars (`:362,:621`, `globals.css:1243`); analytics
  bars painted brand colour (`:768`; `dashboard/page.tsx:276` uses a
  gradient); goal ticks in jade as decoration (`:735`); `.tab.active`,
  `.state-badge`, `.chip.on`, `.lp-*` all colour with `--color-primary`
  (`globals.css:1126,1152,1527,1299-1398`); auth/sidebar gradient `.dot` blob
  (`auth-shell.tsx:41-43`, `globals.css:231-238`); chat bubble gradient
  (`globals.css:1211`); blue doubles as both "accent" and "info" so a blue
  pixel has two meanings (`:22,:54`).
- **Count/tag chips using status colours:** `crm/leads/page.tsx:152-153`
  (`badge info/ok` on counts), `.badge` as a checkbox chrome
  (`social-hub.tsx:491`), plus 10+ raw `<span className="badge">` sites (§3).

### Rule 3 — amber only for "human decision required"

| Site                                                                         | Amber means                                 | Should be                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `campaigns/page.tsx:104-110`, `creative-library.tsx:37-42`                   | **default fallback** for any unknown status | per-status mapping via StatusPill                |
| `crm/leads/page.tsx:41`                                                      | NURTURING stage                             | neutral (brief 13: only Won jade / Lost crimson) |
| `analytics/leads/page.tsx:174`                                               | conversion rate 0-20%                       | neutral/crimson                                  |
| `meta-connect.tsx:128`                                                       | NOT CONNECTED                               | neutral                                          |
| `marketing/pages/page.tsx:31`, `[id]:66`                                     | ARCHIVED                                    | slate                                            |
| `support/tickets/page.tsx:71,79,511` (+ hardcoded `#d9822b` fallback `:504`) | PENDING / HIGH priority / internal note     | neutral / crimson                                |
| `automation/workflows/page.tsx:125`, `[id]:232,415`                          | PAUSED / node **type** `condition`          | slate / neutral                                  |
| `ai/knowledge/[id]/page.tsx:82`                                              | PENDING/QUEUED                              | slate                                            |
| `globals.css:635`                                                            | `.badge.SUSPENDED` aliased to `.warn`       | crimson or slate                                 |
| `platform/analytics/page.tsx:97,190`                                         | dormancy banner + last-activity text        | neutral                                          |
| `charts.tsx:305`                                                             | `#fbbf24` donut segment                     | dataviz ramp                                     |
| `dashboard/page.tsx:348,357`                                                 | "needs attention"                           | **correct — the only compliant use**             |

Dark theme redefines `--warn` as `#ffd500` pure yellow (`globals.css:101`).
Lead-score bands: nothing to fix — `score` is fetched
(`crm/leads/page.tsx:28`) and **never rendered**; the approved slate-mid-band
adaptation applies when the score UI is built (screen 13).

---

## 3. Status display — the migration inventory for `StatusPill`/`StatusRail`

`Badge` (`ui.tsx:6-8`) is `<span className={`badge ${status}`}>` — an untyped
passthrough. CSS knows 8 modifiers (`.ACTIVE/.ok/.TRIAL/.info/.SUSPENDED/
.warn/.DELETED/.danger`, `globals.css:611-646`). Callers invent the mapping:

**Nine duplicate status→tint mappers** (three disagree about the same
statuses): `campaigns/page.tsx:104` and `creative-library.tsx:37`
(byte-identical, amber default) · `social-hub.tsx:57` (neutral default) ·
`marketing/forms/page.tsx:29` (ARCHIVED→danger!) · `ai/knowledge/[id]:78` ·
`support/tickets:69` + `:76` (priority) · `marketing/pages/page.tsx:28` ·
`marketing/pages/[id]:63` · `crm/leads:37-44` (stage tints).

**Inline literal `status="..."` call sites** (bypass any mapper):
`settings/roles:57`, `settings/features:59`, `settings/users:107`,
`inbox/chat:286,320` (invalid class `success`), `support/tickets:511`,
`ai/prompts:30`, `ai/knowledge/[id]:417`, `marketing/forms/[id]:108`,
`marketing/email:28` (raw API status as className),
`automation/workflows/[id]:231,240,408,460`, `automation/webhooks:35`,
`automation/workflows:123`, `notifications:87`, `platform/page:120`,
`platform/analytics:158`, `platform/organizations/[id]:80,275,363,371`,
`platform/organizations/new:443`, `meta-connect:126,128`, `crm/leads:215`.

**Raw `<span className="badge">` as tag/count chips:** `settings/roles:66`,
`crm/leads:152,153,196,217,220`, `support/helpdesk:106`,
`campaigns:429,449,917`, `analytics/calendar:179`,
`platform/organizations/[id]:279`, `social-hub:202,203,205,491,596`.

**Raw enum strings shown to users:** `GENERATED`, `IMAGE_PROMPT`,
`PUBLISHING`, `CONNECTED`/`NOT CONNECTED`, `INSTAGRAM · POST`
(`campaigns:641`, `social-hub:256,568`, `meta-connect:126-128`).

Calendar chips bypass Badge entirely and paint chip background/colour with
inline ternaries (`analytics/calendar/page.tsx:259-270`).

Phase 3 must replace all of the above with the brief's 11-state
`StatusPill`/`StatusRail` vocabulary, including label mapping (no raw enums).

---

## 4. Component inventory vs Phase-3 primitives

| Brief primitive    | Exists? | Notes                                                                                                                                                                                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| StatusPill         | ✗       | `Badge` is a passthrough; 9 mappers + ~45 sites to migrate (§3)                                                                                                                                                                            |
| StatusRail         | ✗       | No left-rail treatment anywhere in CSS or components                                                                                                                                                                                       |
| ChannelGlyph       | ✓       | `PlatformIcon` already monochrome. Add EMAIL/WEBSITE/GA glyphs, real X glyph, remove `style` colour escape hatch                                                                                                                           |
| MetricTile         | ~       | Two competing: `Stat` (`ui.tsx:24-31`) and `StatCard` (`kit.tsx:399-415`). Values already mono+tabular (`globals.css:488-489`). `delta` prop supported but **zero call sites use it**; `Sparkline` exported, **used nowhere**. Consolidate |
| AssetCard          | ~       | No component — `.asset-row` CSS (`globals.css:1614-1636`) consumed ad-hoc in campaigns page + creative-library. Extract                                                                                                                    |
| DataTable          | ✓       | `kit.tsx:183-271` — sort, row-click, selection, actions. Missing: density toggle, sticky header, text-glyph sort indicator (`:235`)                                                                                                        |
| Skeletons          | ✓       | `TableSkeleton` + `.skeleton` shimmer (gradient — replace), ~20 call sites. Only table shape; needs card/tile/chart variants                                                                                                               |
| Command palette ⌘K | ✗       | Nothing. Only `metaKey` use is ⌘↵ prompt submit (`campaigns:299`)                                                                                                                                                                          |
| Density toggle     | ✗       | Nothing. `ThemeToggle` (`app/app/layout.tsx:440-456`, `mos:theme`) is the persistence pattern to copy                                                                                                                                      |

Current exported vocabulary — `ui.tsx`: Badge, Spinner, Banner, Stat, Field,
LoadingScreen · `kit.tsx`: PageHeader, EmptyState, ErrorState, TableSkeleton,
ProviderNotConfigured, SearchInput, Tabs, DataTable, Drawer, ConfirmDialog,
ToastProvider/useToast, StatCard · `motion.tsx`: spring, Motion, FadeIn,
Stagger, StaggerItem, Pressable · `icon.tsx`: Icon (~60 names; stroke 1.75 vs
platform-icon's 2 — unify) · `charts.tsx`: LineChart, BarChart, Sparkline,
DonutChart.

**Leverage:** `resource-page.tsx` (364 lines, 11 pages) has zero hardcoded
colours and zero hand-rolled pills — all styling flows through kit/ui.
**Retheming kit.tsx + ui.tsx rethemes the 11 ResourcePage screens and every
custom page importing PageHeader/DataTable — essentially the whole app.**
`page-blocks.tsx` deliberately opts out of the system (17 inline blocks,
`#4f46e5` indigo, zero tokens — public renderers; see owner question Q6).

---

## 5. IA and routes vs Part 2

### 5.1 Nav today

Tenant sidebar is **fully server-driven**: `app/app/layout.tsx:246-265` maps
`ws.navigation` (shape `lib/types.ts:168-180`) built by
`workspace.controller.ts:136-179` from `packages/contracts/src/features.ts`
navEntries — both **read-only** during the redesign. Rendered sections:
Overview / AI Engine / Channels / Marketing / Analytics / CRM / Documents /
Inbox (~24 items) vs the brief's 8-item single list. Active match is exact
equality (`:252`) — parent highlighting breaks for any future nested route.
Hardcoded shell furniture: Settings link, non-interactive user row,
ThemeToggle, SignOutButton (`:267-298`). Platform sidebar is a hardcoded
3-item array (`platform/layout.tsx:45-64`).

Missing vs brief 2.2: `✦ Create` accent item, counts (NavEntry has **no count
field** — API contract addition, needs owner approval), amber action dot,
crimson connection warning, collapsed mode, workspace switcher as identity row
(current `OrgSwitcher` hides when orgs ≤ 1, `:367`), desktop topbar, ⌘K.

### 5.2 Route map (brief 2.3 → today)

| Brief route                                                    | Today                                                                                     | Verdict                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/login`, `/forgot-password`                                   | `(auth)/login`, `(auth)/forgot-password`                                                  | EXACT                                                                           |
| `/signup`                                                      | `(auth)/register`                                                                         | EXISTS-ELSEWHERE (see Q3)                                                       |
| `/onboarding/{business,brand,connect,goals}`                   | —                                                                                         | MISSING (nothing tenant-side; operator wizard is the de-facto onboarding)       |
| `/` Home                                                       | `app/app/page.tsx` = redirect → campaign studio; `dashboard` is nearest                   | MISSING as specified (also: `/` is the public landing — collision, Q2)          |
| `/create`                                                      | campaigns page `phase='prompt'`                                                           | EXISTS-ELSEWHERE (in-page state, no URL)                                        |
| `/create/intake/:draftId`                                      | —                                                                                         | MISSING (no draft concept exists; plans are client-only state, lost on refresh) |
| `/create/strategy/:draftId`                                    | `phase='plan'` → PlanView                                                                 | EXISTS-ELSEWHERE (no URL)                                                       |
| `/create/generating/:id` (both phases)                         | two booleans → spinner/one line                                                           | MISSING as screens                                                              |
| `/campaigns`                                                   | recent list inside PromptView                                                             | EXISTS-ELSEWHERE                                                                |
| `/campaigns/:id/{strategy,assets,schedule,performance,report}` | `phase='workspace'` + 12-item SECTIONS switcher; **no `[id]` route exists**               | MISSING as routes; report has no equivalent at all                              |
| `/campaigns/:id/assets/:assetId`                               | full-pane AssetEditor swap (not a drawer, no URL)                                         | EXISTS-ELSEWHERE                                                                |
| `/content`                                                     | `creative-library.tsx` mounted only on `/app/ai/images` + `/app/ai/video`                 | MISSING as cross-campaign route                                                 |
| `/calendar`                                                    | `/app/analytics/calendar`                                                                 | EXISTS-ELSEWHERE                                                                |
| `/leads`, `/leads/pipeline`                                    | `/app/crm/leads` (kanban only; no inbox table, no toggle); `/app/crm/pipelines` (deals)   | EXISTS-ELSEWHERE / PARTIAL                                                      |
| `/leads/:id`                                                   | — (no detail drawer either)                                                               | MISSING                                                                         |
| `/analytics/{overview,channels,audience,revenue}`              | 5 sibling routes, no tab shell, no shared date/campaign filter; channels+audience MISSING | PARTIAL                                                                         |
| `/connections`                                                 | one Meta card inside `/app/settings/organization` + a second unrelated list in social-hub | MISSING as a page                                                               |
| `/settings/{profile,brand,team,notifications}`                 | no profile; `settings/branding`; `settings/users`+`roles`; `/app/notifications` is a feed | PARTIAL                                                                         |
| `/settings/billing`                                            | —                                                                                         | intentionally omitted (owner decision)                                          |

Legacy routes with no brief counterpart: `crm/*` (7), `automation/*` (3),
`support/*` (2), `inbox/chat`, `documents/*` (2), `ai/*` grab-bag (9, nav-hidden
via `HIDDEN_NAV_SECTIONS`), `marketing/{email,sms,whatsapp,facebook,instagram,
social,seo,forms,pages}`, `analytics/{ai-usage,reports}`, `settings/{ai,
features,organization}`, `notifications`, public `f/[slug]`+`p/[slug]`.
Orphans (routable, no navEntry): `crm/notes`, `marketing/sms`,
`marketing/social`, `ai/history`, `ai/prompts`, `notifications`.
Nav entries that lead to "Coming soon" walls (`ModuleIntro`):
`documents/files`, `documents/contracts`, `marketing/whatsapp` (see Q5).

### 5.3 The two workflows (brief 2.4)

**Creation spine:** broken at intake (missing), planning (spinner), generation
(blocking POST), review→schedule (context switch to a different top-level
page), publish (per-asset dialog, closes to nowhere). Back does not preserve
state; a partially-completed campaign is not resumable (no persisted draft).
**Morning loop:** cannot exist — there is no Home, no AI brief, no executable
suggested actions. `AttentionStrip` (`dashboard/page.tsx:306-367`) is the seed
of Zone B but links out instead of acting, knows only 2 signals, always
renders, and its "awaiting review" count is wired to the wrong field
(`assetsGenerated` = total generated, `:144`).

---

## 6. Screen-by-screen verdicts (Part 3)

| #   | Screen           | Verdict      | Biggest gaps (current location)                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Login            | PARTIAL      | Centred 388px glass card, not 50/50 graphite split (`auth-shell.tsx:32-52`); no Google SSO anywhere; no rate-limit countdown (`login:44`); marketing subtitle; gradient logo blob. One AuthShell rewrite fixes all 6 auth screens incl. platform login (`platform/login:32-36`)                                                                                                                  |
| 2   | Onboarding       | MISSING      | No tenant flow at all; login drops users at `/app` → campaign studio. Operator wizard (`platform/organizations/new`, 4 steps, not resumable) covers business+brand fields but has colour pickers to retire, no tone-of-voice, no connect step, no first-goal prompt                                                                                                                              |
| 3   | Home             | MISSING      | `/app` is a redirect stub. Dashboard: no greeting/AI brief (Zone A), AttentionStrip ≠ Zone B (wrong shape, wrong count, always renders), 8 wrong tiles, no deltas/sparklines (both supported and unused), no campaign cards / scheduled rail / notifications rail, no empty state                                                                                                                |
| 4   | Command Center   | PARTIAL      | Right bones in `PromptView` (`campaigns:247`): centred hero, ⌘↵, recents, TemplatePicker. Gaps: 15 undifferentiated chips vs 4 labelled rows; chips append tags instead of filling editable sentences; no attach; decorative pill+gradient headline                                                                                                                                              |
| 5   | Guided intake    | MISSING      | No route/draft/steps/autosave/reach estimate; everything inferred from one free-text brief                                                                                                                                                                                                                                                                                                       |
| 6   | AI planning      | MISSING      | Boolean → button spinner (`campaigns:315`); no step list, ETA, cancel, findings                                                                                                                                                                                                                                                                                                                  |
| 7   | Strategy review  | PARTIAL/weak | `PlanView:383` read-only single column; not editable, no Request-changes/per-section regeneration, no competitor table/funnel/budget bar/gantt/KPIs, no sticky action rail, no iris treatment; "Generate assets" conflates approval with generation                                                                                                                                              |
| 8   | Asset generation | MISSING      | One blocking POST (`campaigns:172-200`); no streaming arrival, counter, per-channel groups, per-asset retry (one failure aborts all via toast)                                                                                                                                                                                                                                                   |
| 9   | Review queue     | PARTIAL      | Content-type sections, not status rail; text rows, no previews at aspect ratio; **no bulk select/approve**; editor replaces pane instead of 480px drawer; no Content/Targeting/Comments/History tabs; regeneration is lossy (`:828` overwrites body, no versions); zero J/K/A/R/Esc                                                                                                              |
| 10  | Calendar         | PARTIAL      | Month grid only (`analytics/calendar:210-292`); no week/list, **no drag-drop**, no unscheduled-approved right rail (buried in day drawer `:431`), no auto-schedule/timezone/publish-campaign, chips are filled colour blocks with no time/status rail                                                                                                                                            |
| 11  | Publish          | PARTIAL      | Per-asset dialog (`campaigns:1132`), not campaign-level; no preflight checklist, no live per-channel progress, closes to a toast; partial success invisible until later (`social-hub:612`)                                                                                                                                                                                                       |
| 12  | Performance      | MISSING      | No `/campaigns/[id]` route; nearest is org-wide Meta aggregate (`analytics/campaigns`) — no per-campaign metrics, deltas, sparklines, tile→chart filter, asset tables, insight rail                                                                                                                                                                                                              |
| 13  | Leads            | PARTIAL      | Kanban only; no inbox table/toggle; score fetched, never rendered; stages off-spec (Nurturing extra, Proposal missing, labels disagree with enums); stage tint painted on the _source_ badge (`crm/leads:215`); count but no column value; `<select>` not drag (optimistic update logic worth keeping, `:97-108`); no live flash (no polling); no detail drawer                                  |
| 14  | Analytics        | PARTIAL      | 5 sibling routes vs 4 tabs; no shared persisted filters; channels/audience tabs missing; funnel without drop-offs; one metric shape forced on all channels (`reports:154-161` renders `—` cells); zero export buttons; `ai-usage` (internal costs) exposed to clients                                                                                                                            |
| 15  | Connections      | MISSING      | 1 of 8 platforms truly connectable (Meta card in settings); full-page OAuth redirect vs popup-update-in-place (`meta-connect:76-77`; return-leg handling couples the card to the redirect-URI page, `:49-71`); raw `act_` IDs shown in mono (`:177-181`); social-hub banner exposes OAuth/dev-app roadmap (`:222-225`); **expired-token state not modelled at all**; `window.confirm` disconnect |
| 16  | Campaign report  | MISSING      | No client-facing report UI anywhere. Worker emails `composeReportHtml` monthly (`apps/worker/src/reports/`) — obvious content model to reuse; user cannot open/export/share any report                                                                                                                                                                                                           |

Platform console: same primitives as tenant app so adoption is cheap; fix
amber dormancy banner (`platform/analytics:97,190`), hardcoded `#fff` logo
chips (breaks dark mode; `platform/page:105` et al.), hand-rolled badges on
org detail, raw `＋` glyph. Operator-side fee/margin UI is permitted (only
_client-facing_ billing is omitted) — keep it out of view-as surfaces.

---

## 7. Frozen surfaces the redesign must not break

From `lib/api.ts` / `lib/workspace.ts` / `lib/platform.ts` (contract surface —
see `API_CONTRACT.md`):

- **Auth realms:** tenant = cookie via `credentials:'include'` (`api.ts:90`);
  platform = bearer from `localStorage['mos.platform.token']` only when
  `opts.platformAuth` (`:75-78`); view-as = `x-mos-view-as` from
  `sessionStorage['mos.viewas.token']` on every non-platform call (`:80-84`),
  mutually exclusive with bearer by construction.
- **Quirks:** `Content-Type` only set when a body exists (`:74`) — bodyless
  POST verbs depend on it; `ApiError`/`problemMessage` zod flattening
  (`:118-138`); sign-out lands on `/`, not `/login`.
- **Storage keys:** `mos.platform.token`, `mos.viewas.token` (sessionStorage,
  same-tab by design), `mos:shell:v1` (shell cache + its 5 invalidation
  points: 401, org switch, sign-out, needsOrganization, exit view-as),
  `mos:theme` (read by pre-paint script).
- **View-as:** suppresses shell cache, skips `GET /v1/auth/session`
  (`app/app/layout.tsx:112-133`), 401 → `/platform` not `/login`; banner
  currently scrolls with content (`:301,314-351`) — may be restyled/pinned but
  behaviour stays.
- **`applyBranding` (`workspace.ts:28-36`):** writes `--color-primary`,
  `--color-accent`, `--color-primary-hover` (not derived — same value),
  `--brand-heading-font`, `--brand-body-font`. Never writes secondaryColor/
  logoUrl/faviconUrl/loginTagline. **No reset path** — previous org's inline
  properties persist on `<html>` after org switch/view-as exit. The **response
  shape stays frozen**; the retirement (owner-approved) changes only what the
  function _does_: stop writing colour/font tokens, start rendering
  `logoUrl` + `displayName` — note `logoUrl` is rendered nowhere in the tenant
  shell today, so this is net-new rendering.
- Tenant nav counts / amber dots require a **NavEntry shape addition** —
  API contract change, owner approval needed (Q1).

---

## 8. State & data coupling

- Uniform pattern: `'use client'` + per-page `useState`/`useEffect` +
  `api.get` inline. No server components, no query layer, no dedupe
  (dashboard and reports fire the same 3 requests). 6 audited files lean on
  `eslint-disable react-hooks/exhaustive-deps`.
- **696 inline `style={{}}` across 57 files** (campaigns 96, shell 34,
  social-hub 31, org detail 29, calendar 27); 60 hex literals in TSX
  (worst: `f/[slug]` 12, `p/[slug]` 11 — deliberate; charts 6).
- Duplicated per-page code that Phase 3/5 should centralise:
  `TimeseriesPoint`/`FunnelStage`/`ChannelPerformance` types
  (dashboard ↔ reports), `STAGE_LABELS` ×3 **with conflicting labels**
  (Converted/Completed/Won drift), `SOURCE_LABELS` ×3,
  formatting helpers per page with **currency drift** (`₹` in
  `analytics/campaigns:61` vs `$` in revenue/dashboard/ai-usage).
- `campaigns/page.tsx` (1,415 lines, 17 components, 25 useState) is less
  tangled than it looks: PromptView/PlanView/AssetRow/sections are pure; all
  11 API calls sit in the page shell, `AssetEditor` (the real knot — 7 states,
  9 endpoints, must become the drawer+tabs) and `PublishDialog`.
  `openCampaign():189` refetches the whole list to find one campaign — no
  `/campaigns/:id` fetch exists in the contract; check before Phase 5 whether
  the list call suffices or this needs an owner conversation.
- `crm/leads/page.tsx:60-65` `ago()` calls `Date.now()` during render —
  hydration-drift risk (contrast the deliberately stable `shortDate`,
  `dashboard:59`).

---

## 9. Existing strengths to preserve (behaviours, not pixels)

1. **Two-gate approval** — approve concept → generate media → second review
   (`campaigns:848-870`, self-relabelling button `:1049`, rationale comment
   `:844-847`).
2. **A/B variant picker** with `/choose-variant` promotion (`:924-963`).
3. **Reject-reason chips feeding regeneration** + "The AI learns from this"
   (`RejectDialog:1264-1288`) — maps directly to brief's Request changes.
4. **Template picker / save-as-template round trip** (`:1333,:1377`).
5. **DayComposer dual path** — schedule approved creative or quick post
   (`analytics/calendar:315`); its approved-asset list _is_ the brief's
   unscheduled pile, relocated.
6. **Merged calendar model** — assets + social posts, `publishedAt ??
scheduledFor` (`:94-120`).
7. **Per-target publish honesty** — status/failureReason/permalink per channel
   (`social-hub:603-626`) — raw material for the brief's partial-success view.
8. **Optimistic stage move with revert** (`crm/leads:97-108`).
9. **Skeleton-first loading** (~20 sites), `EmptyChart`, inline auth errors
   (never toasts), `ResourcePage`'s four-state body, monochrome
   `PlatformIcon`, mono+tabular metric values, reduced-motion handling,
   ThemeToggle persistence pattern.

---

## 10. Open questions for the owner (blocking or shaping later phases)

- **Q1 — Sidebar counts/amber dots** need a `NavEntry` addition (count +
  attention flag) in the workspace payload — API contract change. Approve
  extending the contract, or defer dots to a frontend-computed subset?
- **Q2 — The `/` collision.** Brief gives `/` to authenticated Home; today `/`
  is the public landing (last Hanzo remnant) and the tenant app lives under
  `/app`. Options: keep the `/app` prefix and map brief routes under it
  (least churn, breaks no auth redirect), or move the app to bare paths.
  Phase 4 needs this decided per-route anyway.
- **Q3 — Register page fate.** Self-signup conflicts with operator
  provisioning (its own subtitle admits it, `register:53`). Keep, repoint to
  invite-only, or delete?
- **Q4 — Landing page fate.** Delete + redirect to `/login`, keep as splash,
  or restyle to the new system?
- **Q5 — "Coming soon" nav entries** (`documents/*`, `marketing/whatsapp`)
  live in read-only `packages/contracts/features.ts`. Approve disabling them
  backend-side, or keep the walls and restyle ModuleIntro?
- **Q6 — Public renderers** `f/[slug]`, `p/[slug]`, `page-blocks.tsx` carry
  their own hardcoded palettes by design. In or out of redesign scope?
- **Q7 — Google SSO** on login (brief screen 1) has no backend support —
  omit until the backend adds it (recommended), or is it planned?
- **Q8 — Live lead arrival** (screen 13's cobalt flash) needs a polling or
  push mechanism that doesn't exist; polling behaviours are contract-frozen.
  Approve adding a poll, or drop the flash?
- **Q9 — Lead stage vocabulary**: backend enum has NURTURING and no
  PROPOSAL. Relabel-only (presentation), or is an enum change on the table
  (backend, out of redesign scope)?
- **Q10 — Branding colour retirement** is frontend-scope for rendering
  (settings UI drops colour inputs, `applyBranding` stops writing colour
  tokens, wizard step 2 drops pickers) — but stored `primaryColor` values
  remain in the DB and `PUT /config/branding` still accepts them. Confirm
  it's acceptable to simply stop reading/sending them client-side
  (recommended; no backend change needed), and whether `loginTagline` stays.

---

## 11. Notes for the next phases

- **Phase 2 (tokens):** replace the `:root` block under the brief's names;
  delete gradient/glass/pill tokens rather than aliasing; resolve the brief's
  own `--text-secondary` name collision; self-host General Sans + IBM Plex
  Mono under `apps/web/public/fonts/`; keep `--color-primary/accent/...`
  temporarily aliased to system values _only_ until `applyBranding` is cut
  over in the same phase, then remove. Retire branding colour inputs first or
  concurrently (they override tokens at runtime).
- **Phase 3 (primitives):** StatusPill/StatusRail first (migration list in
  §3), then MetricTile consolidation (wire the dormant delta+Sparkline),
  AssetCard extraction, DataTable density, glyph additions. Retheming
  kit/ui/resource-page carries ~80% of pages.
- **Phase 4 (shell/routes):** the route-map table in §5.2 is the approval
  checklist; nav is server-driven so the visual shell can change freely but
  item _set_ changes touch read-only contracts (Q1/Q5).
- **Phase 5 (screens):** campaigns/page.tsx decomposes along the seams listed
  in §8; the missing screens (intake, planning, generation, report) are
  greenfield builds; check early whether persisted drafts can ride existing
  endpoints (plan → campaign creation) — if a draft store is genuinely
  required, that's an owner conversation, not a mock.
- **Phase 6 (verification):** re-run the §2 rule inventory and §3 migration
  list as the acceptance checklist; both are written to be greppable.
