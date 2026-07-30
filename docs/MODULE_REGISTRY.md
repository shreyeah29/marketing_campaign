# Module Registry

Backend modules that features map to (`FeatureManifest.backendModule`). A module
is a bounded context (see `ARCHITECTURE.md §4`); a feature is a user-visible
capability a module provides. Several features can share a module.

| Module | Features it powers | Status |
| ------ | ------------------ | ------ |
| `crm` | contacts, companies, leads, pipelines, deals, tasks, notes | ✅ built |
| `analytics` | dashboard, kpi, reports, revenue, ai.analytics, ai.insights | ✅ built |
| `agents` | ai.chat, ai.copywriter, ai.meeting_assistant | ▶ ai-core done; runtime pending |
| `messaging` | marketing.email/sms/whatsapp, comms.gmail/outlook, live_chat | schema done; handlers pending |
| `media` | ai.image, ai.video, documents.storage/contracts, files | schema done; handlers pending |
| `telephony` | ai.voice_calling, ai.voice_receptionist | schema done; handlers pending |
| `social` | marketing.social | schema done; handlers pending |
| `content` | marketing.seo, marketing.landing_pages | schema done; handlers pending |
| `automation` | workflows, scheduled_jobs, ai_automation | schema done; handlers pending |
| `knowledge` | ai.knowledge_base, documents.knowledge_base | schema (pgvector) done; ingest pending |
| `billing` | commerce.billing/invoices/payments/stripe | schema done; Stripe pending |
| `support` | ticketing, helpdesk, customer_portal | planned |
| `platform` | webhooks, feature/plan/limit admin, super-admin plane | ▶ registry done; portal pending |

## Rule

A module never imports another module's internals. Cross-module communication is
**events only** (`@vsp/contracts` event registry → transactional outbox). This is
what lets a module be extracted into its own service later without renegotiating
its interface — and what lets a feature be toggled per organisation without a
module knowing which other features are on.
