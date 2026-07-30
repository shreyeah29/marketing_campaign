-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "feature_assignment_source" AS ENUM ('PLAN', 'GRANT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "provider_capability" AS ENUM ('LLM', 'IMAGE', 'VIDEO', 'VOICE', 'TRANSCRIPTION', 'EMBEDDING', 'TELEPHONY', 'EMAIL', 'SOCIAL', 'STORAGE', 'PAYMENT');

-- CreateEnum
CREATE TYPE "platform_admin_role" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'SUPPORT');

-- DropIndex
DROP INDEX "company_name_trgm_idx";

-- DropIndex
DROP INDEX "content_document_title_trgm_idx";

-- DropIndex
DROP INDEX "knowledge_chunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "status" "organization_status" NOT NULL DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "plan_id" TEXT;

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price_usd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "yearly_price_usd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "custom_pricing" BOOLEAN NOT NULL DEFAULT false,
    "default_limits" JSONB,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_feature" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,

    CONSTRAINT "plan_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "billing_category" TEXT NOT NULL,
    "default_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_assignment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" "feature_assignment_source" NOT NULL DEFAULT 'PLAN',
    "config" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_limit" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "limit_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configuration" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "capability" "provider_capability" NOT NULL,
    "provider" TEXT NOT NULL,
    "credential_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_assignment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_agent" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "tool_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "logo_dark_url" TEXT,
    "favicon_url" TEXT,
    "display_name" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "accent_color" TEXT,
    "heading_font" TEXT,
    "body_font" TEXT,
    "custom_domain" TEXT,
    "custom_domain_verified_at" TIMESTAMP(3),
    "ai_personality" TEXT,
    "prompt_variables" JSONB,
    "email_from_name" TEXT,
    "email_footer" TEXT,
    "login_tagline" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "platform_admin_role" NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_log" (
    "id" TEXT NOT NULL,
    "platform_admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_organization_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_key_key" ON "plan"("key");

-- CreateIndex
CREATE INDEX "plan_feature_feature_key_idx" ON "plan_feature"("feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_feature_plan_id_feature_key_key" ON "plan_feature"("plan_id", "feature_key");

-- CreateIndex
CREATE INDEX "feature_category_idx" ON "feature"("category");

-- CreateIndex
CREATE INDEX "feature_assignment_organization_id_enabled_idx" ON "feature_assignment"("organization_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "feature_assignment_organization_id_feature_key_key" ON "feature_assignment"("organization_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "organization_limit_organization_id_metric_key" ON "organization_limit"("organization_id", "metric");

-- CreateIndex
CREATE INDEX "provider_configuration_organization_id_capability_is_active_idx" ON "provider_configuration"("organization_id", "capability", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configuration_organization_id_capability_provider_key" ON "provider_configuration"("organization_id", "capability", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "agent_assignment_organization_id_agent_key_key" ON "agent_assignment"("organization_id", "agent_key");

-- CreateIndex
CREATE UNIQUE INDEX "custom_agent_organization_id_key_key" ON "custom_agent"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "branding_organization_id_key" ON "branding"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "branding_custom_domain_key" ON "branding"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_email_key" ON "platform_admin"("email");

-- CreateIndex
CREATE INDEX "platform_audit_log_platform_admin_id_created_at_idx" ON "platform_audit_log"("platform_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_log_target_organization_id_created_at_idx" ON "platform_audit_log"("target_organization_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_plan_id_idx" ON "subscription"("plan_id");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_feature" ADD CONSTRAINT "plan_feature_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_assignment" ADD CONSTRAINT "feature_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_assignment" ADD CONSTRAINT "feature_assignment_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_limit" ADD CONSTRAINT "organization_limit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configuration" ADD CONSTRAINT "provider_configuration_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configuration" ADD CONSTRAINT "provider_configuration_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "provider_credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assignment" ADD CONSTRAINT "agent_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_agent" ADD CONSTRAINT "custom_agent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding" ADD CONSTRAINT "branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Row-level security for the new per-organisation tables.
--
-- The six tables below carry organization_id and are tenant data, so they get the
-- same tenant_isolation policy as every other tenant table — fail-closed when no
-- tenant context is set.
--
-- The platform-global tables (plan, plan_feature, feature, platform_admin,
-- platform_audit_log) deliberately get NO tenant policy: plan/feature are shared
-- reference data readable by all tenants, and the platform_admin tables belong to
-- the super-admin plane, which uses the owner connection and is never reached
-- through a tenant-scoped query. Leaving RLS off them is intentional, not an
-- oversight.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "feature_assignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "feature_assignment" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "organization_limit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_limit" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "provider_configuration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "provider_configuration" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "agent_assignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "agent_assignment" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "custom_agent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_agent" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "branding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "branding" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

-- The new per-org tables must inherit the same grants the application role holds
-- on every other table. provision-app-role.sql already sets ALTER DEFAULT
-- PRIVILEGES, so tables created by this migration are covered — but that only
-- applies to tables created AFTER the role was provisioned. Grant explicitly so a
-- database provisioned before this migration is also correct.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            "plan", "plan_feature", "feature", "feature_assignment",
            "organization_limit", "provider_configuration", "agent_assignment",
            "custom_agent", "branding"
            TO vsp_app;
        -- The application never touches the platform-admin plane.
    END IF;
END $$;
