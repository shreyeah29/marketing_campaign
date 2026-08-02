-- Per-platform channel hubs (Instagram, Facebook) become first-class modules.
-- Mirror rows first (FK target), then grant to every organisation together with
-- the social engine they depend on. Idempotent.
INSERT INTO "feature" ("key", "name", "description", "category", "version", "billing_category", "default_enabled", "is_custom", "created_at", "updated_at")
VALUES
  ('marketing.instagram', 'Instagram', 'The Instagram channel hub — posts, scheduling and per-post results.', 'Marketing', 1, 'included', true, false, now(), now()),
  ('marketing.facebook', 'Facebook', 'The Facebook channel hub — posts, scheduling and per-post results.', 'Marketing', 1, 'included', true, false, now(), now())
ON CONFLICT ("key") DO UPDATE SET "default_enabled" = EXCLUDED."default_enabled";

INSERT INTO "feature_assignment" ("id", "organization_id", "feature_key", "enabled", "source", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", f."key", true, 'GRANT'::"feature_assignment_source", now(), now()
FROM "organization" o
CROSS JOIN (VALUES ('marketing.instagram'), ('marketing.facebook'), ('marketing.social'), ('marketing.email'), ('marketing.whatsapp')) AS f("key")
ON CONFLICT ("organization_id", "feature_key") DO UPDATE SET "enabled" = true, "updated_at" = now();
