# Creative Engine — Architecture Proposal

Status: **awaiting approval**. Nothing in this document is built yet.

A response to the "Automated Marketing Campaign Operating System" brief:
product data → AI visual → composed poster → copy → approval → schedule →
publish → analytics.

---

## 0. The short version

Roughly **60% of this brief already exists in this repository** and is running in
production. The genuinely new work is four things:

1. A **Product** entity and file uploads (neither exists today).
2. A **design template engine** — canvas, slots, typography, multi-ratio render.
3. **Product-identity-preserving** visual generation (today's Runway integration
   cannot do this — see §7, this is the one requirement that needs a decision).
4. **Batch orchestration** with progress.

Everything else — approval lifecycle, publish adapters, queue topology with
retries and dead-letter queues, storage, analytics, brand kit, the
AI-generates-visual/we-render-text split — is built or half-built.

**One requirement cannot be met as written.** §6 of the brief asks Runway to
produce "a premium product presentation" that "preserves the actual product
identity" and does "not redesign the packaging". Generative models do not
preserve identity; they produce something that resembles the input. For a
beauty SKU, a resemblance is a counterfeit label. §7 below proposes a different
mechanism that gets the same result reliably and costs less.

---

## 1. What exists today

Verified against the current tree, not from memory.

| Brief section         | Status                | Where                                                                                               |
| --------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| §20 Platform adapters | **Built**             | `apps/worker/src/social/types.ts` — `SocialPublisher` interface, `getPublisher(platform)` registry  |
| §16 Job queue         | **Built**             | `apps/worker/src/queues.ts` — 13 queues, per-queue retry policy, DLQ, concurrency                   |
| §15 Approval workflow | **Built**             | `review-queue.controller.ts`, `CampaignAsset.status` lifecycle                                      |
| §7 AI/text split      | **Built (primitive)** | `apps/api/src/infrastructure/overlay.ts` — sharp composites real contact details onto AI artwork    |
| §11 Storage           | **Built**             | `StorageService` → Supabase Storage, durable URLs                                                   |
| §21 Analytics         | **Built**             | `AdInsight`, `AdInsightBreakdown`, `MetricDaily`, Meta insights poller                              |
| §12 Auth              | **Built**             | Better Auth (tenant) + operator realm, RLS enforced at boot                                         |
| Campaign entity       | **Partial**           | `Campaign` model — lacks theme/offer/coupon/CTA fields                                              |
| Creative entity       | **Partial**           | `CampaignAsset` conflates copy, prompt and rendered media                                           |
| §4 Products           | **Missing**           | no model, no uploads anywhere in the codebase                                                       |
| §8 Template engine    | **Missing**           | `Template` exists but is a _campaign-strategy_ template, not a design one — name collision to avoid |
| §6 Product visual     | **Missing**           | Runway adapter is `text_to_image` only                                                              |
| §16 Batch UI          | **Missing**           | `MEDIA_GENERATION` queue exists with **no handler** — it acknowledges and drops jobs                |

The last row matters: the queue infrastructure is real and the media queue is an
empty socket waiting for exactly this feature.

---

## 2. System architecture

```
┌─ apps/web (Next.js) ──────────────────────────────────────────────┐
│  Campaign wizard · Product manager · Template gallery             │
│  Creative studio (live preview) · Scheduler · Analytics           │
└────────────────────────┬──────────────────────────────────────────┘
                         │ REST /v1, cookie auth
┌────────────────────────▼──────────────────────────────────────────┐
│  apps/api (NestJS)                                                │
│  Products · Campaigns · Templates · Creatives · Uploads · Publish  │
│  Enqueues work. Never blocks an HTTP request on a model call.     │
└───────┬──────────────────────────────────┬────────────────────────┘
        │ BullMQ (Redis)                   │ Prisma (RLS)
┌───────▼──────────────────┐   ┌───────────▼───────────────────────┐
│  apps/worker             │   │  Postgres                          │
│  visual-generation       │   │  Product · DesignTemplate          │
│  creative-render         │   │  Creative · CreativeVisual         │
│  social-publish          │   │  Campaign · SocialPost · Insight   │
│  analytics-rollup        │   └───────────────────────────────────┘
└───────┬──────────────────┘
        │
   ┌────▼─────┐  ┌──────────┐  ┌──────────────┐
   │ Runway   │  │ Supabase │  │ Meta / LI    │
   │ (visual) │  │ (storage)│  │ (publish)    │
   └──────────┘  └──────────┘  └──────────────┘
```

### The central idea: three separable layers

```
CreativeVisual   the AI-generated or cut-out imagery.      EXPENSIVE. Cached forever.
DesignTemplate   slots, typography, colour, geometry.      FREE. Swappable.
Creative         Product + Campaign + Visual + Template.   CHEAP to render. ~200ms.
```

Changing a price, coupon, CTA or template **re-renders only the third layer**.
This is §22 of the brief, expressed as a data model rather than a rule people
have to remember.

---

## 3. Database schema

New models. All tenant-scoped (`organizationId`), all registered in
`TENANT_SCOPED_MODELS` so RLS covers them — the boot preflight fails otherwise,
which is the safety net that makes this hard to get wrong.

```prisma
model Product {
  id             String   @id @default(uuid(7))
  organizationId String   @map("organization_id")

  name        String
  brand       String?
  sku         String?
  description String?
  productUrl  String?  @map("product_url")

  // Money in minor units. Never floats — these are printed on advertising.
  mrpMinor       Int?    @map("mrp_minor")
  salePriceMinor Int?    @map("sale_price_minor")
  currency       String  @default("INR")

  // Uploaded original, plus the background-removed cutout derived from it.
  imageUrl       String? @map("image_url")
  cutoutUrl      String? @map("cutout_url")

  attributes Json?     // shade, size, variant — template-addressable
  createdAt  DateTime  @default(now()) @map("created_at")
  deletedAt  DateTime? @map("deleted_at")

  @@index([organizationId, deletedAt])
  @@map("product")
}
```

`discount` is **derived**, never stored — a stored discount that disagrees with
`mrp` and `salePrice` is a false advertising claim in a JSON column.

```prisma
model DesignTemplate {
  id             String  @id @default(uuid(7))
  organizationId String? @map("organization_id")   // null = platform template

  name        String
  slug        String
  description String?
  thumbnailUrl String? @map("thumbnail_url")

  /// The layout document — see §8. Versioned so an edit cannot silently
  /// change what an already-approved creative renders as.
  definition Json
  version    Int    @default(1)

  isPublic Boolean @default(false) @map("is_public")

  @@unique([organizationId, slug])
  @@map("design_template")
}
```

Named `DesignTemplate`, not `Template` — `Template` is taken by campaign-strategy
templates and reusing it would put two unrelated concepts in one table.

```prisma
model CreativeVisual {
  id             String @id @default(uuid(7))
  organizationId String @map("organization_id")
  productId      String? @map("product_id")

  /// CUTOUT | AI_SCENE | AI_REFERENCE | UPLOAD — see §7
  source    String
  url       String
  prompt    String?
  provider  String?
  model     String?
  costUsd   Decimal? @db.Decimal(10, 4)

  createdAt DateTime @default(now()) @map("created_at")

  @@index([organizationId, productId])
  @@map("creative_visual")
}

model Creative {
  id             String @id @default(uuid(7))
  organizationId String @map("organization_id")
  campaignId     String @map("campaign_id")
  productId      String? @map("product_id")

  templateId      String @map("template_id")
  templateVersion Int    @map("template_version")
  visualId        String? @map("visual_id")

  /// Resolved copy: headline, price strings, coupon, CTA, disclaimer.
  /// Snapshotted, not joined — an approved creative must not change because
  /// someone edited the product's price a week later.
  content Json

  aspectRatio String  @default("1:1") @map("aspect_ratio")
  renderedUrl String? @map("rendered_url")
  renderHash  String? @map("render_hash")   // skip identical re-renders

  status      CreativeStatus @default(DRAFT)
  approvedAt  DateTime?      @map("approved_at")
  approvedById String?       @map("approved_by_id")

  @@index([organizationId, campaignId, status])
  @@map("creative")
}
```

`content` being a snapshot is the single most important decision in this schema.
Advertising that was approved must render tomorrow exactly as it was approved.

**Campaign** gains: `theme`, `primaryOffer`, `couponCode`, `cta`, `campaignType`,
`targetPlatforms String[]`. Additive columns, no migration risk.

**BatchJob** tracks §16 progress: `total`, `completed`, `failed`, `status`,
`campaignId`.

---

## 4. API architecture

Follows existing conventions: `/v1` prefix, RFC 9457 problem+json, permission
guards, tenant transactions.

```
POST   /v1/uploads                      multipart → Supabase, returns URL
GET    /v1/products                     list, filter, paginate
POST   /v1/products                     create
POST   /v1/products/import              CSV / bulk
POST   /v1/products/:id/cutout          background removal → cutoutUrl

GET    /v1/design-templates             gallery (org + platform)
POST   /v1/design-templates             create
PUT    /v1/design-templates/:id         edit (bumps version)
POST   /v1/design-templates/:id/preview render with sample data, no persistence

POST   /v1/campaigns/:id/creatives      generate one
POST   /v1/campaigns/:id/creatives/batch   generate all → BatchJob
GET    /v1/batches/:id                  progress { total, completed, failed }

PATCH  /v1/creatives/:id                edit copy → re-render, NO AI call
POST   /v1/creatives/:id/rerender       new template or aspect ratio
POST   /v1/creatives/:id/revisual       new AI visual (the only paid path)
POST   /v1/creatives/:id/approve
POST   /v1/creatives/:id/schedule
```

The split between `rerender` (free) and `revisual` (paid) is deliberate and
visible in the URL, so it is obvious at the call site which one costs money.

---

## 5. Frontend architecture

New sections: **Products**, **Templates**, **Creatives**, **Scheduler**.

> **Conflict to resolve.** You previously asked for a strict five-item nav
> (Studio, Campaigns, Library, CRM, Analytics) and for duplicate destinations to
> be removed. The brief's §23 asks for nine. My recommendation: keep five
> top-level items and nest — `Campaigns → Products / Creatives / Scheduler`,
> `Library → Templates / Media`. Nine top-level items on a marketing tool is how
> the duplication we just removed got there. **Your call.**

The creative editor is the one screen that needs care:

```
┌─────────────────┬───────────────────────────┐
│                 │  Template   [Tricolour ▾] │
│   LIVE PREVIEW  │  Headline   [__________]  │
│                 │  MRP        [₹2,200    ]  │
│   (re-renders   │  Sale       [₹1,870    ]  │
│    on every     │  Coupon     [FREEDOM   ]  │
│    keystroke,   │  CTA        [SHOP NOW  ]  │
│    debounced)   │                           │
│                 │  ⟳ New AI visual   ₹₹     │
└─────────────────┴───────────────────────────┘
```

Preview renders client-side from the same template definition, so typing is
instant and free. The server render is authoritative and happens on save. One
template document, two renderers — a real risk of drift, mitigated by keeping
the definition declarative (no logic to reimplement) and snapshot-testing both.

---

## 6. Backend architecture

Two new queues alongside the existing thirteen:

| Queue               | Concurrency | Retries | Why                            |
| ------------------- | ----------- | ------- | ------------------------------ |
| `visual-generation` | 3           | 2       | Every attempt costs money      |
| `creative-render`   | 8           | 5       | Pure CPU, cheap, safe to retry |

Batch flow:

```
POST /creatives/batch
  → BatchJob { total: 50 }
  → 50 × visual-generation jobs
      each → on success → creative-render job
      each → updates BatchJob counters
  → UI polls GET /batches/:id  →  "12 / 50 · 24%"
```

Separating the queues means a Runway outage stalls visuals while text-only
re-renders keep working — and 50 render jobs cannot starve the 3 model slots.

---

## 7. AI integration — and the one requirement that must change

### The problem

The brief asks Runway to output "a premium product presentation" that "preserves
the actual product identity" and does "not redesign the packaging".

Generative image models cannot do this. They produce something that _resembles_
the input. For a cosmetics SKU that means a bottle that is nearly the Anua
bottle, with lettering that is nearly "Niacinamide". You would be publishing a
subtly counterfeit product image, at scale, as advertising.

This is the same failure mode as AI-written phone numbers — the one the brief
already correctly rejects in §7. It applies to packaging just as much as to text.

### The proposal — three tiers, default to the safest

**Tier 1 · Cutout composite (default, recommended)**
Remove the background from the uploaded product photo; composite those exact
pixels onto a template background. The product is photographically real because
it _is_ the photograph.
Cost: ~₹0. Time: ~1s. Identity: perfect.

**Tier 2 · AI scene + real product (recommended for "premium" looks)**
Runway generates only the _background_: gradient, silk, marble, festive
decoration — explicitly instructed that no product and no text appear. The real
cutout is composited on top.
Cost: one Runway call per _scene_, reusable across every product in the campaign.
Identity: perfect. **This is the setting that delivers the brief's intent.**

**Tier 3 · AI reference (opt-in, labelled)**
Runway `gen4_image` with the product as a reference image. Genuinely
photorealistic scenes, but the packaging may drift. Surfaced with a warning and
never the default.

Tier 2 also inverts the cost model: one scene serves fifty products, instead of
fifty generations.

### Runway integration plan

The current adapter (`adapters/runway.ts`) supports `text_to_image` and
`image_to_video` only. Needs:

- `referenceImages` support on `gen4_image` for Tier 3
- A background-generation prompt builder that forbids products and text
- A background-removal step for cutouts — `@imgly/background-removal-node`
  (local, free, no API) or Runway/remove.bg if quality demands it
- Cost recorded per call on `CreativeVisual.costUsd`, so §22 is measurable
  rather than aspirational

---

## 8. Template engine design

### Rendering technology — evaluated

| Option                         | Verdict                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| HTML/CSS → headless screenshot | **No.** Chromium is ~400MB on Render, slow to boot, and a poster renderer that depends on a browser is fragile in a worker |
| Fabric.js / Konva.js           | **No.** Browser-first; server use needs `node-canvas` and native builds                                                    |
| Raw SVG by hand                | **No.** No layout engine — every position becomes manual arithmetic, which is what template _editing_ must avoid           |
| Canvas API                     | **No.** Same problem, plus manual text wrapping                                                                            |
| **Satori → resvg/sharp**       | **Yes.**                                                                                                                   |

**Recommendation: Satori + sharp.**

- Satori converts JSX with a flexbox subset into SVG; sharp (already a
  dependency, already proven in `overlay.ts`) converts SVG to PNG
- **Fonts are loaded from files we ship** — which also fixes the font-availability
  risk flagged in today's overlay work, permanently and for both use cases
- Flexbox means one template genuinely reflows into 1:1, 4:5 and 9:16 rather than
  needing three hand-positioned variants
- No browser, no native build, ~200ms per poster
- Deterministic: same input, same bytes, so `renderHash` can skip re-renders

### Template definition

```jsonc
{
  "version": 1,
  "canvas": { "baseWidth": 1080, "baseHeight": 1080 },
  "ratios": ["1:1", "4:5", "9:16"],
  "palette": { "bg": "#0B3D2E", "accent": "#E8B33A", "ink": "#FFFFFF" },
  "fonts": [{ "family": "Inter", "weights": [400, 700, 900] }],

  "slots": [
    {
      "id": "visual",
      "type": "image",
      "fit": "contain",
      "area": { "x": "4%", "y": "18%", "w": "48%", "h": "56%" },
    },

    {
      "id": "campaignTitle",
      "type": "text",
      "bind": "campaign.name",
      "area": { "x": "56%", "y": "18%", "w": "40%" },
      "style": { "size": "6.5cqw", "weight": 900, "transform": "uppercase" },
    },

    {
      "id": "price",
      "type": "priceStack",
      "bind": { "mrp": "product.mrp", "sale": "product.salePrice" },
      "style": { "strikeMrp": true },
    },

    {
      "id": "footer",
      "type": "band",
      "bind": "campaign.couponCode",
      "area": { "x": 0, "y": "88%", "w": "100%", "h": "12%" },
    },
  ],

  "rules": [
    { "if": "product.discount == null", "hide": "discountBadge" },
    { "if": "ratio == '9:16'", "set": { "layout": "stacked" } },
  ],
}
```

Percentage units and `cqw` type sizing are what make one document serve every
aspect ratio. `rules` handle the real-world case of a product with no MRP —
without them, half a template renders an empty box.

`bind` is a whitelist of paths, not an expression language. A template is data a
user can edit; an expression evaluator over user-supplied JSON is a sandbox
escape waiting to happen.

### Design reference upload (brief §5)

**Recommend deferring past MVP.** Extracting palette and geometry from a
screenshot is achievable (palette quantisation, layout heuristics, or a
vision-model pass emitting a template document). Extracting _taste_ is not. The
realistic v1 is: pull the colour palette, suggest the closest built-in template,
let the user adjust. Presenting more than that would over-promise.

---

## 9. Storage architecture

Supabase Storage, already wired.

```
creatives/
  {orgId}/products/{productId}/original.{ext}
  {orgId}/products/{productId}/cutout.png
  {orgId}/visuals/{visualId}.png
  {orgId}/creatives/{creativeId}/{ratio}.png
```

Uploads go **through the API**, not direct-to-Supabase: the service key must stay
server-side, and the API is where we validate MIME type, dimensions and size
before anything is stored. Costs one hop; buys the ability to reject a 40MB TIFF
before it lands.

Rendered posters are immutable and content-addressed by `renderHash`, so a
re-render with unchanged inputs is free.

---

## 10. Security

- Every new model tenant-scoped; RLS enforced by the existing boot preflight
- `bind` whitelist, no expression evaluation (above)
- Upload validation: MIME sniffing on bytes not filename, dimension caps, size
  caps, re-encode through sharp to strip EXIF and any embedded payload
- SVG uploads **rejected** — SVG is executable
- Template JSON validated against a Zod schema on write, not on render
- Publish tokens stay envelope-encrypted per organisation, as today

---

## 11. Cost model

| Operation                   | Cost   | Frequency                     |
| --------------------------- | ------ | ----------------------------- |
| Cutout (local)              | ~₹0    | once per product              |
| Runway scene (Tier 2)       | ~₹4–8  | once per **campaign**, reused |
| Runway per-product (Tier 3) | ~₹4–8  | once per product              |
| Template render             | ~₹0    | unlimited                     |
| Text/price/CTA edit         | **₹0** | unlimited                     |

A 50-product campaign: **Tier 2 ≈ ₹8 total**. Tier 3 ≈ ₹400. Same visual quality
for most beauty layouts. This is the argument for making Tier 2 the default.

Guardrails: per-org monthly AI budget already exists (`monthlyAiBudgetUsd`,
`hardStopOnBudget`) — wire `visual-generation` into it.

---

## 12. Scalability

- Render is stateless and CPU-bound → scales by adding worker replicas
- Visual generation is provider-rate-limited → concurrency 3, queue absorbs bursts
- 50-product batch: ~50 renders ≈ 10s wall-clock at concurrency 8
- Postgres: creative rows are small; rendered bytes live in object storage
- `renderHash` prevents the pathological case of a batch re-rendering unchanged

---

## 13. Folder structure

```
apps/api/src/modules/
  products/          products.controller.ts, cutout.service.ts
  templates/         design-templates.controller.ts
  creatives/         creatives.controller.ts, batch.controller.ts
  uploads/           uploads.controller.ts

packages/creative-engine/          ← new shared package
  src/template/      schema.ts, resolve.ts, bind.ts
  src/render/        satori.ts, raster.ts, ratios.ts
  src/fonts/         *.ttf  (shipped, not system-dependent)
  src/templates/     tricolour.ts, minimal.ts, festive.ts, luxury.ts, flash.ts

apps/worker/src/creative/
  visual.handler.ts  render.handler.ts

apps/web/src/app/app/
  products/  templates/  creatives/  scheduler/
```

A shared package, not app-local, because both the API (authoritative render) and
the web app (live preview) must use the identical template resolver. Two
implementations would drift, and the drift would be invisible until a customer's
poster came out different from its preview.

---

## 14. Development phases

**Phase 1 — Foundations** _(largest, unblocks everything)_
Uploads · Product model + CRUD · background removal · `packages/creative-engine`
skeleton · Satori render → PNG at three ratios · one hard-coded template.
Exit: upload a product, get a real 1080×1080 poster with exact prices.

**Phase 2 — Template engine**
Template document schema + validation · resolver + binding · five built-in
templates · gallery UI · live preview editor.
Exit: same product renders correctly through five templates.

**Phase 3 — AI visuals**
Runway background/scene generation · reference-image support · variant selection
· `CreativeVisual` caching.
Exit: pick from four scenes; text edits never re-call Runway.

**Phase 4 — Batch**
`BatchJob`, two queues, progress UI, partial-failure handling.
Exit: 50 products → "Generate All" → progress → 50 posters.

**Phase 5 — Approval, schedule, publish**
Extend the existing review queue to `Creative`; wire the existing
`SocialPublisher` adapters; scheduler UI.

**Phase 6 — Analytics**
Per-creative performance; which template and which offer actually convert.

### MVP vs later

| MVP (Phases 1–4)              | Later                            |
| ----------------------------- | -------------------------------- |
| Product upload + cutout       | Design-reference extraction (§5) |
| 5 built-in templates          | Visual template designer         |
| Tier 1 + Tier 2 visuals       | Tier 3 reference generation      |
| 3 aspect ratios               | Video creatives                  |
| Batch with progress           | A/B testing by template          |
| Approval + Instagram/Facebook | LinkedIn, TikTok                 |

---

## 15. Decisions I need from you

1. **Tier 2 as the default visual strategy** (§7) — real product pixels, AI
   background. This is the one place I am proposing something different from
   the brief, and I think the brief's version is unsafe for branded goods.
2. **Navigation** (§5) — five top-level items with nesting, or nine as written?
3. **Design-reference upload** — defer past MVP as recommended, or is it a
   day-one requirement?
4. **Products scope** — a lightweight catalogue for creative generation, or
   heading toward real ecommerce sync (Shopify, feeds)? This changes the schema.
5. **Phase 1 first?** — it is the largest phase and everything else depends on
   it. I would start there on approval.
