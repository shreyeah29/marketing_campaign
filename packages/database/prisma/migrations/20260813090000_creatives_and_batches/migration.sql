-- Rendered creatives and the batches that produce them.
--
-- Additive and idempotent. Both tables get tenant RLS in the same migration, for
-- the same reason as the product catalogue: a tenant table that exists for even
-- one deploy without a policy has served cross-tenant rows, and the API's boot
-- preflight refuses to start without one.

DO $$ BEGIN
    CREATE TYPE "CreativeStatus" AS ENUM (
        'DRAFT', 'RENDERING', 'READY', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'FAILED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "BatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── BatchJob ─────────────────────────────────────────────────────────────────
-- Created before Creative because a creative points at its batch.
CREATE TABLE IF NOT EXISTS "batch_job" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id"     TEXT NOT NULL,
    "kind"            TEXT NOT NULL,
    "total"           INTEGER NOT NULL DEFAULT 0,
    "completed"       INTEGER NOT NULL DEFAULT 0,
    "failed"          INTEGER NOT NULL DEFAULT 0,
    "status"          "BatchStatus" NOT NULL DEFAULT 'RUNNING',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "finished_at"     TIMESTAMP(3),
    CONSTRAINT "batch_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "batch_job_organization_id_campaign_id_idx"
    ON "batch_job" ("organization_id", "campaign_id");

DO $$ BEGIN
    ALTER TABLE "batch_job" ADD CONSTRAINT "batch_job_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "batch_job" ADD CONSTRAINT "batch_job_campaign_id_fkey"
        FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Creative ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "creative" (
    "id"               TEXT NOT NULL,
    "organization_id"  TEXT NOT NULL,
    "campaign_id"      TEXT NOT NULL,
    "product_id"       TEXT,
    "template_slug"    TEXT NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "scene_id"         TEXT,
    -- The frozen copy. An approved advertisement must render tomorrow exactly as
    -- it was approved, so this is a snapshot rather than a join.
    "content"          JSONB NOT NULL,
    "aspect_ratio"     TEXT NOT NULL DEFAULT '1:1',
    "rendered_url"     TEXT,
    "render_hash"      TEXT,
    "status"           "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
    "failure_reason"   TEXT,
    "approved_at"      TIMESTAMP(3),
    "approved_by_id"   TEXT,
    "social_post_id"   TEXT,
    "batch_id"         TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    "deleted_at"       TIMESTAMP(3),
    CONSTRAINT "creative_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "creative_organization_id_campaign_id_status_idx"
    ON "creative" ("organization_id", "campaign_id", "status");
CREATE INDEX IF NOT EXISTS "creative_organization_id_batch_id_idx"
    ON "creative" ("organization_id", "batch_id");

DO $$ BEGIN
    ALTER TABLE "creative" ADD CONSTRAINT "creative_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "creative" ADD CONSTRAINT "creative_campaign_id_fkey"
        FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL, not CASCADE: deleting a product must not erase advertising that has
-- already been approved or published from it.
DO $$ BEGIN
    ALTER TABLE "creative" ADD CONSTRAINT "creative_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "product"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "creative" ADD CONSTRAINT "creative_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "batch_job"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tenant isolation ─────────────────────────────────────────────────────────
ALTER TABLE "batch_job" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "batch_job";
CREATE POLICY tenant_isolation ON "batch_job" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "creative" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "creative";
CREATE POLICY tenant_isolation ON "creative" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
