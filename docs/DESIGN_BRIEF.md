# Design Brief — VSP AI Marketing OS

This is the approved design system, information architecture and per-screen
specification for the product's frontend. Every design session refers back to
this document; it is what stops the design drifting across sessions.

Nothing in this brief touches the backend. All API contracts are frozen — see
`API_CONTRACT.md`.

Two product-level adaptations agreed with the owner (2026-08-02):

- This brief **replaces** the previous "Hanzo" design direction entirely.
- White-label tenant branding is **logo + display name only**. Per-organisation
  colour repaint is retired: colour belongs to the semantic system (Rule 2)
  and is never overridden per tenant.
- Screens that conflict with settled product decisions are adapted, not
  blindly implemented: there is **no client-facing billing surface** (the
  operator bills offline; `/settings/billing` from the spec is omitted), and
  the product has two realms (tenant app + operator platform console with
  view-as). The platform console adopts the same system.

---

# PART 1 — Design system

## 1.1 The governing idea

Your product is not a content generator. It is a **decision surface**. The AI does the work; the human's entire job is judgment — approve, edit, reject, regenerate, launch. Everything in the UI should serve that.

Three rules follow from this, and they are what make the design coherent rather than decorative:

**Rule 1 — AI output looks provisional until a human approves it.**
Anything the AI produced and nobody has reviewed renders with an iris-tinted surface (`#F5F3FF`), a 3px iris left rail, and an "AI draft" label. On approval it resolves to a solid white surface with a jade rail. The user can see, from across the room, what has been vetted and what hasn't. This is the signature element of the product — do not water it down into a generic badge.

**Rule 2 — Colour means status. Nothing else.**
No decorative colour anywhere. No brand colours for channels — Instagram, Facebook, LinkedIn, X, Google and Email are all rendered as monochrome glyphs at `--text-secondary`. Colour is spent entirely on state and performance, so a coloured pixel always means something.

**Rule 3 — Amber is reserved for "you need to decide."**
It appears nowhere else. Not on warnings, not on highlights, not on charts. Users learn within a day: amber on screen means work is waiting for me. This is the single most valuable convention in an approval-centric product.

## 1.2 Colour tokens

```css
/* Surfaces — cool graphite, not warm cream */
--surface-canvas: #f6f7f9;
--surface-raised: #ffffff;
--surface-sunken: #edeff3;
--surface-inverse: #12151c;
--surface-hover: #f1f3f7;
--surface-selected: #edf1fe;

/* Borders */
--border-subtle: #e4e7ec;
--border-default: #d3d8e0;
--border-strong: #b4bcc8;
--border-focus: #2b4fe8;

/* Text */
--text-primary: #12151c;
--text-secondary: #576070;
--text-tertiary: #8790a0;
--text-inverse: #ffffff;
--text-link: #2b4fe8;

/* Semantic — one meaning each, no exceptions */
--cobalt-600: #2b4fe8; /* primary action, selected nav, links */
--cobalt-100: #e3e9fd;
--cobalt-800: #17307f;

--amber-600: #c97a0e; /* RESERVED: human decision required */
--amber-100: #fbf0dc;
--amber-800: #6b3f04;

--jade-600: #0e7c5a; /* live, approved, published, positive delta */
--jade-100: #dcf2ea;
--jade-800: #06422f;

--crimson-600: #c8324b; /* rejected, failed, negative delta, destructive */
--crimson-100: #fbe4e8;
--crimson-800: #7a1527;

--iris-600: #6b5dd3; /* AI-generated, not yet reviewed */
--iris-100: #eeebfc;
--iris-050: #f5f3ff;
--iris-800: #372c7a;

--slate-600: #576070; /* draft, paused, archived, neutral */
--slate-100: #edeff3;
```

**Contrast:** every `-600` on its matching `-100` tint clears WCAG AA at 14px. Never put `-600` text on white for body copy — use `--text-primary`. Never put white text on `-100` tints.

**Data visualisation** gets its own categorical ramp, used only inside charts and never in UI chrome: `#2B4FE8 #6B5DD3 #0E7C5A #C97A0E #C8324B #0E6F8C`. Series must also differ by dash pattern or marker shape, not colour alone.

## 1.3 Typography

| Role           | Face                         | Notes                                                                                                   |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Interface      | **General Sans** (Fontshare) | Fallback: `Inter, system-ui, sans-serif`. Self-host the woff2 — no CDN dependency in an enterprise app. |
| Data / numeric | **IBM Plex Mono**            | All metrics, currency, IDs, timestamps, percentages, ad spend. Tabular figures on.                      |

Two families. No third. No serif display face — it would fight the density.

```css
--text-metric-hero: 36px / 40px / 500 / -0.02em /* dashboard headline numbers */
  --text-metric: 28px / 32px / 500 / -0.02em --text-title: 22px / 28px / 500 / -0.01em
  /* page title */ --text-section: 18px / 24px / 500 / -0.01em
  /* card and section heads */ --text-subhead: 15px / 22px / 500 / 0 --text-body: 14px /
  21px / 400 / 0 /* DEFAULT — not 16px */ --text-body-strong: 14px / 21px / 500 / 0
  --text-secondary: 13px / 19px / 400 / 0 /* helper, metadata */ --text-caption: 12px /
  16px / 400 / 0 --text-label: 11px / 14px / 500 / 0.06em / uppercase
  /* eyebrows, status pills */;
```

Body is **14px**. This is enterprise software people live in for hours — 16px body wastes vertical space and makes dense tables impossible.

## 1.4 Space, radius, elevation

```css
--space: 4 8 12 16 20 24 32 40 48 64 /* 4px base unit */ --radius-sm: 4px
  /* pills, badges, tags */ --radius-md: 6px /* inputs, buttons */ --radius-lg: 10px
  /* cards, panels */ --radius-xl: 14px /* modals, drawers */ --elev-0: none
  /* flat in-flow cards */ --elev-1: 0 1px 2px rgba(18, 21, 28, 0.06) /* raised card */
  --elev-2: 0 4px 12px rgba(18, 21, 28, 0.08) /* dropdown, popover */ --elev-3: 0 12px
  32px rgba(18, 21, 28, 0.14) /* modal, drawer */;
```

Never more than two floating layers on screen at once. A third means it should have been a full page.

## 1.5 Density

| Element               | Height                                                   |
| --------------------- | -------------------------------------------------------- |
| Table row             | 44px comfortable / 36px compact (user toggle, persisted) |
| Input, select, button | 36px default, 32px small, 44px large                     |
| Sidebar item          | 36px                                                     |
| Top bar               | 56px                                                     |
| Sidebar width         | 244px expanded / 60px collapsed                          |
| Card padding          | 20px                                                     |
| Page gutter           | 24px                                                     |

## 1.6 Status vocabulary — used identically everywhere

| State         | Colour  | Rail                 | Pill background / text             |
| ------------- | ------- | -------------------- | ---------------------------------- |
| Draft         | Slate   | —                    | `--slate-100` / `--text-secondary` |
| AI draft      | Iris    | 3px iris             | `--iris-100` / `--iris-800`        |
| Needs review  | Amber   | 3px amber            | `--amber-100` / `--amber-800`      |
| Needs changes | Amber   | 3px amber, dashed    | `--amber-100` / `--amber-800`      |
| Approved      | Jade    | 3px jade             | `--jade-100` / `--jade-800`        |
| Scheduled     | Cobalt  | 3px cobalt           | `--cobalt-100` / `--cobalt-800`    |
| Publishing    | Cobalt  | animated cobalt      | `--cobalt-100` / `--cobalt-800`    |
| Live          | Jade    | 3px jade + pulse dot | `--jade-100` / `--jade-800`        |
| Rejected      | Crimson | 3px crimson          | `--crimson-100` / `--crimson-800`  |
| Failed        | Crimson | 3px crimson          | `--crimson-100` / `--crimson-800`  |
| Completed     | Slate   | —                    | `--slate-100` / `--text-secondary` |

One `<StatusPill status="..."/>` component. One `<StatusRail>`. Never hand-rolled again.

## 1.7 Motion

```css
--dur-fast: 120ms /* hover, focus */ --dur-base: 200ms /* dropdown, tab switch */
  --dur-slow: 320ms /* drawer, modal, page transition */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
```

Three places motion is allowed to be expressive, because in each one it carries information:

1. **AI generation** — assets appear in sequence as they finish, each fading in with its iris rail drawing downward. The user watches work arrive.
2. **Approval** — the iris rail wipes to jade left-to-right over 320ms. Approval should feel like it landed.
3. **Publishing** — a per-channel progress line, each channel ticking to jade as the worker confirms.

Everywhere else: opacity and 2–4px transforms only. Wrap all of it in `prefers-reduced-motion`.

---

# PART 2 — Information architecture and navigation

## 2.1 The structural spine

**A campaign is the container, and its lifecycle stages are tabs inside it.** This is the most important IA decision in the product. The user never loses their place, never wonders "where did my strategy go", never navigates away from a campaign to schedule it.

```
/campaigns/:id
  ├─ Strategy       the approved plan, always readable
  ├─ Assets         the review queue for this campaign
  ├─ Schedule       the calendar for this campaign
  ├─ Performance    live metrics (appears once published)
  └─ Report         post-completion analysis (appears once ended)
```

Global Content, Calendar and Analytics pages exist too — those are the cross-campaign views.

## 2.2 Sidebar

```
◆ Acme Skincare              ← workspace switcher
─────────────────────────────
✦ Create                     ← accent-treated, always first, opens Command Center
─────────────────────────────
⌂ Home
▣ Campaigns          3
◈ Content            12 ●    ← amber dot: items awaiting you
▤ Calendar
◐ Leads              8 ●
▦ Analytics
─────────────────────────────
⚡ Connections       1 ⚠      ← crimson if a token expired
⚙ Settings
─────────────────────────────
JD  John Doe                 ← avatar, plan, sign out
```

- Only **one** nav level. No nested accordions — everything below the top level lives as tabs inside its page.
- Counts are neutral grey. The **amber dot** is separate and means "your action required". Amber dot in the sidebar → amber pill on the page → amber rail on the row. One colour, one meaning, three zoom levels.
- Collapsed state is icons only with tooltips, persisted per user.
- `⌘K` opens the command palette from anywhere: campaigns, assets, leads, settings, plus verb commands ("create campaign", "connect Instagram").

## 2.3 Route map

```
/login  /signup  /forgot-password
/onboarding/{business,brand,connect,goals}
/                                    → Home
/create                              → AI Command Center
/create/intake/:draftId              → guided questions (steps in URL: ?step=objective)
/create/strategy/:draftId            → strategy review
/create/generating/:campaignId       → generation progress
/campaigns
/campaigns/:id/{strategy,assets,schedule,performance,report}
/campaigns/:id/assets/:assetId       → asset detail (drawer over the queue)
/content                             → all assets, all campaigns
/calendar
/leads  /leads/:id  /leads/pipeline
/analytics/{overview,channels,audience,revenue}
/connections
/settings/{profile,brand,team,billing,notifications}
```

Note: `/settings/billing` is omitted in this product (no client-facing money
surface); route prefixes are mapped onto the existing app during Phase 4 with
per-route owner approval before any path changes.

## 2.4 The two workflows that must never break

**The creation spine** — one continuous forward motion, no dead ends:

```
Home → Create → Intake (4 steps) → Strategy → Approve
     → Generating → Assets → Approve → Schedule → Publish → Performance
```

Every screen in that chain has exactly one primary action. Back always preserves state. A partially-completed campaign is always resumable from Home.

**The morning loop** — the reason they log in daily:

```
Home → AI brief ("CTR dropped 9%, Instagram outperformed Facebook")
     → suggested action → one click → done → back to Home
```

Both loops close. Neither dumps the user on a screen with no obvious next move.

---

# PART 3 — Screen specifications

Every screen below specifies: purpose, layout, primary action, states.

Universal rules for all screens: one primary action per screen; loading uses skeletons shaped like the real content, never spinners; empty states name the space and offer the verb; errors say what failed and what to do; every destructive action is confirmable but never blocked behind a typed phrase except account deletion.

---

### 1. Login — `/login`

Split 50/50. Left is a graphite panel showing one real anonymised result ("Reach 2.4M · ROAS 4.1× · 38 days") in Plex Mono against `--surface-inverse`. Right is white, centred, max 380px: logo, "Sign in", email, password, Sign in (cobalt, full width), Google SSO, forgot-password link.

No marketing copy. No feature list. This is a tool people use every day.

States: invalid credentials (inline, above form, crimson — never a toast); rate-limited with a countdown; SSO redirect.

---

### 2. Onboarding — `/onboarding/*`

Four steps, persistent progress rail on the left, resumable.

1. **Business** — name, industry, website, size.
2. **Brand kit** — logo upload, brand colours, tone-of-voice picker, target market. Everything here feeds AI generation later, so say so: "This shapes everything the AI writes for you."
3. **Connect channels** — the card grid from screen 15. Minimum one to proceed, but "Skip for now" is always available.
4. **First goal** — the same prompt box as the Command Center, so the user learns the core interaction on day one.

Ends by dropping them straight into their first intake flow, not on an empty dashboard.

---

### 3. Home — `/`

The most-visited screen. Three zones, top to bottom.

**Zone A — the brief.** Full-width card, `--surface-raised`, iris left rail.
`Good morning, John` at 22px, date at 13px secondary. Then the AI's read on yesterday as 3–5 plain sentences, each with the number in Plex Mono and the delta coloured jade or crimson. Beneath it, 2–4 suggested actions as inline buttons that execute directly — "Increase Instagram budget 20%", "Approve 4 pending assets", "Launch remarketing". Not links to elsewhere. Actions.

**Zone B — action required.** Only renders when count > 0. Amber-railed card listing what needs the user: assets awaiting review, a strategy awaiting approval, a failed publish, an expired token. Each row is one line with a right-aligned button. This zone is why they log in.

**Zone C — metrics and activity.** Four metric tiles (Revenue, Leads, Reach, ROAS) — 36px Plex Mono value, 11px uppercase label above, delta and sparkline below. Then a two-column split: active campaigns as compact cards with a progress bar and live pill, and a right rail with the next 5 scheduled posts and recent notifications.

Empty state (new user): Zone A becomes "Let's launch your first campaign" with the prompt box inline. Zones B and C do not render at all — no skeletons of things that don't exist.

---

### 4. AI Command Center — `/create`

The heart of the product. Give it room.

Centred column, 720px max, vertically weighted to the upper third. `What would you like to achieve today?` at 28px/500. Below it, a large textarea — min 120px, growing to 320px, 16px text (the one place body type goes up, because this is the primary input), `--surface-raised`, 1px border, cobalt focus ring, `--radius-lg`. Placeholder is a real example: `Launch my new vitamin C serum to women 25-40 in Mumbai and Delhi`.

Bottom-right inside the box: attach (brand assets, competitor links), and the submit button — cobalt, `Continue →`, with `⌘↵`.

Below the box, suggestion chips in three labelled rows, not one undifferentiated mass:

- **Launch** — Product launch · Festive campaign · Brand awareness
- **Grow** — Get more leads · Increase traffic · Improve sales
- **Channel** — Instagram campaign · Meta ads · Google ads · Email campaign
- **Analyse** — Competitor analysis · Improve last campaign · Content for next month

Clicking a chip fills the textarea with an editable full sentence, not just the chip text. The user should see what a good prompt looks like.

At the bottom, quiet and small: `Recent drafts` — resumable in-progress campaigns.

---

### 5. Guided intake — `/create/intake/:draftId`

Four steps. **One question per screen.** Do not put all four on one page — that turns a conversation into a form and kills the feeling that the AI is thinking with you.

Layout: 640px centred column. Step rail across the top (4 dots, current one filled cobalt, completed ones jade with a tick, all clickable backward). The user's original prompt sits above the question in a quiet grey card so they never lose the thread.

- **Step 1 — Objective.** Six large radio cards in a 3×2 grid, each 140×88px with an icon, label, and one line of consequence: "Sales — optimised for conversion, ad spend weighted to retargeting". The user should understand what their choice _does_.
- **Step 2 — Channels.** Multi-select cards. Connected channels are selectable; unconnected ones show `Connect` inline and open a modal without leaving the step. Selected cards get a cobalt border and check. Preselect based on their objective, and say why: "Recommended for product launch."
- **Step 3 — Audience.** The only multi-field step: age range (dual slider), gender (segmented), locations (tokenised multiselect with autocomplete), interests (tag input with AI suggestions appearing as the user types), languages, occupation. Right side shows a live estimated reach figure in Plex Mono that updates as fields change — this makes the form feel responsive instead of bureaucratic.
- **Step 4 — Duration and budget.** Four duration cards (7/15/30/90 days) plus a custom date range. Budget input with an AI-suggested figure prefilled and justified: "Suggested ₹45,000 based on 30 days across 3 channels in your market."

Footer bar, fixed to the column: `Back` (ghost, left) and `Continue` (cobalt, right). Autosave on every change, with a quiet `Saved` in the corner.

---

### 6. AI planning — `/create/generating/:draftId?phase=strategy`

Full-screen focused state while the AI builds the plan. Centred. A vertical list of the things being worked out — Analysing your market → Researching competitors → Building the funnel → Allocating budget → Drafting the schedule — each ticking from grey to jade as it completes, with the current one showing a subtle pulse.

Estimated time in Plex Mono. `Cancel` available, quiet.

If it takes longer than 45 seconds, surface intermediate findings as they land ("Found 6 competitors in your category") so the wait feels productive rather than dead.

---

### 7. Strategy review — `/create/strategy/:draftId`

The most important approval in the product. The user is approving a plan, not skimming a document.

Two-column, 70/30. Left is the strategy in stacked cards, each independently editable via a pencil that turns the card into inline fields:

Overview · Audience (with the estimated reach number large) · Competitor analysis (a table of 4–6 competitors, their positioning, and where you differ) · Funnel (a horizontal 4-stage diagram: Awareness → Consideration → Conversion → Retention, each stage naming its channels and content types) · Channel plan (per channel: post count, formats, cadence) · Budget allocation (a horizontal stacked bar plus a table with editable amounts that rebalance live) · Timeline (a compact gantt across the campaign duration) · KPIs and success metrics (target vs. benchmark in Plex Mono).

Right column is sticky: campaign summary, estimated reach, total budget, duration, then the actions — `Approve strategy` (cobalt, full width, primary), `Request changes` (secondary, opens a comment box that regenerates specific sections), `Save as draft` (ghost).

The whole page carries the iris "AI draft" treatment until approved. `Request changes` must regenerate only the section commented on, not the entire plan — regenerating everything destroys the user's earlier edits and is the fastest way to lose their trust.

---

### 8. Asset generation — `/create/generating/:campaignId?phase=assets`

Do not show a progress bar and nothing else. Show the work arriving.

Full-width grid. Each asset appears as a card the moment it finishes, fading in with its iris rail drawing down — Instagram posts, then Facebook, LinkedIn, Stories, Reels, ad copy, email, landing page, blog, hashtags, keywords. A counter reads `24 of 38 generated` in Plex Mono. Grouped by channel, each group with its own progress.

Failures per asset are inline and non-blocking: crimson rail, "Couldn't generate", `Retry` on the card. The rest keeps going.

`Review assets →` becomes available as soon as the first group completes. Nobody should have to wait for the blog post to review their Instagram grid.

---

### 9. Review queue — `/campaigns/:id/assets`

Where users spend the most time after Home. Three-pane, and the pane widths matter.

**Left rail, 220px** — filters. Status list with counts (Needs review 12 · Approved 18 · Changes 3 · Rejected 1), then channel, then content type. Selected filter gets a cobalt left border.

**Centre, fluid** — the asset grid. Toolbar: view toggle (grid / list), sort, `Select all`, and a bulk action bar that slides up from the bottom when anything is selected showing `12 selected · Approve · Reject · Request changes · Schedule`. Bulk approve is essential — a 38-asset campaign reviewed one at a time is a bad afternoon.

Each card: status rail on the left edge, creative preview at the correct platform aspect ratio (1:1, 9:16, 16:9 — never letterboxed), channel glyph and type label, caption truncated to 2 lines, status pill, and hover actions (Approve ✓ · Edit ✎ · Regenerate ↻ · Reject ✕).

**Right drawer, 480px** — opens on click, does not navigate away. Full creative at top, then tabs: `Content` (editable caption, hashtags, CTA, link — every field inline-editable), `Targeting` (for ads: audience, placements, budget), `Comments` (threaded, @mentions), `History` (every version with a restore button — regeneration must never be lossy).

Drawer footer, always visible: `Approve` (cobalt) · `Request changes` (secondary) · `Reject` (ghost, crimson text) · `Regenerate` with an optional instruction field.

`J`/`K` move between assets, `A` approves, `R` rejects, `Esc` closes. A power user should be able to clear a queue without touching the mouse.

---

### 10. Calendar — `/campaigns/:id/schedule` and `/calendar`

Month view default, with week and list toggles. Drag and drop.

Each day cell holds up to 3 asset chips — channel glyph, time in Plex Mono, 20-char truncated title, status rail on the left edge of the chip — then `+4 more`. Today's cell gets a cobalt top border. Past days are dimmed but not disabled.

Dragging shows a cobalt drop indicator; invalid drops (past dates, platform rate limits, unapproved assets) show a crimson indicator with a tooltip stating the reason before the user releases. Never accept a drop then reject it with a toast.

Right rail, 280px: unscheduled approved assets, draggable onto the calendar. This is the pile the user is trying to empty, so show its count.

Bulk toolbar: `Auto-schedule` (AI distributes by optimal posting time per channel, with a preview before applying), timezone selector, `Publish campaign` (cobalt, primary).

Optimal-time hints render as a faint jade underline on the recommended hour in week view. Suggestion, not decoration.

---

### 11. Publish — modal over the calendar

Never a bare confirm dialog. This is the moment of consequence.

Modal, 560px. Summary first: `38 assets · 5 channels · Mar 12 – Apr 11 · ₹45,000`. Then a per-channel checklist: channel glyph, asset count, connection status. Any problem — expired token, missing permission, unapproved asset in the schedule — appears here as a crimson row with an inline fix, and the publish button stays disabled until resolved.

`Publish campaign` (cobalt, full width). On click, the modal becomes a live progress view: each channel ticks to jade as its worker confirms, crimson with `Retry` if it fails. Partial success is a real outcome and must be shown honestly — "4 of 5 channels published. Instagram failed: token expired. [Reconnect]".

On completion the modal closes to the Performance tab, not back to the calendar.

---

### 12. Performance — `/campaigns/:id/performance`

Header: campaign name, live pill with pulse dot, running duration, `Pause` and `Improve campaign` (the latter is cobalt and opens the Command Center prefilled with "Improve this campaign").

Metric row of six tiles: Reach · Clicks · Conversions · Leads · Revenue · ROAS. 28px Plex Mono, delta vs. the previous equivalent period, sparkline. Clicking a tile filters the chart below.

Main chart: multi-series time series with a metric selector and a range selector (24h / 7d / 30d / all). Channel comparison as a horizontal bar chart, not a pie — people compare lengths far better than angles.

Below: top and bottom performing assets side by side with their real creative previews. A table of every asset with its per-asset metrics, sortable, exportable.

Right rail: AI insights as they arrive, each a sentence plus an action button. Same pattern as the Home brief, so the interaction is already learned.

---

### 13. Leads — `/leads` and `/leads/pipeline`

Two views, one toggle.

**Inbox** — a dense table: name, contact, source campaign, channel glyph, lead score, status, assignee, created. Lead score renders as a 0–100 number in Plex Mono with a 4px bar beneath — jade above 70, amber 40–70, slate below. Row click opens a right drawer with full details, form submission data, activity timeline, notes, and assignment.

**Pipeline** — kanban columns (New · Contacted · Qualified · Proposal · Won · Lost), drag to move, column headers showing count and total value. Won is jade, Lost is crimson, everything else neutral.

New leads arriving live get a brief cobalt flash on the row. Not a toast — a toast for every lead is noise.

_Adaptation note: lead-score amber band (40–70) conflicts with Rule 3 — in
this product the mid band renders slate, and amber remains exclusively
"human decision required"._

---

### 14. Analytics — `/analytics/*`

Four tabs: Overview, Channels, Audience, Revenue. Global date range and campaign filter persist across tabs.

Overview: six metric tiles, revenue time series, channel comparison bars, funnel visualisation with drop-off percentages between stages, top campaigns table.

Channels: per-channel cards with their own metric sets — Meta gets CPC, CPM, CTR, frequency, spend, ROAS; Email gets open rate, click rate, unsubscribes; Google gets impression share and quality score. Do not force one metric shape onto every channel.

Audience: demographic breakdowns, geographic map, interest and device splits, best-performing segment called out as a sentence.

Revenue: attribution by channel and campaign, CAC, LTV, ROAS trend.

Every chart has an export button. Every chart has an empty state that explains what data it needs and where it comes from.

---

### 15. Connections — `/connections`

Card grid, one per platform: Instagram, Facebook, LinkedIn, X, Google Ads, Google Analytics, Email, Website.

Connected card: monochrome channel glyph, account name, jade dot, last-synced timestamp in Plex Mono, permission list, `Disconnect` (ghost).
Disconnected: glyph at 40% opacity, one line naming what connecting enables, `Connect` (cobalt).
Expired: crimson rail, `Reconnect` (cobalt), plus a plain sentence about what is currently broken — "Scheduled posts to this account will fail until reconnected."

OAuth runs in a popup, and the card updates in place. Never navigate the user away from this page.

This page never mentions Meta Marketing API, Graph API, tokens, scopes or app IDs. The user connects an account. That is all they need to know.

---

### 16. Campaign report — `/campaigns/:id/report`

Generated when a campaign ends. Reads like a document, not a dashboard — this is the artifact the user forwards to their boss.

Header with campaign name, date range, `Export PDF`, `Share link`. Then: executive summary in plain sentences with the key numbers inline; results grid (Revenue, ROI, ROAS, Leads, CPL, Reach); performance over time; channel breakdown table; best and worst post with creative and a sentence on why each performed as it did; audience insight; AI recommendations as numbered actions; and a `Next campaign suggestions` block where each suggestion is a button that opens the Command Center prefilled.

The report should end by starting the next loop. That is the whole product model.
