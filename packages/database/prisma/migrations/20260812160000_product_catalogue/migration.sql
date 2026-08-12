-- Product catalogue for creative generation, plus the campaign's offer fields.
--
-- Additive and idempotent throughout. The two new tables get tenant RLS in the
-- same migration rather than a follow-up: a tenant table that exists for even
-- one deploy without a policy is a tenant table that has served cross-tenant
-- rows, and the API's boot preflight refuses to start without one anyway.

-- ── Campaign: the offer, as printed on creative ──────────────────────────────
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "primary_offer" TEXT;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "secondary_offer" TEXT;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "coupon_code" TEXT;
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "cta" TEXT;

-- ── Product ──────────────────────────────────────────────────────────────────
-- Prices are INTEGER minor units. Not NUMERIC, not DOUBLE: these are printed
-- verbatim onto advertising, and the only representation that cannot round is
-- the one that never divides.
CREATE TABLE IF NOT EXISTS "product" (
    "id"               TEXT NOT NULL,
    "organization_id"  TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "brand"            TEXT,
    "sku"              TEXT,
    "description"      TEXT,
    "product_url"      TEXT,
    "mrp_minor"        INTEGER,
    "sale_price_minor" INTEGER,
    "currency"         TEXT NOT NULL DEFAULT 'INR',
    "image_url"        TEXT,
    "cutout_url"       TEXT,
    "attributes"       JSONB,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- No database default: `@updatedAt` is set by Prisma on every write, and a
    -- DEFAULT here is drift the schema does not declare.
    "updated_at"       TIMESTAMP(3) NOT NULL,
    "deleted_at"       TIMESTAMP(3),
    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- Idempotent, and a no-op on a fresh create. Present so that a database which
-- already received the earlier version of this file converges to the same shape
-- rather than staying permanently drifted.
ALTER TABLE "product" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "product_organization_id_deleted_at_idx"
    ON "product" ("organization_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "product_organization_id_brand_idx"
    ON "product" ("organization_id", "brand");

DO $$ BEGIN
    ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CampaignProduct ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_product" (
    "id"              TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id"     TEXT NOT NULL,
    "product_id"      TEXT NOT NULL,
    "position"        INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_product_campaign_id_product_id_key"
    ON "campaign_product" ("campaign_id", "product_id");
CREATE INDEX IF NOT EXISTS "campaign_product_organization_id_idx"
    ON "campaign_product" ("organization_id");

DO $$ BEGIN
    ALTER TABLE "campaign_product" ADD CONSTRAINT "campaign_product_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "campaign_product" ADD CONSTRAINT "campaign_product_campaign_id_fkey"
        FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "campaign_product" ADD CONSTRAINT "campaign_product_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "product"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tenant isolation ─────────────────────────────────────────────────────────
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "product";
CREATE POLICY tenant_isolation ON "product" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "campaign_product" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "campaign_product";
CREATE POLICY tenant_isolation ON "campaign_product" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
