# API Contract — frontend ↔ backend (FROZEN)

Derived from real code on 2026-08-02 (Phase 0 of the redesign). Every shape
here — paths, methods, field names, casing, types, headers, auth flows,
polling behaviour — is **frozen**. Redesign work may rearrange presentation
around these calls but never change what is sent or how a response is read.
If a redesign appears to need a contract change: STOP and ask the owner.

Line numbers are as of commit `46784c4` and will drift; the file paths and
shapes are the contract.

---

## 0. Cross-cutting conventions

**Wrapper** — `apps/web/src/lib/api.ts`

- Base URL: `NEXT_PUBLIC_API_URL` env (fallback `http://localhost:4000`),
  trailing slashes stripped; every call goes to `${base}/v1${path}`
  (server: `app.setGlobalPrefix('v1', { exclude: ['health','health/ready'] })`).
- Every request: `credentials: 'include'` (Better Auth HttpOnly cookie rides
  along; app+API are same-site) and `Accept: application/json`.
  `Content-Type: application/json` is added **only** when a body is passed —
  `api.post(path)` with no body sends neither the header nor a payload.
- Verbs: `api.get/post/put/patch/del`; `del` accepts a body (bulk delete).
- No retries, no timeouts, no interceptors; optional `AbortSignal` passthrough.
- Errors: non-2xx throws `ApiError { message, status, code ('unknown' default),
problem }` from RFC 9457 problem+json `{ type, title, status, code, detail?,
traceId?, errors?: {path,message}[] }`. `problemMessage()` flattens NestJS/zod
  issue arrays into `"path.to.field: message · …"`, fallback
  `Request failed (<status>)`.

**Three auth realms**

1. **Tenant** — Better Auth session cookie (`mos.session_token`, HttpOnly).
   Default for all `/v1` calls.
2. **Platform** — `Authorization: Bearer <token>` from
   `localStorage['mos.platform.token']`, attached only when the call passes
   `{ platformAuth: true }`. Never combined with the view-as header.
3. **View-as** — `x-mos-view-as: <token>` from
   `sessionStorage['mos.viewas.token']`, attached on every **non**-platformAuth
   call when present. API resolves a read-only VIEWER principal for the named
   org and ignores any tenant cookie; all mutating verbs are rejected 403.

**Storage keys (contract surface)**

| Key                  | Store          | Purpose                                                                                                                                                                             |
| -------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mos.platform.token` | localStorage   | Platform bearer. Cleared client-side by `platform.logout()` (no network call).                                                                                                      |
| `mos.viewas.token`   | sessionStorage | View-as bridge token (same-tab by design). Cleared by Exit view and by a 401 in view-as mode (→ `/platform`). Presence suppresses the shell cache and skips `GET /v1/auth/session`. |
| `mos:shell:v1`       | sessionStorage | Optimistic cache of `{ session, workspace }`. Cleared on 401, org switch, sign-out, needsOrganization, exit view-as.                                                                |
| `mos:theme`          | localStorage   | `'light'                                                                                                                                                                            | 'dark'`; read by an inline pre-paint script in the root layout. |

**List envelope** — `lib/resource.ts`: every generic list endpoint returns
`Page<T> = { data: T[], hasMore: boolean, nextCursor: string | null }`.
Query params: `limit` (default 25), `search` (debounced 300ms, omitted when
empty), `cursor`; empty-string params dropped. 401 inside `useList` sets a
`needsAuth` flag (re-login state) instead of an error.

**No SSE, no WebSocket, no middleware.ts.** The only polling loops are
knowledge-base document indexing (3s interval while any doc is
PENDING/QUEUED/PROCESSING) and one-shot `setTimeout(…, 1500)` refreshes after
workflow run/retry.

---

## 1. Better Auth direct mounts — `/api/auth/*` (NOT `/v1`)

Via `authFetch` in `lib/auth-client.ts` (POST when body given, else GET;
`credentials: 'include'`; throws plain `AuthError { message, code? }`).

| Endpoint                         | Body                                       | Caller                              | Notes                                                                           |
| -------------------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| POST `/api/auth/sign-up/email`   | `{ name, password, email }`                | `(auth)/register/page.tsx`          | Signs in on success (cookie set); client gate password ≥ 8. Response discarded. |
| POST `/api/auth/sign-in/email`   | `{ email, password, rememberMe: true }`    | `(auth)/login/page.tsx`             | Error code `account_locked` special-cased. `?next=` carries destination.        |
| POST `/api/auth/sign-out`        | `{}`                                       | `app/layout.tsx` (sidebar + no-org) | `clearShellCache()` runs before the request.                                    |
| POST `/api/auth/forget-password` | `{ email, redirectTo: '/reset-password' }` | `(auth)/forgot-password/page.tsx`   | Non-enumerating success copy.                                                   |
| POST `/api/auth/reset-password`  | `{ newPassword, token }`                   | `(auth)/reset-password/page.tsx`    | `token` from `?token=` query; success → `/login?reset=1`.                       |

## 2. Tenant identity — `/v1/auth/*`

| Endpoint                         | Body                 | Response consumed                                                                                                                                  | Callers / notes                                                                                                                                                                                                             |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/auth/session`              | —                    | `{ user{id,email,name,emailVerified}, organizations: {organizationId,name,slug,status,role,isActive}[], activeOrganizationId, needsOrganization }` | `app/layout.tsx` (concurrent with workspace via `Promise.allSettled`), `(auth)/accept-invitation`. **Skipped entirely in view-as mode** (401 for view-as principals — no identity). 401 → clear cache + `/login?next=/app`. |
| POST `/auth/switch-organization` | `{ organizationId }` | ignored (full shell reload)                                                                                                                        | Org switcher; `clearShellCache()` first; hidden in view-as.                                                                                                                                                                 |
| POST `/auth/leave-organization`  | `{ organizationId }` | `{ ok }`                                                                                                                                           | Defined in auth-client; no current caller.                                                                                                                                                                                  |
| POST `/auth/invitations/accept`  | `{ token }`          | success only                                                                                                                                       | accept-invitation page; 900ms success beat then `/app`.                                                                                                                                                                     |

## 3. Workspace bootstrap — GET `/v1/me/workspace`

Callers: `app/layout.tsx` (view-as path, normal path, retry), settings/features.
Response: `{ user{id,email,name,role,permissions[]}, viewOnly?: boolean,
organization{id,name,slug,industry,timezone,status}|null, plan{key,name}|null,
enabledFeatures[], navigation: {section, items:{label,icon?,path,section,order}[]}[],
branding{displayName,logoUrl,logoDarkUrl,faviconUrl,primaryColor,secondaryColor,
accentColor,headingFont,bodyFont,loginTagline}|null,
limits:{metric,name,unit,period,limit}[] }`.
Sidebar links are `/app${item.path}`. `applyBranding()` currently writes
`--color-primary/--color-primary-hover/--color-accent/--brand-heading-font/
--brand-body-font` — **per the approved redesign decision this repaint is
being retired (logo + displayName only); the response shape stays frozen.**
`viewOnly: true` drives the read-only banner and hides switcher/sign-out.

## 4. Generic resource contract — `lib/resource.ts` + `components/resource-page.tsx`

Pattern (base per module): GET `{base}?limit&search&cursor` → `Page<T>` ·
GET `{base}/{id}` → `T` · POST `{base}` → `T` · PATCH `{base}/{id}` → `T` ·
DELETE `{base}/{id}` → `{ok}` · DELETE `{base}` body `{ids: string[]}` →
`{ok, count}` (bulk delete = DELETE with JSON body, no confirm dialog).
Edit sends the **full row object** back unless the page overrides `toForm`.

Instantiations (create/patch body shapes):

- `/companies` — `{ name, domain?, industry?, size?, description?, tags?[] }`
- `/contacts` — `{ firstName, lastName?, email?, phone?, jobTitle? }`
- `/deals` — `{ title, pipelineId, stageId, value?, currency?, status?, probability?, tags?[] }`
- `/notes` — `{ body }`
- `/pipelines` — read-only page (no writes)
- `/tasks` — `{ title, description?, status?(TODO|IN_PROGRESS|BLOCKED|DONE|CANCELED), priority?(LOW|MEDIUM|HIGH|URGENT) }`
- `/webhooks` — write `{ url, event?, secret }`; read returns `events: string[]` (asymmetric)
- `/prompts` — `{ name, category?, description?, isShared? }`
- `/knowledge-bases` — `{ name, description?, embeddingModel? }`
- `/email-campaigns` — `{ name, subject, preheader?, fromName? }`

## 5. CRM extras

- GET `/pipelines/options` → `Pipeline[]` **or** `{data: Pipeline[]}` (both
  tolerated); `Pipeline = { id, name, isDefault, stages:{id,name,position,probability}[] }`.
  Blocking prerequisite for the Deals page.
- GET `/leads/board` → flat `BoardLead[]` (unpaginated): `{ id, status, source,
medium, score, value: string|null, tags[], createdAt, lastContactedAt,
contact{name,email,phone}|null, campaign{id,name}|null }`. Grouped client-side
  into NEW|CONTACTED|QUALIFIED|NURTURING|CONVERTED|UNQUALIFIED.
- PATCH `/leads/{id}` body `{ status }` — optimistic kanban move, revert on fail.
- POST `/leads/manual` body `{ name, email?, phone?, source(MANUAL|INSTAGRAM|
FACEBOOK|WHATSAPP|EMAIL|FORM), value?, note? }` (optional keys omitted).

## 6. Dashboard & analytics (tenant)

- GET `/analytics/overview` → 13 counters incl. `aiSpendUsd: string`.
- GET `/analytics/timeseries?days=30` → `{ days: {date'YYYY-MM-DD', leads,
deals, revenue: string}[] }` (dashboard + reports).
- GET `/analytics/leads-funnel` → `{stage, count}[]` (dashboard, reports,
  campaign insights — the latter with `.catch(()=>[])`).
- GET `/analytics/channel-performance` → `{ email{sent,opened,clicked},
social:{platform,assets}[] }`.
- GET `/analytics/ai-usage` → `{ totalCostUsd?, totalCalls?, totalInputTokens?,
totalOutputTokens?, byProvider?:{provider|null,costUsd,inputTokens,outputTokens}[] }`.
- GET `/analytics/leads` → `{ summary{total,new30d,converted,conversionRatePercent},
funnel[], bySource:{source,total,converted,conversionRatePercent,valueUsd}[],
series:{date,leads}[] }`.
- GET `/analytics/revenue` → `{ summary{wonRevenueUsd,wonDeals,pipelineUsd,
openDeals}, monthly:{month'YYYY-MM',revenueUsd}[], byCampaign:{campaignId,
name,revenueUsd,deals}[], bySource:{source,revenueUsd,deals}[] }`.
- Meta ads (campaign insights page, `?from=YYYY-MM-DD` computed from a
  7/30/90-day toggle, no `to`):
  GET `/meta/analytics/summary` → `{ impressions, reach, clicks, spend, leads,
activeCampaigns, ctr, cpl }` ·
  GET `/meta/analytics/demographics` → `{ age: Bucket[], gender: Bucket[] }`
  (bare) · GET `/meta/analytics/geography` → `{ data: Bucket[] }` (enveloped) ·
  GET `/meta/analytics/timeseries` → `{ data: {date,impressions,clicks,leads,
spend}[] }`. `Bucket = { value, reach, impressions, leads, spend }`.

All money crosses the wire as **strings**; UI coerces with `Number()`.

## 7. Meta connection — `components/meta-connect.tsx` (on settings/organization)

OAuth is a full-tab redirect, not a popup:

1. GET `/meta/oauth/url` → `{ url }` → `window.location.href = url`.
2. Meta redirects back with `?code&state`; on mount, query is stripped via
   `history.replaceState` **before** POST `/meta/oauth/exchange`
   body `{ code, state }` → `MetaConnectionView` (token never reaches browser).
3. PUT `/meta/connection/assets` body `{ adAccountId?, pageId? }` (only
   changed keys; can be `{}`).

- GET `/meta/connection` → `MetaConnectionView | null` = `{ status,
adAccountId, pageId, igUserId, wabaId, connectedAt,
available?:{adAccounts:{id,name}[], pages:{id,name}[]} }`; errors swallowed
  to "not connected".
- DELETE `/meta/connection` — `window.confirm` guarded; no catch.

## 8. Campaign studio & assets

- GET `/campaigns` → `{data: Campaign[]} | Campaign[]` (both tolerated);
  `Campaign = { id, name, objective?, status?, strategy?{summary,goals[],
schedule}|null, targetAudience?{description}|null, budgetTotal?, createdAt? }`.
  No `GET /campaigns/:id` is used — the studio refetches the list to find one.
- POST `/campaign-assets/plan` body `{ brief }` (4–4000 chars; brief =
  prompt + optional "Requested outputs: …" chips) → `{ campaignName, objective,
audience, strategy, platforms[], durationDays, suggestedBudget,
deliverables[], estimatedAssets }`. Plan only; nothing persisted.
- POST `/campaign-assets/generate` body `{ brief }` (same brief; plan object
  never sent back) → `{ campaignId, assetCount }`. Synchronous, no polling.
- GET `/campaign-assets?campaignId=<id>` → `{data: Asset[]} | Asset[]`;
  `Asset = { id, platform, kind, status, title?, body, caption?, hashtags?[],
cta?, scheduledFor?, mediaUrl?, aiVersions?{variants?: string[]}|null }`.
  `kind ∈ POST|CAPTION|STORY|REEL|AD_COPY|AD_HEADLINE|AD_DESCRIPTION|EMAIL|
LANDING|BLOG|ARTICLE|IMAGE_PROMPT|VIDEO_PROMPT`; `status ∈ DRAFT|GENERATED|
NEEDS_REVIEW|APPROVED|REJECTED|SCHEDULED|PUBLISHING|PUBLISHED|FAILED`.
  Server also accepts `status|platform|search` params (unused). Calendar and
  creative library call it **unfiltered** and bucket client-side.
- Asset actions (all reload the list unless noted):
  POST `:id/approve` `{}` — gate 1 for IMAGE_PROMPT/VIDEO_PROMPT concepts
  (immediately chained into generate-media), terminal approval otherwise ·
  POST `:id/generate-media` `{ variants: 2 }` for images / `{}` for video
  (schema: variants 1–3) — synchronous Runway call, no polling ·
  POST `:id/choose-variant` `{ url }` (from `aiVersions.variants`) ·
  PATCH `:id` `{ body, caption, cta }` (always all three, `''` not null;
  server also accepts title/hashtags — unused; editor stays open, no reload) ·
  POST `:id/regenerate` `{}` → `{ body? }` into the textarea only (not saved) ·
  POST `:id/reject` `{ reason? }` (chip — custom text joined with ' — ';
  feeds future generation prompts) · POST `:id/duplicate` `{}` ·
  DELETE `:id` (confirm dialog) ·
  POST `:id/publish` `{ accountIds: string[] (min 1), scheduledAt?: ISO }` —
  omitted `scheduledAt` = post now. Called from the studio PublishDialog
  (APPROVED only) and the calendar DayComposer (always sends `scheduledAt`,
  day + HH:mm default 10:00).
- Templates: GET `/prompts` (bare, both envelopes tolerated) filtered
  client-side to `category === 'Campaign template'` → chips; POST `/prompts`
  `{ name, category:'Campaign template', description, isShared: true }` —
  the literal category string is the studio↔library bridge contract.

## 9. Social

- GET `/social/accounts` → bare array `{ id, platform, handle, displayName,
status, followerCount, avatarUrl, canPublish, publishNote }[]` (hub, calendar,
  PublishDialog; all filter `status==='CONNECTED'` client-side).
  - `canPublish` / `publishNote` added 2026-08-17. `status==='CONNECTED'` means
    only that the row exists — a hand-entered handle is CONNECTED and cannot
    post. `canPublish` is the question that word appears to answer: true when
    Instagram has an `igUserId` or Facebook a `pageId` on the org's Meta
    connection. `publishNote` is the one-sentence reason when it is false. It
    mirrors `resolveAuth` in `apps/worker/src/social/index.ts`; the two must
    agree, because one decides what the screen promises and the other what
    happens at the scheduled minute.
- GET `/social/posts` → bare array `{ id, status, body, hashtags[],
scheduledAt, publishedAt, createdAt, targets:{ id, socialAccountId, handle,
platform, status, permalink, failureReason, publishedAt }[] }[]` — per-
  platform tabs/counts derived from `targets[]`.
- POST `/social/accounts/connect` `{ platform, handle, displayName? }` —
  manual connect (not OAuth). DELETE `/social/accounts/:id` (confirm).
- POST `/social/posts` — hub: `{ body, hashtags[], accountIds[],
scheduledAt?: ISO }`; calendar: `{ body, accountIds[], scheduledAt }` (no
  hashtags key). Omitted `scheduledAt` = now. Hashtags normalised client-side.
- POST `/social/posts/:id/publish-now` `{}` (SCHEDULED only; enqueues for the
  worker). DELETE `/social/posts/:id` (confirm).

## 10. Lead forms & landing pages (builders + public)

- GET `/lead-forms` → bare array `{ id, name, slug, status(DRAFT|PUBLISHED|
ARCHIVED), submitCount, headline?, description? }[]`; public URL is
  `${origin}/f/${slug}`.
- POST `/lead-forms` `{ name, headline?, description? }` → uses `id` only.
- GET `/lead-forms/:id` → adds `fields: FormField[]` (`{ key, label,
type(text|email|tel|textarea|select), required?, options?[], placeholder? }`,
  coerced to `[]` if non-array), `submitLabel?`, `successMessage?`,
  `redirectUrl?`, `accentColor?`.
- PATCH `/lead-forms/:id` — all keys always sent, blanks as `null`; `fields[].key`
  slugified + de-duplicated client-side (browser-only uniqueness guarantee).
- POST `/lead-forms/:id/{publish|unpublish}` `{}` · GET `:id/submissions` →
  bare `{ id, data: Record<string,unknown>, createdAt, leadId|null }[]`
  (columns = union of data keys) · GET `:id/stats` → `{ submitCount, last7Days,
conversionNote }`.
- Landing pages: GET `/landing-pages` → bare array; POST `{ name, title? }`;
  GET `/landing-pages/:id` → `{ …, blocks: Block[] }` with
  `Block.type ∈ hero|features|text|cta|image` (typed payloads per type);
  PATCH replaces the whole document (blanks → null, name falls back
  'Untitled') and re-hydrates from the server echo;
  POST `:id/{publish|unpublish}` (bodyless — publish does NOT save);
  DELETE `:id` (confirm). Public URL `${origin}/p/${slug}`.

**Public renderers** (no auth):

- GET `/public/forms/{slug}` → `PublicForm` (fields coerced; `accentColor`
  regex-validated `#hex` else `#4f46e5`); 404 = permanent state, other errors
  get Retry.
- POST `/public/forms/{slug}` — body is the **flat** `Record<string,string>`
  of field values (no envelope; untouched fields absent) →
  `{ ok, successMessage|null, redirectUrl|null }`; `redirectUrl` triggers a
  full navigation to a tenant-controlled URL.
- GET `/public/pages/{slug}` → `{ name, title, blocks[], theme, seoTitle,
seoDescription, ogImageUrl }` — client-rendered; only blocks + title used.

## 11. AI tools (all single blocking POSTs, no polling/streaming)

- POST `/ai/image` `{ prompt, size(1024x1024|1024x1536|1536x1024) }` →
  `{ image? , url? }` (either field; used as img src + download href).
- POST `/ai/video` `{ prompt }` → `{ url }` (long request, no abort).
- POST `/ai/chat` `{ messages:{role(user|assistant),content}[] }` (full
  transcript each turn) → `{ role, content }`.
- POST `/ai/generate` `{ prompt, tone, format }` (human-readable strings) →
  `{ content }`; 409 = no LLM provider configured (banner).
- POST `/ai/voice` `{ text, voice(alloy|echo|fable|onyx|nova|shimmer) }` →
  `{ audio }`.
- GET `/ai/history` → bare or enveloped `UsageRow[]`.

## 12. Knowledge bases (detail page)

- GET `/knowledge-bases/:id` → header info.
- GET `/knowledge-bases/:id/documents` → `{ data: Doc[], indexingAvailable? }`;
  **polls every 3000ms** while any doc is PENDING|QUEUED|PROCESSING;
  `indexingAvailable === false` renders a warning banner.
- POST `/knowledge-bases/:id/documents` — **JSON upload, not multipart**:
  `{ title, content, mimeType, sourceType('UPLOAD'|'TEXT') }`; files read via
  `FileReader.readAsText`, 400KB cap, text-only, sequential per file.
- POST `/knowledge-bases/:kbId/documents/:docId/reprocess` (bodyless) ·
  DELETE `…/documents/:docId` (confirm).
- POST `/knowledge-bases/:id/search` `{ query }` → `{ results:{id,
documentTitle,content,score(0–1)}[] }`.

## 13. Settings / members / config

- GET `/organization` → org + `settings{tagline,brandVoice,targetAudience,
monthlyReportEnabled,reportRecipientEmail}`; PATCH `/organization/settings` —
  all five keys always present, blanks → null (`reportRecipientEmail` null =
  send to workspace owner). Server also accepts monthlyAiBudgetUsd/
  hardStopOnBudget/autonomyLevel/requireContentApproval (not sent by this page).
- GET `/config/agents` → bare `{ id, role, purpose, enabled }[]`;
  PUT `/config/agents` `{ agentKey, enabled }` (collection PUT toggling one).
- GET `/config/branding` → `{ displayName?, primaryColor?, accentColor?,
logoUrl?, loginTagline? }`; PUT `/config/branding` — falsy fields stripped
  (cannot clear a field to empty through this UI); hex/url validated server-side.
- GET `/members` → bare `{ membershipId, userId, name, email, role,
permissions?, lastLoginAt }[]` (keyed on membershipId);
  POST `/members/invitations` `{ email, role(ADMIN|MANAGER|MEMBER|VIEWER) }`;
  PATCH `/members/{membershipId}/role` `{ role }`.
- GET `/members/roles` → `{ role, permissions[], assignable }[]` (read-only).

## 14. Notifications, inbox, workflows, support

- GET `/notifications` (bare or enveloped) · PATCH `/notifications/{id}/read`
  (bodyless) · POST `/notifications/read-all` (bodyless).
- GET `/conversations` (bare or enveloped; **403 = feature gate**, renders
  "Inbox isn't enabled yet") · POST `/conversations` `{ subject?, channel(
WEB_CHAT|EMAIL|WHATSAPP|SMS|VOICE) }` → created row spliced in ·
  GET `/conversations/{id}/messages?cursor=` → `{ data: Message[], nextCursor }`
  (newest-first; client reverses; no hasMore) · POST `/conversations/{id}/read`
  (bodyless, fire-and-forget) · POST `/conversations/{id}/messages` `{ body }`
  → created Message appended.
- GET `/workflows` → reads `.data` only · POST `/workflows` `{ name,
triggerType(manual|asset.approved|campaign.approved|lead.created|
lead.assigned) }` · GET `/workflows/{id}/graph` → `{ workflow, graph{start,
nodes: WfNode[]} }` · PUT `/workflows/{id}/graph` — the graph object itself,
  unwrapped; node config keys depend on action; condition ops
  `truthy|eq|ne|gt|lt|contains`; `delayMs` in ms · POST `/workflows/{id}/run`
  `{ payload:{manual:true} }` (runs list refetched after 1.5s) ·
  POST `/workflows/{id}/{pause|resume}` (bodyless) · GET `/workflows/{id}/runs`
  → `{ data: Run[] }` · GET `/workflow-runs/{runId}` → `Run & { steps[] }`
  (top-level path) · POST `/workflow-runs/{runId}/retry` (bodyless).
- GET `/support/tickets?status=` (bare array; param omitted for All) ·
  GET `/support/tickets/stats/summary` → `{ open, pending, resolved, closed,
total }` · POST `/support/tickets` `{ subject, body, priority,
requesterEmail? }` → uses `id` · GET `/support/tickets/{id}` → detail with
  embedded `comments[]` · PATCH `/support/tickets/{id}` — `{ status }` OR
  `{ priority }`, one key per call, response re-hydrates the drawer ·
  POST `/support/tickets/{id}/comments` `{ body, internal }` ·
  DELETE `/support/tickets/{id}` (soft delete).

## 15. Platform realm — `/v1/platform/*` (bearer; all callers in `app/platform/**`)

- POST `/platform/auth/login` `{ email, password }` → `{ token, admin }`;
  token → localStorage. Logout is client-side only. Layout gates on token
  presence only; expiry surfaces as 401 on the next call (each page redirects
  to `/platform/login` on 401 independently).
- GET `/platform/catalog` → `{ categories[], features:{category,
features:{id,name,description,dependencies[],billingCategory,
defaultEnabled}[]}[] }` — feeds the wizard + `lib/features.ts` dependency
  closure (server re-validates).
- POST `/platform/organizations` — single-shot provisioning payload
  `{ company{name,slug,industry?,website?,registeredYear?,description?},
profile{...}, branding{displayName,logoUrl?(base64 data URL ≤400KB),
primaryColor,accentColor}, admin{name,email,password≥8}, status:'TRIAL',
features: string[] }` → uses `organizationId` only
  (→ `/platform/organizations/{id}?provisioned=1`).
- GET `/platform/organizations` → bare `OrgListItem[]` (no pagination; stat
  tiles computed client-side).
- GET `/platform/organizations/{id}` → `OrgDetail` incl. `monthlyFeeUsd`,
  `features:{key,source}[]`, `limits` (first 8 rendered, -1 = Unlimited),
  `usage{members,contacts,leads,campaigns,assets,agentRuns,aiCostUsd: string,
aiCalls}`, `setup{brandProfile,metaConnected,socialConnected,firstCampaign,
firstLead}`. Single refresh point: every mutation re-fetches this.
- PATCH `/platform/organizations/{id}/status` `{ status, reason? (omitted
when falsy; UI never sends it) }` — transitions hardcoded client-side;
  DELETE is `status:'DELETED'` behind `window.confirm`.
- PATCH `/platform/organizations/{id}/fee` `{ monthlyFeeUsd: number|null }`
  (null clears; operator-private).
- GET `/platform/analytics` → `{ totals{organizations,active,members,leads30d,
campaigns,assetsGenerated,aiCostUsd: string,revenueWonUsd: string},
organizations: PortfolioOrg[] }` — money as strings; "dormant" (>14d) is a
  client-side derivation.
- POST `/platform/organizations/{id}/view-session` (bodyless; SUPER_ADMIN
  only) → `{ token, expiresAt, organization{id,name} }` — only `token` read;
  → sessionStorage + clear `mos:shell:v1` + same-tab `router.push('/app')`.
  Dual audit server-side (platform log + tenant append-only log).
- PUT `/platform/organizations/{id}/features` `{ features[], featureConfig? }`
  — full replacement set. **Defined in lib/platform.ts but currently has no
  page caller** (module edit post-provisioning not yet in the UI).

**Backend platform routes with no frontend caller** (not contract surface):
POST `/platform/organizations/{id}/clone`, PATCH `/platform/organizations/{id}/plan`.

---

## 16. Known quirks the redesign must preserve (or knowingly fix WITH approval)

These are behaviours, not bugs to silently "clean up" — several are relied on:

- Dual response tolerance (`T[] | {data: T[]}`) on: campaigns, campaign-assets,
  prompts, notifications, conversations, ai/history, pipelines/options.
- DELETE-with-body bulk deletes; bodyless POST/PATCH action verbs.
- `?provisioned=1` success signalling; `history.replaceState` before the Meta
  OAuth exchange; `x-mos-view-as` never on platformAuth calls.
- `403` on `/conversations` = feature gate, not an error.
- Optimistic updates with revert: lead kanban move, agent toggle.
- The `'Campaign template'` literal category string.
- Money always strings over the wire.
