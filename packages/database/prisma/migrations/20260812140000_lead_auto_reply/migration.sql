-- WhatsApp auto-reply for inbound Meta leads.
--
-- Strictly additive and idempotent: three nullable/defaulted columns on an
-- existing table, so an older API instance running against a migrated database
-- is unaffected and a re-run is a no-op.
--
-- Off by default on purpose. This messages a real person within seconds of them
-- submitting a form; that is a decision each organisation makes, not one they
-- inherit from a deploy.

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "lead_auto_reply_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "lead_auto_reply_template" TEXT;

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "lead_auto_reply_language" TEXT;
