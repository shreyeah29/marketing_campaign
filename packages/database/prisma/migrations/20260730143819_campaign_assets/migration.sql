-- CreateEnum
CREATE TYPE "asset_platform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'GOOGLE', 'YOUTUBE', 'TIKTOK', 'GENERIC');

-- CreateEnum
CREATE TYPE "asset_kind" AS ENUM ('POST', 'STORY', 'REEL', 'CAPTION', 'AD_COPY', 'AD_HEADLINE', 'AD_DESCRIPTION', 'IMAGE_PROMPT', 'VIDEO_PROMPT');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('DRAFT', 'GENERATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "campaign_asset" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "platform" "asset_platform" NOT NULL DEFAULT 'GENERIC',
    "kind" "asset_kind" NOT NULL DEFAULT 'POST',
    "status" "asset_status" NOT NULL DEFAULT 'GENERATED',
    "title" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "media_url" TEXT,
    "ai_versions" JSONB,
    "scheduled_for" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "external_post_id" TEXT,
    "failure_reason" TEXT,
    "owner_id" TEXT,
    "reviewer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaign_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_asset_comment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "author_id" TEXT,
    "body" TEXT NOT NULL,
    "event" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_asset_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_asset_organization_id_deleted_at_idx" ON "campaign_asset"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "campaign_asset_organization_id_status_idx" ON "campaign_asset"("organization_id", "status");

-- CreateIndex
CREATE INDEX "campaign_asset_organization_id_campaign_id_idx" ON "campaign_asset"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "campaign_asset_comment_organization_id_asset_id_idx" ON "campaign_asset_comment"("organization_id", "asset_id");

-- AddForeignKey
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_asset_comment" ADD CONSTRAINT "campaign_asset_comment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_asset_comment" ADD CONSTRAINT "campaign_asset_comment_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "campaign_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Row-level security (hand-appended; Prisma does not generate it) ──────────
ALTER TABLE "campaign_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_asset" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "campaign_asset_comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_asset_comment" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
