-- Monthly client report: opt-in flag + optional recipient override per
-- organisation. Off by default; when no recipient is set the worker falls back
-- to the organisation OWNER's email. Idempotent.
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "monthly_report_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "report_recipient_email" TEXT;
