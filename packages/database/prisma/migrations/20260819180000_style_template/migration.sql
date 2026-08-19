-- Saved looks: a reference picture, read once, reusable forever.
--
-- The campaign already has `reference_image_url` — one picture, attached to one
-- campaign, describing itself to the model on every single generation. That is
-- the right shape for "make this campaign look like that poster" and the wrong
-- shape for how the request actually arrived: "these are the kinds of styles we
-- follow, and we do not stick to only one."
--
-- A style template is the durable version. The picture is read once by a vision
-- model into a written description of its visual language, and that description
-- is what later generations receive. Three consequences, all of them the point:
--
--   1. It is named and browsable, so a client picks "Festive warm" from a
--      gallery rather than hunting for the file they uploaded in June.
--   2. It costs one vision call ever, not one per poster.
--   3. It is *look only* — palette, lighting, composition, texture, treatment.
--      Never layout, never copy. Layout belongs to the poster brief, which
--      builds it from the campaign's own offer and dates; a saved layout would
--      fight it and win at random.
--
-- Additive and idempotent, with tenant RLS in the same migration: a tenant table
-- that exists for even one deploy without a policy is a tenant table that has
-- served cross-tenant rows.

CREATE TABLE IF NOT EXISTS "style_template" (
    "id"               TEXT NOT NULL,
    "organization_id"  TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    -- The uploaded picture, in our own bucket. Kept so the gallery has something
    -- to show and so the look can be re-read if the prompt vocabulary changes.
    "reference_url"    TEXT NOT NULL,
    -- The visual language in words, written by a vision model. This is what
    -- reaches generation — not the picture — so a poster is designed with the
    -- same eye rather than edited from the reference.
    "look"             TEXT NOT NULL,
    -- One line for the gallery card. Null until the reader writes one.
    "summary"          TEXT,
    -- 'UPLOAD' for a look read from a client's picture. Reserved so a future
    -- curated set can live in the same table without a second gallery.
    "source"           TEXT NOT NULL DEFAULT 'UPLOAD',
    -- How many campaigns have used it. Orders the gallery by what actually gets
    -- chosen instead of by upload date, which says nothing about quality.
    "times_used"       INTEGER NOT NULL DEFAULT 0,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- No database default: `@updatedAt` is set by Prisma on every write, and a
    -- DEFAULT here is drift the schema does not declare.
    "updated_at"       TIMESTAMP(3) NOT NULL,
    "deleted_at"       TIMESTAMP(3),
    CONSTRAINT "style_template_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "style_template_organization_id_deleted_at_idx"
    ON "style_template" ("organization_id", "deleted_at");

-- Names are how a person picks one out of a gallery, so two styles called
-- "Festive" in one workspace is a bug rather than a preference. Partial on
-- `deleted_at` so deleting a style frees its name for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS "style_template_organization_id_name_key"
    ON "style_template" ("organization_id", "name")
    WHERE "deleted_at" IS NULL;

DO $$ BEGIN
    ALTER TABLE "style_template" ADD CONSTRAINT "style_template_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── The campaign's chosen style ──────────────────────────────────────────────
--
-- Alongside `reference_image_url` rather than replacing it. The two are
-- different requests: a one-off "follow this picture" and a durable "use our
-- house style". A campaign may set either, and when both are present the
-- one-off wins, because it is the more specific instruction.
--
-- ON DELETE SET NULL: deleting a style must not delete the campaigns that used
-- it, and a campaign whose style is gone falls back to no style rather than to
-- a dangling reference.
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "style_template_id" TEXT;

DO $$ BEGIN
    ALTER TABLE "campaign" ADD CONSTRAINT "campaign_style_template_id_fkey"
        FOREIGN KEY ("style_template_id") REFERENCES "style_template"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "campaign_style_template_id_idx"
    ON "campaign" ("style_template_id");

-- ── Tenant isolation ─────────────────────────────────────────────────────────
ALTER TABLE "style_template" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "style_template";
CREATE POLICY tenant_isolation ON "style_template" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

-- provision-app-role.sql grants on ALL TABLES at provisioning time, which a
-- table created afterwards misses until the next re-run. Granting here means the
-- app role can read its own new table on the deploy that creates it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "style_template" TO vsp_app;
  END IF;
END $$;
