-- One true example of what each AI direction produces.
--
-- Template directions already have a real preview for free: the design-template
-- endpoint renders the layout against sample data, exactly and instantly. AI
-- directions have nothing to render — the only way to show what "Cinematic"
-- looks like is to generate one and keep it.
--
-- The alternative was stock artwork on those cards, which would be a promise
-- about output nobody has seen. So the cards stayed blank until this: an
-- operator generates the set once, and every workspace sees genuine examples
-- made by the same pipeline their own campaigns run through.
--
-- **No organization_id, deliberately.** Directions are platform-wide and ship as
-- code, so their examples are too. One generation serves every tenant instead of
-- each paying to discover what the same eight looks look like. That also means
-- this table is *not* tenant-scoped and must never hold anything client-specific
-- — it is a picture of a shape, not of anyone's business.
CREATE TABLE IF NOT EXISTS "direction_preview" (
    -- The direction id from `creative-directions.ts`. No foreign key: directions
    -- are code, and a preview for one that a later release retires is dead
    -- weight rather than a constraint violation.
    "direction_id" TEXT NOT NULL,
    "url"          TEXT NOT NULL,
    "storage_key"  TEXT NOT NULL,
    -- Which model drew it, so a set generated before a model change can be told
    -- apart from one after it.
    "model"        TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "direction_preview_pkey" PRIMARY KEY ("direction_id")
);

-- Readable by the app role: every tenant's shelf reads these. Writes happen on
-- the platform plane through the owner connection, but the grant covers both
-- rather than splitting a four-row table across two roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "direction_preview" TO vsp_app;
  END IF;
END $$;
