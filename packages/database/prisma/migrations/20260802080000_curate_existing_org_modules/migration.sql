-- Curate EXISTING organisations to the current module catalog.
-- New orgs already get the curated set from the wizard; this brings every
-- previously-provisioned org in line: retired categories switched off, the
-- new default analytics modules switched on. Idempotent.

-- 1. Ensure the new analytics features exist in the registry mirror (FK target).
INSERT INTO "feature" ("key", "name", "description", "category", "version", "billing_category", "default_enabled", "is_custom", "created_at", "updated_at")
VALUES
  ('analytics.leads', 'Lead Analytics', 'Lead funnel, per-source performance and trend.', 'Analytics', 1, 'included', true, false, now(), now()),
  ('analytics.calendar', 'Content Calendar', 'Month view of everything scheduled and published across platforms.', 'Analytics', 1, 'included', true, false, now(), now())
ON CONFLICT ("key") DO UPDATE SET "default_enabled" = EXCLUDED."default_enabled", "name" = EXCLUDED."name";

-- 2. Every existing organisation gets the new default-on analytics modules.
INSERT INTO "feature_assignment" ("id", "organization_id", "feature_key", "enabled", "source", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", f."key", true, 'GRANT'::"feature_assignment_source", now(), now()
FROM "organization" o
CROSS JOIN (VALUES ('analytics.leads'), ('analytics.calendar')) AS f("key")
ON CONFLICT ("organization_id", "feature_key") DO UPDATE SET "enabled" = true, "updated_at" = now();

-- 3. Retired categories are switched off everywhere (code kept, entitlement removed).
UPDATE "feature_assignment"
SET "enabled" = false, "updated_at" = now()
WHERE "feature_key" LIKE 'automation.%'
   OR "feature_key" LIKE 'comms.%'
   OR "feature_key" LIKE 'commerce.%'
   OR "feature_key" LIKE 'support.%';
