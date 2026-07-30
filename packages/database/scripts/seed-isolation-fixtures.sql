-- Fixtures for scripts/verify-tenant-isolation.sql.
-- Run as the OWNER (DIRECT_DATABASE_URL) — the owner is exempt from RLS, which is
-- exactly why seeding works and why the application must not use this role.
--
--   psql "$DIRECT_DATABASE_URL" -f scripts/seed-isolation-fixtures.sql

\set ON_ERROR_STOP on

DELETE FROM "audit_log"      WHERE id = 'au-1';
DELETE FROM "pipeline_stage" WHERE id IN ('st-a', 'st-b');
DELETE FROM "pipeline"       WHERE id IN ('pl-a', 'pl-b');
DELETE FROM "company"        WHERE id IN ('co-a1', 'co-a2', 'co-b1', 'isolation-probe');
DELETE FROM "organization"   WHERE id IN ('org-aaa', 'org-bbb');

INSERT INTO "organization" (id, name, slug, created_at, updated_at) VALUES
    ('org-aaa', 'Isolation Fixture A', 'isolation-fixture-a', now(), now()),
    ('org-bbb', 'Isolation Fixture B', 'isolation-fixture-b', now(), now());

INSERT INTO "company" (id, organization_id, name, created_at, updated_at) VALUES
    ('co-a1', 'org-aaa', 'A One', now(), now()),
    ('co-a2', 'org-aaa', 'A Two', now(), now()),
    ('co-b1', 'org-bbb', 'B One', now(), now());

INSERT INTO "pipeline" (id, organization_id, name, created_at, updated_at) VALUES
    ('pl-a', 'org-aaa', 'A Pipeline', now(), now()),
    ('pl-b', 'org-bbb', 'B Pipeline', now(), now());

INSERT INTO "pipeline_stage" (id, pipeline_id, name, position, created_at, updated_at) VALUES
    ('st-a', 'pl-a', 'A Stage', 1, now(), now()),
    ('st-b', 'pl-b', 'B Stage', 1, now(), now());

INSERT INTO "audit_log" (id, organization_id, actor_type, action, resource_type, created_at) VALUES
    ('au-1', 'org-aaa', 'USER', 'company.created', 'company', now());
