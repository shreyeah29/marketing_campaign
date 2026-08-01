# Customization Guide

How to tailor the platform per client without forking it.

## Per-organisation configuration surfaces

| Surface                | Where it lives                                                | Effect                                                                                        |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Features**           | `feature_assignment` (enabled, source, config, expiresAt)     | which modules the org has                                                                     |
| **Per-feature config** | `feature_assignment.config`, validated by `FEATURE_CONFIG`    | each module's settings, provider choice, sub-limits                                           |
| **Plan**               | `subscription.plan_id` → `plan` + `plan_feature`              | the baseline feature bundle                                                                   |
| **Limits**             | `organization_limit` (per metric, -1 = unlimited)             | users, storage, AI requests, voice minutes, …                                                 |
| **Providers**          | `provider_configuration` (capability → provider → credential) | which LLM / voice / image / storage / email / payment provider fills each capability          |
| **Agents**             | `agent_assignment` + `custom_agent`                           | which AI employees are on, plus bespoke ones                                                  |
| **Branding**           | `branding`                                                    | logo, favicon, colours, fonts, custom domain, AI personality, email templates, login branding |
| **Integrations**       | `integration_connection`                                      | Google, Microsoft, Slack, Twilio, Meta, … — each optional                                     |

## Presets (industry templates)

`packages/contracts/src/presets.ts`. A preset bundles features + recommended plan

- per-feature config overrides, so a client type is one click. `resolvePreset(id)`
  returns the full closure with each feature's effective config — nothing left to
  set by hand. Presets are starting points: the wizard applies one, then the
  operator can adjust anything before saving.

Built-in presets: Marketing Agency, Law Firm, Medical Clinic, E-commerce, Real
Estate, Simple CRM.

## Adding a custom module for one client

See `PLUGIN_REGISTRY.md`. In short: a plugin package registers a feature manifest
(`custom: true`), the module is synced to the `feature` table, and it is assigned
to that org alone with `source: CUSTOM`. It inherits navigation, permissions,
billing, audit, limits and multi-tenancy automatically. Core untouched.

## Providers as plugins

Every provider (OpenAI, Anthropic, Gemini, xAI, DeepSeek, Mistral, OpenRouter,
Vapi, Retell, ElevenLabs, Deepgram, Cartesia, Flux, Ideogram, DALL·E, Runway,
Luma, Pika, R2, S3, Supabase, Resend, SendGrid, SES, Stripe, Razorpay) implements
a port from `@vsp/ai-core` and is selected per organisation via
`provider_configuration`. Business logic depends on the port, never the SDK — so
swapping a provider is a config change, not a code change.
