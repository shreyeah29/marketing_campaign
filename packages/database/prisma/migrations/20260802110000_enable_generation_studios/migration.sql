-- Image/Video Generation are core product surfaces of the AI Engine: every
-- organisation gets them. Idempotent; feature rows exist via registry sync.
INSERT INTO "feature_assignment" ("id", "organization_id", "feature_key", "enabled", "source", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", f."key", true, 'GRANT'::"feature_assignment_source", now(), now()
FROM "organization" o
CROSS JOIN (VALUES ('ai.image'), ('ai.video'), ('marketing.campaigns')) AS f("key")
ON CONFLICT ("organization_id", "feature_key") DO UPDATE SET "enabled" = true, "updated_at" = now();
