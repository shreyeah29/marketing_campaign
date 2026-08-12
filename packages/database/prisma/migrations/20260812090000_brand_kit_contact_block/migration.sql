-- Brand kit: the factual contact block printed onto posters, plus advertising
-- compliance. Strictly additive — every column is nullable and nothing existing
-- is renamed or dropped, so an older build keeps serving against this schema.

ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "contact_email"  TEXT;
ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "contact_phones" JSONB;
ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "offices"        JSONB;
ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "services"       JSONB;
ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "disclaimers"    JSONB;
ALTER TABLE "branding" ADD COLUMN IF NOT EXISTS "banned_claims"  JSONB;
