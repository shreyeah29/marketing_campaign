-- ═══════════════════════════════════════════════════════════════════════════════
-- Row-level security — tenant isolation layer 3
--
-- Layers 1 and 2 (AsyncLocalStorage request context + the Prisma client
-- extension) live in application code. This layer is the one that still holds
-- when application code is wrong: a raw $queryRaw, a hand-written report, or a
-- future service that forgets to scope its reads cannot cross tenants.
--
-- ── Contract ─────────────────────────────────────────────────────────────────
-- Every connection must run, per transaction:
--       SELECT set_config('app.organization_id', $1, true);
-- The third argument makes it transaction-local, so a pooled connection cannot
-- leak the setting into the next request. When unset, the predicate evaluates to
-- NULL and every row is filtered out — this fails CLOSED.
--
-- ── Why there is no bypass flag ───────────────────────────────────────────────
-- An earlier revision granted an escape hatch via a `app.bypass_rls` GUC. That
-- was wrong: PostgreSQL lets any role SET a custom GUC, so the application role
-- could grant itself a full cross-tenant read. Verified, then removed.
--
-- The privilege boundary is now the ROLE, which cannot be forged by SET:
--
--   · Migrations and seeds connect as the table OWNER. RLS is ENABLEd but not
--     FORCEd, so the owner is exempt and administrative work proceeds normally.
--     → DIRECT_DATABASE_URL
--
--   · The application connects as a NON-OWNER role with no BYPASSRLS attribute
--     and no superuser bit. For that role these policies are absolute.
--     → DATABASE_URL
--
-- Provision the application role with scripts/provision-app-role.sql. The API
-- asserts at boot that its own connection is genuinely subject to RLS, so a
-- misconfigured deployment fails immediately rather than silently losing
-- isolation.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_organization_id() RETURNS text
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$ SELECT nullif(current_setting('app.organization_id', true), '') $$;

COMMENT ON FUNCTION app.current_organization_id() IS
    'Tenant of the current transaction. NULL when unset, which filters every row.';

-- Confirms the caller is actually constrained by RLS. Used by the API boot check.
CREATE OR REPLACE FUNCTION app.rls_enforced_for_current_user() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
        SELECT NOT (
            (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user)
            OR pg_catalog.pg_has_role(current_user, (
                SELECT c.relowner FROM pg_class c
                WHERE c.relname = 'organization' AND c.relnamespace = 'public'::regnamespace
            ), 'MEMBER')
        )
    $$;

COMMENT ON FUNCTION app.rls_enforced_for_current_user() IS
    'False when the current role is superuser, has BYPASSRLS, or owns the tables.';

-- ─── Tenant root ─────────────────────────────────────────────────────────────
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization" FOR ALL
    USING ("id" = app.current_organization_id())
    WITH CHECK ("id" = app.current_organization_id());

-- ─── Tables with a direct tenant column (48) ──────────────────────
ALTER TABLE "organization_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_settings" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "membership" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitation" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "api_key" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscription" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "usage_record" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_record" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "contact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contact" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lead" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "pipeline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pipeline" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "deal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "deal" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "activity" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "task" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "appointment" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "note" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "content_document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "content_document" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "media_asset" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "brand_kit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "brand_kit" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "email_campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_campaign" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "email_sequence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_sequence" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "email_send" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_send" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "conversation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversation" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "message" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "message_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "message_template" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "phone_number" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "phone_number" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "call" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "call" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "social_account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "social_account" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "social_post" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "social_post" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "workflow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "workflow_run" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow_run" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "agent_run" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_run" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_usage" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "prompt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "prompt" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "knowledge_base" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_base" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "knowledge_document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_document" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "knowledge_chunk" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_chunk" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "metric_daily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "metric_daily" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "attribution_touch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attribution_touch" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "template" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "template_install" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "template_install" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "provider_credential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "provider_credential" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "integration_connection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_connection" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "outbox_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "outbox_event" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "webhook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_log" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "idempotency_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "idempotency_key" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

-- ─── Child tables, scoped through their parent (13) ─────────────
ALTER TABLE "pipeline_stage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pipeline_stage" FOR ALL
    USING (EXISTS (SELECT 1 FROM "pipeline" p WHERE p."id" = "pipeline_stage"."pipeline_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "pipeline" p WHERE p."id" = "pipeline_stage"."pipeline_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "campaign_channel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_channel" FOR ALL
    USING (EXISTS (SELECT 1 FROM "campaign" p WHERE p."id" = "campaign_channel"."campaign_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "campaign" p WHERE p."id" = "campaign_channel"."campaign_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "content_revision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "content_revision" FOR ALL
    USING (EXISTS (SELECT 1 FROM "content_document" p WHERE p."id" = "content_revision"."document_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "content_document" p WHERE p."id" = "content_revision"."document_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "content_approval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "content_approval" FOR ALL
    USING (EXISTS (SELECT 1 FROM "content_document" p WHERE p."id" = "content_approval"."document_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "content_document" p WHERE p."id" = "content_approval"."document_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "email_sequence_step" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_sequence_step" FOR ALL
    USING (EXISTS (SELECT 1 FROM "email_sequence" p WHERE p."id" = "email_sequence_step"."sequence_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "email_sequence" p WHERE p."id" = "email_sequence_step"."sequence_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "email_sequence_enrollment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_sequence_enrollment" FOR ALL
    USING (EXISTS (SELECT 1 FROM "email_sequence" p WHERE p."id" = "email_sequence_enrollment"."sequence_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "email_sequence" p WHERE p."id" = "email_sequence_enrollment"."sequence_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "social_post_target" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "social_post_target" FOR ALL
    USING (EXISTS (SELECT 1 FROM "social_post" p WHERE p."id" = "social_post_target"."post_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "social_post" p WHERE p."id" = "social_post_target"."post_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "workflow_version" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow_version" FOR ALL
    USING (EXISTS (SELECT 1 FROM "workflow" p WHERE p."id" = "workflow_version"."workflow_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "workflow" p WHERE p."id" = "workflow_version"."workflow_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "workflow_run_step" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workflow_run_step" FOR ALL
    USING (EXISTS (SELECT 1 FROM "workflow_run" p WHERE p."id" = "workflow_run_step"."run_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "workflow_run" p WHERE p."id" = "workflow_run_step"."run_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "agent_run_step" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_run_step" FOR ALL
    USING (EXISTS (SELECT 1 FROM "agent_run" p WHERE p."id" = "agent_run_step"."run_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "agent_run" p WHERE p."id" = "agent_run_step"."run_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "tool_call" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tool_call" FOR ALL
    USING (EXISTS (SELECT 1 FROM "agent_run" p WHERE p."id" = "tool_call"."run_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "agent_run" p WHERE p."id" = "tool_call"."run_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "prompt_version" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "prompt_version" FOR ALL
    USING (EXISTS (SELECT 1 FROM "prompt" p WHERE p."id" = "prompt_version"."prompt_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "prompt" p WHERE p."id" = "prompt_version"."prompt_id" AND p."organization_id" = app.current_organization_id()));

ALTER TABLE "webhook_delivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_delivery" FOR ALL
    USING (EXISTS (SELECT 1 FROM "webhook" p WHERE p."id" = "webhook_delivery"."webhook_id" AND p."organization_id" = app.current_organization_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM "webhook" p WHERE p."id" = "webhook_delivery"."webhook_id" AND p."organization_id" = app.current_organization_id()));

-- ─── Audit log is append-only ────────────────────────────────────────────────
-- An audit trail that can be edited is not an audit trail.
--
-- UPDATE is rejected unconditionally, for every role including the owner: there
-- is no legitimate reason to rewrite history, so no exemption is offered.
--
-- DELETE is deliberately NOT blocked by this trigger. Retention windows and
-- GDPR/CCPA erasure requests are real obligations, and a blanket prohibition
-- would make them impossible. DELETE is instead withheld at the privilege layer:
-- scripts/provision-app-role.sql revokes it from the application role, so only a
-- privileged maintenance job can purge, and only deliberately.

CREATE OR REPLACE FUNCTION app.reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN
        RAISE EXCEPTION 'Table % is append-only; % is not permitted',
            TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
    END $$;

CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

-- ─── Vector index for the knowledge base ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw_idx
    ON "knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops);

-- ─── Trigram indexes backing search-as-you-type ──────────────────────────────
CREATE INDEX IF NOT EXISTS contact_name_trgm_idx
    ON "contact" USING gin (("first_name" || ' ' || coalesce("last_name", '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_name_trgm_idx
    ON "company" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS content_document_title_trgm_idx
    ON "content_document" USING gin ("title" gin_trgm_ops);
