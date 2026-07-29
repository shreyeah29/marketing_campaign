# VSP AI Marketing OS

> Your AI Marketing Team in One Platform.

A production-quality enterprise AI Marketing SaaS platform built with React 19, .NET 9, and a full suite of AI-powered marketing tools.

## Tech Stack

### Frontend
- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- Framer Motion animations
- TanStack Query, React Router, React Hook Form + Zod
- Recharts for data visualization
- Zustand for state management

### Backend
- .NET 9 Web API
- Clean Architecture (Domain → Application → Infrastructure → API)
- CQRS with MediatR
- JWT Authentication
- SignalR for real-time notifications
- Mock service layer (replace with real AI APIs via DI)

## Features

- 🤖 **AI Command Center** — Generate full 360° campaigns from a prompt
- 📊 **Dashboard** — KPI cards, charts, AI insights, activity feed
- 📝 **Content Studio** — Blog, email, landing pages, ads
- 🖼️ **Image Studio** — AI-generated marketing visuals
- 🎬 **Video Studio** — Script, storyboard, render pipeline
- 📱 **Social Media** — Scheduler, calendar, multi-platform
- 📧 **Email Marketing** — Campaigns, sequences, analytics
- 💬 **WhatsApp** — Conversations, broadcasts, templates
- 📞 **Voice AI** — Automated calls, transcripts, CRM updates
- 👥 **CRM** — Leads, contacts, pipeline, scoring
- ⚡ **Automation** — Visual workflow builder
- 📈 **Analytics** — ROI, channel performance, AI recommendations
- ⚙️ **Settings** — Organization, brand, API keys, billing

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
dotnet restore
dotnet run --project src/VSP.MarketingOS.API
```

## Deployment

### Frontend → Vercel
1. Connect this repo to Vercel
2. Set root directory to `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`

### Backend → Render
1. Connect this repo to Render
2. Set root directory to `backend/src/VSP.MarketingOS.API`
3. Build command: `dotnet publish -c Release -o out`
4. Start command: `dotnet out/VSP.MarketingOS.API.dll`
5. Set environment variables from `appsettings.json`

## Architecture: Mock → Real AI Services

All external AI/API integrations go through interfaces:

| Interface | Mock | Real (connect later) |
|-----------|------|---------------------|
| `ILLMService` | `MockLLMService` | `OpenAILLMService` |
| `IEmailService` | `MockEmailService` | `SendGridEmailService` |
| `IWhatsAppService` | `MockWhatsAppService` | `TwilioWhatsAppService` |
| `IVoiceService` | `MockVoiceService` | `BlandAIVoiceService` |
| `IImageGenerationService` | `MockImageGenerationService` | `DallEImageGenerationService` |

To connect real APIs: **only change DI registrations in `Program.cs`**. No UI or API changes needed.

## License
Proprietary — VSP Law Associates / VSP AI Marketing OS
