-- CreateEnum
CREATE TYPE "meta_connection_status" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ad_objective" AS ENUM ('LEAD_GENERATION', 'CONVERSIONS', 'TRAFFIC', 'AWARENESS', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "ad_destination" AS ENUM ('INSTANT_FORM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ad_review_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ad_delivery_status" AS ENUM ('PAUSED', 'ACTIVE', 'PENDING_META_REVIEW', 'DISAPPROVED', 'COMPLETED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "meta_webhook_status" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "chatbot_session_status" AS ENUM ('ACTIVE', 'COMPLETED', 'HANDOFF', 'ABANDONED');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "ad_id" TEXT,
ADD COLUMN     "meta_lead_id" TEXT;

-- CreateTable
CREATE TABLE "meta_connection" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "meta_connection_status" NOT NULL DEFAULT 'PENDING',
    "business_id" TEXT,
    "ad_account_id" TEXT,
    "page_id" TEXT,
    "ig_user_id" TEXT,
    "waba_id" TEXT,
    "phone_number_id" TEXT,
    "credential_id" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "monthly_spend_cap" DECIMAL(14,2),
    "connected_by_id" TEXT,
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaign" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "ad_objective" NOT NULL DEFAULT 'LEAD_GENERATION',
    "destination" "ad_destination" NOT NULL DEFAULT 'INSTANT_FORM',
    "reviewStatus" "ad_review_status" NOT NULL DEFAULT 'DRAFT',
    "deliveryStatus" "ad_delivery_status" NOT NULL DEFAULT 'PAUSED',
    "daily_budget" DECIMAL(14,2),
    "lifetime_budget" DECIMAL(14,2),
    "spend_cap" DECIMAL(14,2),
    "prompt" TEXT,
    "generated_by" "agent_id",
    "meta_campaign_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ad_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_set" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "daily_budget" DECIMAL(14,2),
    "lifetime_budget" DECIMAL(14,2),
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "optimization_goal" TEXT,
    "billing_event" TEXT,
    "meta_ad_set_id" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creative" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "media_asset_id" TEXT,
    "image_url" TEXT,
    "primary_text" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "call_to_action" TEXT,
    "link_url" TEXT,
    "lead_form_id" TEXT,
    "meta_creative_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "ad_set_id" TEXT NOT NULL,
    "creative_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryStatus" "ad_delivery_status" NOT NULL DEFAULT 'PAUSED',
    "meta_ad_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_lead_form" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "privacy_policy_url" TEXT,
    "meta_form_id" TEXT,
    "pipeline_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_lead_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insight" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "ad_id" TEXT,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_webhook_event" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "field" TEXT,
    "status" "meta_webhook_status" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "meta_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_flow" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "completion_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chatbot_flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_session" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "status" "chatbot_session_status" NOT NULL DEFAULT 'ACTIVE',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_connection_organization_id_key" ON "meta_connection"("organization_id");

-- CreateIndex
CREATE INDEX "ad_campaign_organization_id_reviewStatus_idx" ON "ad_campaign"("organization_id", "reviewStatus");

-- CreateIndex
CREATE INDEX "ad_campaign_organization_id_deliveryStatus_idx" ON "ad_campaign"("organization_id", "deliveryStatus");

-- CreateIndex
CREATE INDEX "ad_set_organization_id_campaign_id_idx" ON "ad_set"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "ad_creative_organization_id_campaign_id_idx" ON "ad_creative"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "ad_organization_id_campaign_id_idx" ON "ad"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "meta_lead_form_organization_id_connection_id_idx" ON "meta_lead_form"("organization_id", "connection_id");

-- CreateIndex
CREATE INDEX "ad_insight_organization_id_date_idx" ON "ad_insight"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insight_campaign_id_ad_id_date_key" ON "ad_insight"("campaign_id", "ad_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meta_webhook_event_external_id_key" ON "meta_webhook_event"("external_id");

-- CreateIndex
CREATE INDEX "meta_webhook_event_status_received_at_idx" ON "meta_webhook_event"("status", "received_at");

-- CreateIndex
CREATE INDEX "chatbot_flow_organization_id_is_active_idx" ON "chatbot_flow"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "chatbot_session_organization_id_status_idx" ON "chatbot_session"("organization_id", "status");

-- CreateIndex
CREATE INDEX "chatbot_session_conversation_id_idx" ON "chatbot_session"("conversation_id");

-- CreateIndex
CREATE INDEX "lead_organization_id_ad_id_idx" ON "lead"("organization_id", "ad_id");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connection" ADD CONSTRAINT "meta_connection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_lead_form_id_fkey" FOREIGN KEY ("lead_form_id") REFERENCES "meta_lead_form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "ad_creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_form" ADD CONSTRAINT "meta_lead_form_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_lead_form" ADD CONSTRAINT "meta_lead_form_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight" ADD CONSTRAINT "ad_insight_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight" ADD CONSTRAINT "ad_insight_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight" ADD CONSTRAINT "ad_insight_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_flow" ADD CONSTRAINT "chatbot_flow_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_session" ADD CONSTRAINT "chatbot_session_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_session" ADD CONSTRAINT "chatbot_session_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "chatbot_flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
