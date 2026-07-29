# VSP AI Marketing OS

> **Tagline:** Your AI Marketing Team in One Platform.  
> **Type:** Multi-tenant SaaS (enterprise AI marketing operating system)  
> **Status:** MVP SaaS foundation — UI + APIs + Postgres multi-tenancy live; real provider APIs still mocked until keys are wired.

This README is the **handoff document** for continuing development (including Claude / Cursor agents). Read it fully before changing architecture.

---

## 1. Product vision

VSP AI Marketing OS is a premium SaaS where marketing teams / agencies / law firms (and similar businesses) can:

1. Create an account + organization workspace  
2. Generate full campaigns with AI  
3. Create content, images, videos  
4. Run social / email / WhatsApp / voice  
5. Manage CRM + automation + analytics  
6. Later: plug real OpenAI / Twilio / Resend / etc. keys without rewriting UI  

**Design bar:** Microsoft / Notion / Linear / Stripe / Vercel / HubSpot quality — not a basic CRUD admin panel.

---

## 2. Live URLs (current)

| Layer | URL |
|--------|-----|
| Frontend (Vercel) | https://marketing-campaign-six.vercel.app |
| Backend (Render) | https://marketing-campaign-waqy.onrender.com |
| Swagger | https://marketing-campaign-waqy.onrender.com/swagger |
| Health | https://marketing-campaign-waqy.onrender.com/api/health |
| GitHub | https://github.com/shreyeah29/marketing_campaign |

**Demo login (after Neon DB is connected & seeded):**  
- Email: `sarah@vsplawassociates.com`  
- Password: `demo1234`

**Signup:** `/signup` creates a real user + organization.

---

## 3. Tech stack

### Frontend
| Tech | Role |
|------|------|
| React 19 + TypeScript | UI |
| Vite | Build |
| Tailwind CSS v4 | Styling |
| shadcn/ui-style components | Design system |
| Framer Motion | Animations |
| TanStack Query | Installed (lightly used; pages often use `useEffect` + fetch) |
| React Router v7 | Routing |
| React Hook Form + Zod | Forms / validation |
| Recharts | Charts |
| Zustand (+ persist) | Auth state (`vsp-auth`) |
| Lucide React | Icons |

### Backend
| Tech | Role |
|------|------|
| .NET 9 Web API | HTTP API |
| Clean Architecture | Domain / Application / Infrastructure / API |
| MediatR | CQRS (campaign generation command) |
| EF Core 9 + Npgsql | PostgreSQL ORM |
| JWT Bearer | Auth |
| BCrypt.Net-Next | Password hashing |
| SignalR | Hubs mapped (notifications / AI jobs) — FE not fully wired yet |
| Swashbuckle | Swagger |

### External service abstractions (mock today)
Interfaces in `Application/Interfaces`:
- `ILLMService`
- `IEmailService`
- `IWhatsAppService`
- `IVoiceService`
- `IImageGenerationService` (interface exists; image controller currently generates picsum placeholders)
- `ISocialMediaService` (interface exists; social controller uses DB + mock publish)

Mock implementations in `Infrastructure/Mock/*`.  
**Swap real providers only in `Program.cs` DI — do not rewrite controllers/UI.**

---

## 4. Architecture (high level)

```
┌──────────────────────────────┐
│  Vercel — React SPA          │
│  frontend/                   │
│  Auth JWT in Zustand         │
│  services/api.ts → fetch     │
└──────────────┬───────────────┘
               │ HTTPS + Bearer JWT
               ▼
┌──────────────────────────────┐
│  Render — Docker .NET 9 API  │
│  Controllers (tenant-scoped) │
│  Mock AI / Email / WA / Voice│
└──────────────┬───────────────┘
               │ EF Core
               ▼
┌──────────────────────────────┐
│  Neon / Postgres             │
│  Organizations + Users +     │
│  Campaigns / Leads / Assets  │
└──────────────────────────────┘
```

### Multi-tenancy model
- Every authenticated user has `OrganizationId`
- JWT claim: `org_id`
- Controllers use `User.GetOrganizationId()` / `User.GetUserId()` (`ClaimPrincipalExtensions`)
- All business rows are scoped by `OrganizationId`
- New signup creates: Organization + Admin User + OrgSettings + starter template + activity

### Clean Architecture folders

```
backend/
  VSP.MarketingOS.sln
  src/
    VSP.MarketingOS.Domain/          # Entities only
    VSP.MarketingOS.Application/     # Interfaces, MediatR commands
    VSP.MarketingOS.Infrastructure/  # EF DbContext, Mock services, Seed
    VSP.MarketingOS.API/             # Controllers, Program.cs, Hubs, Docker entry
Dockerfile                           # Multi-stage build at repo root (for Render)
frontend/                            # Vite React app
```

---

## 5. Repository structure (important paths)

```
marketing_campaign/
├── Dockerfile
├── README.md                          ← this file
├── .gitignore
├── frontend/
│   ├── package.json
│   ├── vercel.json
│   ├── .env.example                   # VITE_API_URL
│   ├── src/
│   │   ├── App.tsx                    # Routes + ProtectedRoute
│   │   ├── main.tsx
│   │   ├── index.css                  # Design tokens / glass / dark theme
│   │   ├── lib/api.ts                 # fetch wrapper + JWT + API_BASE
│   │   ├── services/api.ts            # Domain API methods
│   │   ├── services/mock-ai.ts        # Thin adapter → aiApi (not local-only anymore)
│   │   ├── store/auth.ts              # Zustand persist
│   │   ├── types/index.ts
│   │   ├── components/
│   │   │   ├── layout/                # Sidebar, Header, AppLayout
│   │   │   └── ui/                    # button, card, dialog, tabs, ...
│   │   └── pages/
│   │       ├── auth/Login|Signup|ForgotPassword
│   │       ├── dashboard/
│   │       ├── ai-command/
│   │       ├── campaigns/
│   │       ├── content/
│   │       ├── image/
│   │       ├── video/
│   │       ├── social/
│   │       ├── email/
│   │       ├── whatsapp/
│   │       ├── voice/
│   │       ├── crm/
│   │       ├── automation/
│   │       ├── analytics/
│   │       ├── templates/
│   │       └── settings/
└── backend/src/
    ├── VSP.MarketingOS.Domain/Entities/
    ├── VSP.MarketingOS.Application/
    │   ├── Interfaces/
    │   └── Commands/
    ├── VSP.MarketingOS.Infrastructure/
    │   ├── Persistence/AppDbContext.cs, DbSeed.cs
    │   └── Mock/
    └── VSP.MarketingOS.API/
        ├── Program.cs
        ├── Controllers/
        └── Hubs/
```

---

## 6. What is implemented so far

### ✅ Frontend (premium dark UI)
- Full app shell: sidebar, header, page transitions, glassmorphism design system
- Auth pages: Login, Signup, Forgot Password
- All product modules as pages (Dashboard → Settings)
- API client (`lib/api.ts` + `services/api.ts`) with Bearer token
- Create dialogs for major actions (campaign, lead, email, template, workflow, task, voice call, social)
- Pages load/mutate via backend APIs (not hardcoded-only demo)

### ✅ Backend APIs (tenant-aware)
| Area | Routes (prefix) | Notes |
|------|-----------------|-------|
| Auth | `POST /api/auth/register`, `/login`, `/forgot-password` | Real BCrypt + JWT + org create |
| Health | `GET /api/health` | Public |
| AI | `/api/ai/campaign`, `/content`, `/insights`, `/campaign/save` | Uses `MockLLMService` |
| Campaigns | `GET/POST /api/campaigns`, `PUT /{id}/status` | Postgres |
| Leads/CRM | `/api/leads`, `/pipeline`, create, status | Postgres |
| Analytics | `/dashboard`, `/channels`, `/recommendations`, `/tasks` | Mixed mock KPIs + DB activity/tasks |
| Content | `/api/content/generate`, `/drafts` | Postgres drafts |
| Images | `/api/images`, `/generate`, `/{id}/like` | picsum placeholder URLs |
| Videos | `/api/videos`, `/generate` | Script via mock LLM |
| Social | `/api/social/posts`, `/schedule`, `/analytics` | Postgres posts |
| Email | `/api/email/campaigns`, `/sequences`, `/stats` | Sequences still mostly mock |
| WhatsApp | `/api/whatsapp/conversations`, `/messages`, `/broadcast` | MessagesJson in DB |
| Voice | `/api/voice/calls` | Postgres + mock voice service |
| Automation | `/api/automation/workflows`, `/executions` | Executions still mock |
| Templates | `/api/templates` | Postgres |
| Settings | `/api/settings`, org/brand/api-keys/billing | OrgSettings table |

### ✅ Database / SaaS foundation
- EF Core `AppDbContext` with Organizations, Users, Campaigns, Leads, Contents, Images, Videos, SocialPosts, EmailCampaigns, WhatsAppThreads, VoiceCalls, Workflows, Templates, Tasks, Activities, OrgSettings
- `DbSeed.EnsureSeededAsync` creates demo org/user if empty
- Controllers filter by `OrganizationId`

### ✅ Deployment scaffolding
- Root `Dockerfile` for Render (dotnet sdk/aspnet 9)
- Frontend `vercel.json` SPA rewrites
- CORS allows localhost + `*.vercel.app` + configured origin

---

## 7. What is NOT done yet (priority backlog)

### P0 — must for real SaaS launch
1. **Confirm Neon Postgres connected on Render**  
   Env: `ConnectionStrings__DefaultConnection` (or `DATABASE_URL`)  
   Without this, API fails at startup.
2. **Wire real AI providers** (OpenAI / Anthropic) replacing `MockLLMService`
3. **Wire real Email** (Resend / SendGrid) replacing `MockEmailService`
4. **Wire real WhatsApp** (Twilio or Meta Cloud API)
5. **Wire real Voice** (Bland / Retell / Vapi)
6. **Proper password reset** (token email flow — currently stub)
7. **Invite team members / roles UI** (entity has Role; no invite flow yet)
8. **Billing / Stripe subscriptions** (Settings shows plan UI only)
9. **Hardening:** rate limits, refresh tokens, audit logs, encryption for stored API keys

### P1 — product depth
- Image generation via DALL·E / Flux (not picsum)
- Real social publishing (Meta/LinkedIn/X APIs or Buffer/Late)
- Video generation (Runway / HeyGen) — costly; keep mock until paid plans
- Email sequences fully persisted + drip scheduler (Hangfire / worker)
- Automation real execution engine + queue
- SignalR progress for AI jobs from FE
- File uploads → Cloudflare R2 / Azure Blob / Vercel Blob
- EF migrations (currently `EnsureCreated`) — move to proper migrations for production
- Soft-delete / pagination consistency across all list endpoints
- Better empty states + toast notifications instead of `alert()`
- Filter / Eye / More menus still UI-only on some pages

### P2 — scale
- Upgrade Render Free → paid (no cold start)
- Redis (Upstash) for cache / queues
- Background workers for campaigns / sends / calls
- Observability (Sentry, OpenTelemetry, structured logs)
- Load testing + per-tenant quotas
- Multi-region DB / read replicas when large

---

## 8. How the system works end-to-end (current)

```
1. User opens Vercel frontend
2. /signup → POST /api/auth/register → org+user in Postgres → JWT stored in Zustand
   OR /login → POST /api/auth/login → JWT
   OR Demo → login as seeded Sarah
3. Protected routes require isAuthenticated
4. Each page calls backend via services/api.ts with Authorization: Bearer <token>
5. Backend validates JWT, reads org_id, returns/creates org-scoped data
6. AI/content/generate still returns MockLLMService content until keys are added
7. Creates (campaign/lead/etc.) persist in Postgres for that organization
```

**Important:** AI is “functional” but **not real model output** until provider keys + DI swap.

---

## 9. Environment variables

### Frontend (Vercel)
| Key | Example | Required |
|-----|---------|----------|
| `VITE_API_URL` | `https://marketing-campaign-waqy.onrender.com` | Yes (build-time) |
| `VITE_APP_NAME` | `VSP AI Marketing OS` | Optional |

Fallback in code: if env missing, `lib/api.ts` defaults to the Render URL above.

### Backend (Render)
| Key | Example | Required |
|-----|---------|----------|
| `ConnectionStrings__DefaultConnection` | Neon Postgres URI/key-value | **Yes** |
| `Jwt__Secret` | long random string | Yes |
| `AllowedOrigins` | `https://marketing-campaign-six.vercel.app` | Recommended |
| `ASPNETCORE_ENVIRONMENT` | `Production` | Recommended |
| `ASPNETCORE_URLS` | set in Docker to `http://+:10000` | Docker |

`Program.cs` also accepts `DATABASE_URL` and converts `postgres://` URLs to Npgsql format.

### Future provider keys (store in Settings table / env; encrypt later)
- `AI__OpenAI__ApiKey`
- `Email__SendGrid__ApiKey` or Resend
- Twilio / Meta WhatsApp
- Bland / Retell voice

---

## 10. Local development

### Frontend
```bash
cd frontend
cp .env.example .env   # set VITE_API_URL to local or Render
npm install
npm run dev            # http://localhost:5173
```

### Backend
Requires .NET 9 SDK + Postgres.

```bash
# set connection string
export ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=vsp_marketing;Username=postgres;Password=postgres"

cd backend/src/VSP.MarketingOS.API
dotnet restore
dotnet run
# swagger: http://localhost:5xxx/swagger
```

### Docker (same as Render)
```bash
docker build -t vsp-api .
docker run -p 10000:10000 \
  -e ConnectionStrings__DefaultConnection="..." \
  -e Jwt__Secret="..." \
  vsp-api
```

---

## 11. Hosting & scale recommendations

| Layer | Now | Scale later |
|-------|-----|-------------|
| Frontend | Vercel | Vercel Pro |
| Backend | Render Docker | Railway / Fly.io / Azure App Service / AWS |
| Database | **Neon Postgres** (recommended) | Neon Scale / Azure SQL / RDS |
| Cache/Queue | — | Upstash Redis |
| Files | — | Cloudflare R2 / Azure Blob |

**Do not stay on Render Free** once real customers exist (cold starts ~50s).

---

## 12. Recommended third-party APIs (for later) + cost ballpark

| Need | Provider | Notes / cost ballpark |
|------|----------|------------------------|
| LLM | OpenAI gpt-4o-mini + gpt-4o | Start with mini; $20–200+/mo usage |
| Email | Resend or SendGrid | ~$20+/mo |
| WhatsApp | Twilio or Meta Cloud API | Usage-based; $50–300+/mo common |
| Images | fal.ai Flux / DALL·E | ~$0.04–0.08/image |
| Voice | Bland / Retell / Vapi | ~$0.08–0.20/min |
| Video | Runway / HeyGen | Expensive; delay until paid tier |
| Social | Official APIs or Buffer/Late | Buffer ~$6–120/mo |

**Swap pattern:** implement `OpenAILLMService : ILLMService` then in `Program.cs`:
```csharp
builder.Services.AddScoped<ILLMService, OpenAILLMService>();
// instead of MockLLMService
```

---

## 13. Key conventions for agents continuing this project

1. **Do not invent a new stack** unless asked — stay React + .NET + Postgres.  
2. **Always tenant-scope** new tables/endpoints with `OrganizationId`.  
3. **Prefer interfaces + DI** for any external API.  
4. **Frontend:** add methods in `services/api.ts`; keep UI premium (dark, glass, spacing).  
5. **Create actions** should use `Dialog` forms (`components/ui/dialog.tsx`), not silent fake creates.  
6. **No secrets in git** — `.env` is gitignored; use Render/Vercel env vars.  
7. **Avoid rewriting working pages** for style-only churn unless requested.  
8. **EnsureCreated is temporary** — introduce EF migrations before serious production.  
9. **Auth responses** return camelCase `user: { id, name, email, role, organization, organizationId }`.  
10. **CORS** uses `SetIsOriginAllowed` for Vercel preview domains.

---

## 14. Immediate next steps for the next developer / Claude

1. Verify Neon is connected on Render and `/api/health` + `/swagger` work.  
2. Test `/signup` → create campaign → create lead → confirm data persists after refresh.  
3. Implement `OpenAILLMService` and swap DI when user provides OpenAI key.  
4. Implement Resend/SendGrid email service.  
5. Replace `alert()` with toast system.  
6. Add EF Core migrations + CI.  
7. Add Stripe billing when monetization starts.

---

## 15. Known issues / gotchas

- Render Free sleeps → first request slow.  
- Without Postgres env var, API throws on startup (by design).  
- Some Analytics KPIs / email sequences / automation executions are still mock aggregates.  
- Image “generation” uses picsum placeholders.  
- SignalR hubs exist but frontend does not heavily use them yet.  
- `EnsureCreated` won’t evolve schema cleanly — plan migrations soon.  
- JWT secret must match across deploys or old tokens invalidate.  
- Vite env vars require **rebuild** on Vercel after changing `VITE_API_URL`.

---

## 16. Module → page → API map

| Module | Frontend page | Primary APIs |
|--------|---------------|--------------|
| Auth | `pages/auth/*` | `/api/auth/*` |
| Dashboard | `pages/dashboard/Dashboard.tsx` | `/api/analytics/dashboard`, `/channels`, `/api/ai/insights`, tasks |
| AI Command | `pages/ai-command/AICommandCenter.tsx` | `/api/ai/campaign`, `/campaign/save` |
| Campaigns | `pages/campaigns/Campaigns.tsx` | `/api/campaigns` |
| Content | `pages/content/ContentStudio.tsx` | `/api/content/*` + `/api/ai/content` |
| Images | `pages/image/ImageStudio.tsx` | `/api/images/*` |
| Video | `pages/video/VideoStudio.tsx` | `/api/videos/*` |
| Social | `pages/social/SocialMedia.tsx` | `/api/social/*` |
| Email | `pages/email/EmailMarketing.tsx` | `/api/email/*` |
| WhatsApp | `pages/whatsapp/WhatsApp.tsx` | `/api/whatsapp/*` |
| Voice | `pages/voice/VoiceAI.tsx` | `/api/voice/*` |
| CRM | `pages/crm/CRM.tsx` | `/api/leads/*` |
| Automation | `pages/automation/Automation.tsx` | `/api/automation/*` |
| Analytics | `pages/analytics/Analytics.tsx` | `/api/analytics/*` |
| Templates | `pages/templates/Templates.tsx` | `/api/templates` |
| Settings | `pages/settings/Settings.tsx` | `/api/settings/*` |

---

## 17. License / ownership

Private project for the product owner. Continue building toward a production multi-tenant SaaS with real providers, billing, and scale infrastructure as listed above.

---

**Last updated:** July 2026 (SaaS signup + Postgres multi-tenancy + create dialogs + API wiring).  
**Continue from:** Neon connection verification → real provider integrations (OpenAI first).
