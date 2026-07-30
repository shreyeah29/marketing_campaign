-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "plan_tier" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'PAUSED');

-- CreateEnum
CREATE TYPE "usage_metric" AS ENUM ('AI_TOKENS', 'IMAGES_GENERATED', 'VIDEO_SECONDS', 'VOICE_MINUTES', 'EMAILS_SENT', 'MESSAGES_SENT', 'SEATS');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'UNQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('OPEN', 'WON', 'LOST', 'ABANDONED');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'MESSAGE', 'STATUS_CHANGE', 'AI_ACTION');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELED');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "channel_type" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'GOOGLE_ADS', 'EMAIL', 'WHATSAPP', 'SMS', 'VOICE', 'SEO', 'CONTENT');

-- CreateEnum
CREATE TYPE "content_type" AS ENUM ('BLOG_POST', 'LANDING_PAGE', 'AD_COPY', 'EMAIL_COPY', 'SOCIAL_POST', 'VIDEO_SCRIPT', 'CASE_STUDY', 'PRESS_RELEASE', 'SEO_BRIEF', 'WHITEPAPER');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'FONT');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "conversation_channel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'VOICE', 'WEB_CHAT');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "email_send_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'FAILED');

-- CreateEnum
CREATE TYPE "call_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "call_status" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "social_post_status" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "workflow_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('PENDING', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "agent_id" AS ENUM ('CMO', 'COPYWRITER', 'DESIGNER', 'VIDEO_CREATOR', 'EMAIL_SPECIALIST', 'SEO_EXPERT', 'CRM_ASSISTANT', 'VOICE_AGENT', 'WHATSAPP_AGENT', 'SALES_AGENT', 'ANALYTICS_AGENT', 'AUTOMATION_AGENT');

-- CreateEnum
CREATE TYPE "agent_step_type" AS ENUM ('PLAN', 'DELEGATION', 'TOOL_CALL', 'MODEL_CALL', 'MESSAGE', 'APPROVAL_GATE');

-- CreateEnum
CREATE TYPE "provider_kind" AS ENUM ('LLM', 'IMAGE', 'VIDEO', 'VOICE', 'TRANSCRIPTION', 'EMBEDDING', 'TELEPHONY', 'EMAIL', 'SOCIAL', 'STORAGE', 'PAYMENT', 'ANALYTICS');

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'XAI', 'DEEPSEEK', 'ELEVENLABS', 'DEEPGRAM', 'IDEOGRAM', 'STABILITY', 'FLUX', 'RUNWAY', 'KLING', 'LUMA', 'PIKA');

-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('META', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'GOOGLE', 'TWILIO', 'VAPI', 'RETELL', 'WHATSAPP_BUSINESS', 'RESEND', 'STRIPE');

-- CreateEnum
CREATE TYPE "integration_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'API_KEY');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "knowledge_source_type" AS ENUM ('UPLOAD', 'URL', 'TEXT', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "notification_level" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "job_title" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "active_organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "id_token" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "logo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "industry" TEXT,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "metadata" JSONB,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tagline" TEXT,
    "brand_voice" TEXT,
    "target_audience" TEXT,
    "value_props" JSONB,
    "default_llm_provider" "ai_provider" NOT NULL DEFAULT 'ANTHROPIC',
    "default_llm_model" TEXT,
    "require_content_approval" BOOLEAN NOT NULL DEFAULT true,
    "autonomy_level" INTEGER NOT NULL DEFAULT 1,
    "monthly_ai_budget_usd" DECIMAL(12,2),
    "hard_stop_on_budget" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'MEMBER',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'MEMBER',
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tier" "plan_tier" NOT NULL DEFAULT 'FREE',
    "status" "subscription_status" NOT NULL DEFAULT 'TRIALING',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "cancel_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "entitlements" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_record" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "metric" "usage_metric" NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "reported_at" TIMESTAMP(3),
    "stripe_event_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "annual_revenue" DECIMAL(16,2),
    "description" TEXT,
    "logo_url" TEXT,
    "address" JSONB,
    "custom_fields" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "company_id" TEXT,
    "owner_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" CITEXT,
    "phone" TEXT,
    "job_title" TEXT,
    "linkedin_url" TEXT,
    "avatar_url" TEXT,
    "timezone" TEXT,
    "locale" TEXT,
    "email_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "opt_out_at" TIMESTAMP(3),
    "consent_source" TEXT,
    "custom_fields" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "company_id" TEXT,
    "owner_id" TEXT,
    "campaign_id" TEXT,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "medium" TEXT,
    "value" DECIMAL(14,2),
    "qualification_reason" TEXT,
    "scored_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "last_contacted_at" TIMESTAMP(3),
    "custom_fields" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stage" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "is_won" BOOLEAN NOT NULL DEFAULT false,
    "is_lost" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "company_id" TEXT,
    "lead_id" TEXT,
    "owner_id" TEXT,
    "title" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "deal_status" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expected_close_date" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "custom_fields" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "activity_type" NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "actor_type" "actor_type" NOT NULL DEFAULT 'USER',
    "user_id" TEXT,
    "agent_id" "agent_id",
    "contact_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "assignee_id" TEXT,
    "created_by_id" TEXT,
    "created_by_agent" "agent_id",
    "agent_run_id" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "appointment_status" NOT NULL DEFAULT 'SCHEDULED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "location" TEXT,
    "meeting_url" TEXT,
    "host_id" TEXT,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "booked_by_agent" "agent_id",
    "call_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT,
    "contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "budget_total" DECIMAL(14,2),
    "budget_spent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "strategy" JSONB,
    "agent_run_id" TEXT,
    "target_audience" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_channel" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "channel" "channel_type" NOT NULL,
    "budget" DECIMAL(14,2),
    "spent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "config" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_document" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "title" TEXT NOT NULL,
    "type" "content_type" NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "body" JSONB,
    "plain_text" TEXT,
    "excerpt" TEXT,
    "slug" CITEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo_score" INTEGER,
    "author_id" TEXT,
    "generated_by" "agent_id",
    "agent_run_id" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "content_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_revision" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB,
    "plain_text" TEXT,
    "change_note" TEXT,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_approval" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "status" "content_status" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "media_type" NOT NULL,
    "status" "generation_status" NOT NULL DEFAULT 'READY',
    "title" TEXT,
    "alt_text" TEXT,
    "mime_type" TEXT,
    "storage_key" TEXT NOT NULL,
    "url" TEXT,
    "thumbnail_url" TEXT,
    "size_bytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "checksum" TEXT,
    "prompt" TEXT,
    "negative_prompt" TEXT,
    "generated_by" "agent_id",
    "generator_provider" "ai_provider",
    "generator_model" TEXT,
    "agent_run_id" TEXT,
    "generation_params" JSONB,
    "failure_reason" TEXT,
    "uploaded_by_id" TEXT,
    "brand_kit_id" TEXT,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "accent_colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heading_font" TEXT,
    "body_font" TEXT,
    "logo_url" TEXT,
    "logo_dark_url" TEXT,
    "favicon_url" TEXT,
    "visual_style" TEXT,
    "tone_guidelines" TEXT,
    "do_not_use" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "brand_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "from_name" TEXT,
    "from_email" TEXT,
    "reply_to" TEXT,
    "body_html" TEXT,
    "body_text" TEXT,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "segment_filter" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "generated_by" "agent_id",
    "agent_run_id" TEXT,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "bounce_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribe_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "email_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sequence" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "workflow_status" NOT NULL DEFAULT 'DRAFT',
    "trigger_event" TEXT,
    "segment_filter" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "email_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sequence_step" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT NOT NULL,
    "body_html" TEXT,
    "body_text" TEXT,
    "condition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sequence_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sequence_enrollment" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" "run_status" NOT NULL DEFAULT 'RUNNING',
    "next_run_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sequence_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email_campaign_id" TEXT,
    "sequence_step_id" TEXT,
    "contact_id" TEXT,
    "to_email" CITEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "email_send_status" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "first_open_at" TIMESTAMP(3),
    "last_open_at" TIMESTAMP(3),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_send_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "conversation_channel" NOT NULL,
    "contact_id" TEXT,
    "external_id" TEXT,
    "subject" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "assigned_to" "agent_id",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "message_direction" NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'QUEUED',
    "body" TEXT,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_id" TEXT,
    "sent_by_agent" "agent_id",
    "agent_run_id" TEXT,
    "template_id" TEXT,
    "failure_reason" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_template" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "conversation_channel" NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_name" TEXT,
    "approval_status" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_number" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "external_id" TEXT,
    "label" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "phone_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone_number_id" TEXT,
    "contact_id" TEXT,
    "direction" "call_direction" NOT NULL,
    "status" "call_status" NOT NULL DEFAULT 'QUEUED',
    "from_e164" TEXT NOT NULL,
    "to_e164" TEXT NOT NULL,
    "provider" "integration_provider",
    "external_id" TEXT,
    "started_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "recording_url" TEXT,
    "transcript" JSONB,
    "summary" TEXT,
    "disposition" TEXT,
    "sentiment" TEXT,
    "script_id" TEXT,
    "handled_by" "agent_id",
    "agent_run_id" TEXT,
    "cost_usd" DECIMAL(10,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "channel_type" NOT NULL,
    "status" "integration_status" NOT NULL DEFAULT 'CONNECTED',
    "external_id" TEXT NOT NULL,
    "handle" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "follower_count" INTEGER,
    "credential_id" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "status" "social_post_status" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "generated_by" "agent_id",
    "agent_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "social_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_target" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "social_account_id" TEXT NOT NULL,
    "status" "social_post_status" NOT NULL DEFAULT 'DRAFT',
    "external_post_id" TEXT,
    "permalink" TEXT,
    "failure_reason" TEXT,
    "published_at" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "last_metrics_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_post_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "workflow_status" NOT NULL DEFAULT 'DRAFT',
    "trigger_type" TEXT NOT NULL,
    "trigger_config" JSONB,
    "cron_expression" TEXT,
    "active_version" INTEGER NOT NULL DEFAULT 1,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_version" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "triggered_by" "actor_type" NOT NULL DEFAULT 'SYSTEM',
    "trigger_payload" JSONB,
    "context" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "resume_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_run_step" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_run_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agentId" "agent_id" NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "goal" TEXT NOT NULL,
    "input" JSONB,
    "plan" JSONB,
    "result" JSONB,
    "error" TEXT,
    "parent_run_id" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "initiated_by" "actor_type" NOT NULL DEFAULT 'USER',
    "initiated_by_user_id" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_step" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "agent_step_type" NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_run_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_call" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_id" TEXT,
    "agent_id" "agent_id" NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "permission_checked" TEXT,
    "denied_reason" TEXT,
    "idempotency_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tool_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "user_id" TEXT,
    "kind" "provider_kind" NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_tokens" INTEGER NOT NULL DEFAULT 0,
    "units" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agent_id" "agent_id",
    "category" TEXT,
    "active_version" INTEGER NOT NULL DEFAULT 1,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_version" (
    "id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "embedding_model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" "knowledge_source_type" NOT NULL,
    "source_url" TEXT,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "content" TEXT,
    "content_hash" TEXT,
    "status" "generation_status" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunk" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER,
    "embedding" vector(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_daily" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" "channel_type",
    "campaign_id" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_touch" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "channel" "channel_type" NOT NULL,
    "campaign_id" TEXT,
    "position" TEXT NOT NULL,
    "weight" DECIMAL(6,4) NOT NULL DEFAULT 1,
    "value" DECIMAL(14,2),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "referrer" TEXT,
    "landing_page" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_touch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "install_count" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_install" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "created_refs" JSONB,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_install_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credential" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "kind" "provider_kind" NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "wrapped_key" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "masked_hint" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "provider_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connection" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "status" "integration_status" NOT NULL DEFAULT 'CONNECTED',
    "external_account_id" TEXT,
    "display_name" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "credential_id" TEXT,
    "connected_by_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "event_name" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "aggregate_type" TEXT,
    "aggregate_id" TEXT,
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMP(3),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "last_delivery_at" TIMESTAMP(3),
    "failure_streak" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "user_id" TEXT,
    "agent_id" "agent_id",
    "api_key_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "level" "notification_level" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "action_url" TEXT,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "locked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_deleted_at_idx" ON "user"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_id_account_id_key" ON "account"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "verification_expires_at_idx" ON "verification"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "organization_deleted_at_idx" ON "organization"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organization_id_key" ON "organization_settings"("organization_id");

-- CreateIndex
CREATE INDEX "membership_organization_id_role_idx" ON "membership"("organization_id", "role");

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organization_id_user_id_key" ON "membership"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_hash_key" ON "invitation"("token_hash");

-- CreateIndex
CREATE INDEX "invitation_organization_id_status_idx" ON "invitation"("organization_id", "status");

-- CreateIndex
CREATE INDEX "invitation_expires_at_idx" ON "invitation"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_organization_id_email_status_key" ON "invitation"("organization_id", "email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_prefix_key" ON "api_key"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_key_hash_key" ON "api_key"("key_hash");

-- CreateIndex
CREATE INDEX "api_key_organization_id_revoked_at_idx" ON "api_key"("organization_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_organization_id_key" ON "subscription"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripe_customer_id_key" ON "subscription"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripe_subscription_id_key" ON "subscription"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscription_status_idx" ON "subscription"("status");

-- CreateIndex
CREATE INDEX "usage_record_organization_id_period_start_idx" ON "usage_record"("organization_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "usage_record_organization_id_metric_period_start_key" ON "usage_record"("organization_id", "metric", "period_start");

-- CreateIndex
CREATE INDEX "company_organization_id_deleted_at_idx" ON "company"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "company_organization_id_name_idx" ON "company"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "company_organization_id_domain_key" ON "company"("organization_id", "domain");

-- CreateIndex
CREATE INDEX "contact_organization_id_deleted_at_idx" ON "contact"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "contact_organization_id_company_id_idx" ON "contact"("organization_id", "company_id");

-- CreateIndex
CREATE INDEX "contact_organization_id_owner_id_idx" ON "contact"("organization_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_organization_id_email_key" ON "contact"("organization_id", "email");

-- CreateIndex
CREATE INDEX "lead_organization_id_deleted_at_idx" ON "lead"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "lead_organization_id_status_score_idx" ON "lead"("organization_id", "status", "score");

-- CreateIndex
CREATE INDEX "lead_organization_id_campaign_id_idx" ON "lead"("organization_id", "campaign_id");

-- CreateIndex
CREATE INDEX "lead_organization_id_owner_id_idx" ON "lead"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "pipeline_organization_id_deleted_at_idx" ON "pipeline"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_organization_id_name_key" ON "pipeline"("organization_id", "name");

-- CreateIndex
CREATE INDEX "pipeline_stage_pipeline_id_idx" ON "pipeline_stage"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stage_pipeline_id_position_key" ON "pipeline_stage"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "deal_organization_id_deleted_at_idx" ON "deal"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "deal_organization_id_stage_id_idx" ON "deal"("organization_id", "stage_id");

-- CreateIndex
CREATE INDEX "deal_organization_id_status_expected_close_date_idx" ON "deal"("organization_id", "status", "expected_close_date");

-- CreateIndex
CREATE INDEX "deal_organization_id_owner_id_idx" ON "deal"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "activity_organization_id_occurred_at_idx" ON "activity"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_organization_id_contact_id_idx" ON "activity"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "activity_organization_id_lead_id_idx" ON "activity"("organization_id", "lead_id");

-- CreateIndex
CREATE INDEX "activity_organization_id_deal_id_idx" ON "activity"("organization_id", "deal_id");

-- CreateIndex
CREATE INDEX "task_organization_id_status_due_at_idx" ON "task"("organization_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "task_organization_id_assignee_id_status_idx" ON "task"("organization_id", "assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_call_id_key" ON "appointment"("call_id");

-- CreateIndex
CREATE INDEX "appointment_organization_id_starts_at_idx" ON "appointment"("organization_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointment_organization_id_status_starts_at_idx" ON "appointment"("organization_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "note_organization_id_contact_id_idx" ON "note"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "campaign_organization_id_deleted_at_idx" ON "campaign"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "campaign_organization_id_status_starts_at_idx" ON "campaign"("organization_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "campaign_channel_campaign_id_idx" ON "campaign_channel"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_channel_campaign_id_channel_key" ON "campaign_channel"("campaign_id", "channel");

-- CreateIndex
CREATE INDEX "content_document_organization_id_deleted_at_idx" ON "content_document"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "content_document_organization_id_status_type_idx" ON "content_document"("organization_id", "status", "type");

-- CreateIndex
CREATE INDEX "content_document_organization_id_campaign_id_idx" ON "content_document"("organization_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_document_organization_id_slug_key" ON "content_document"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "content_revision_document_id_idx" ON "content_revision"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_revision_document_id_version_key" ON "content_revision"("document_id", "version");

-- CreateIndex
CREATE INDEX "content_approval_document_id_idx" ON "content_approval"("document_id");

-- CreateIndex
CREATE INDEX "media_asset_organization_id_deleted_at_idx" ON "media_asset"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "media_asset_organization_id_type_status_idx" ON "media_asset"("organization_id", "type", "status");

-- CreateIndex
CREATE INDEX "media_asset_organization_id_created_at_idx" ON "media_asset"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "brand_kit_organization_id_deleted_at_idx" ON "brand_kit"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_kit_organization_id_name_key" ON "brand_kit"("organization_id", "name");

-- CreateIndex
CREATE INDEX "email_campaign_organization_id_deleted_at_idx" ON "email_campaign"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "email_campaign_organization_id_status_scheduled_at_idx" ON "email_campaign"("organization_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "email_sequence_organization_id_status_idx" ON "email_sequence"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_sequence_organization_id_name_key" ON "email_sequence"("organization_id", "name");

-- CreateIndex
CREATE INDEX "email_sequence_step_sequence_id_idx" ON "email_sequence_step"("sequence_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_sequence_step_sequence_id_position_key" ON "email_sequence_step"("sequence_id", "position");

-- CreateIndex
CREATE INDEX "email_sequence_enrollment_status_next_run_at_idx" ON "email_sequence_enrollment"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_sequence_enrollment_sequence_id_contact_id_key" ON "email_sequence_enrollment"("sequence_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_send_provider_message_id_key" ON "email_send"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_send_organization_id_status_idx" ON "email_send"("organization_id", "status");

-- CreateIndex
CREATE INDEX "email_send_organization_id_email_campaign_id_idx" ON "email_send"("organization_id", "email_campaign_id");

-- CreateIndex
CREATE INDEX "email_send_organization_id_contact_id_idx" ON "email_send"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "conversation_organization_id_channel_last_message_at_idx" ON "conversation"("organization_id", "channel", "last_message_at");

-- CreateIndex
CREATE INDEX "conversation_organization_id_is_open_last_message_at_idx" ON "conversation"("organization_id", "is_open", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_organization_id_channel_external_id_key" ON "conversation"("organization_id", "channel", "external_id");

-- CreateIndex
CREATE INDEX "message_organization_id_conversation_id_created_at_idx" ON "message"("organization_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "message_organization_id_status_idx" ON "message"("organization_id", "status");

-- CreateIndex
CREATE INDEX "message_template_organization_id_channel_idx" ON "message_template"("organization_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "message_template_organization_id_channel_name_language_key" ON "message_template"("organization_id", "channel", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "phone_number_e164_key" ON "phone_number"("e164");

-- CreateIndex
CREATE INDEX "phone_number_organization_id_is_active_idx" ON "phone_number"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "call_external_id_key" ON "call"("external_id");

-- CreateIndex
CREATE INDEX "call_organization_id_status_started_at_idx" ON "call"("organization_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "call_organization_id_contact_id_idx" ON "call"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "social_account_organization_id_platform_status_idx" ON "social_account"("organization_id", "platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_organization_id_platform_external_id_key" ON "social_account"("organization_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "social_post_organization_id_deleted_at_idx" ON "social_post"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "social_post_organization_id_status_scheduled_at_idx" ON "social_post"("organization_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "social_post_target_social_account_id_status_idx" ON "social_post_target"("social_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_target_post_id_social_account_id_key" ON "social_post_target"("post_id", "social_account_id");

-- CreateIndex
CREATE INDEX "workflow_organization_id_status_next_run_at_idx" ON "workflow"("organization_id", "status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_organization_id_name_key" ON "workflow"("organization_id", "name");

-- CreateIndex
CREATE INDEX "workflow_version_workflow_id_idx" ON "workflow_version"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_version_workflow_id_version_key" ON "workflow_version"("workflow_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_idempotency_key_key" ON "workflow_run"("idempotency_key");

-- CreateIndex
CREATE INDEX "workflow_run_organization_id_status_created_at_idx" ON "workflow_run"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "workflow_run_organization_id_workflow_id_created_at_idx" ON "workflow_run"("organization_id", "workflow_id", "created_at");

-- CreateIndex
CREATE INDEX "workflow_run_status_resume_at_idx" ON "workflow_run"("status", "resume_at");

-- CreateIndex
CREATE INDEX "workflow_run_step_run_id_idx" ON "workflow_run_step"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_run_step_run_id_position_key" ON "workflow_run_step"("run_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_idempotency_key_key" ON "agent_run"("idempotency_key");

-- CreateIndex
CREATE INDEX "agent_run_organization_id_status_created_at_idx" ON "agent_run"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "agent_run_organization_id_agentId_created_at_idx" ON "agent_run"("organization_id", "agentId", "created_at");

-- CreateIndex
CREATE INDEX "agent_run_parent_run_id_idx" ON "agent_run"("parent_run_id");

-- CreateIndex
CREATE INDEX "agent_run_step_run_id_idx" ON "agent_run_step"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_step_run_id_position_key" ON "agent_run_step"("run_id", "position");

-- CreateIndex
CREATE INDEX "tool_call_run_id_idx" ON "tool_call"("run_id");

-- CreateIndex
CREATE INDEX "tool_call_tool_name_status_idx" ON "tool_call"("tool_name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tool_call_run_id_idempotency_key_key" ON "tool_call"("run_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ai_usage_organization_id_created_at_idx" ON "ai_usage"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_organization_id_provider_created_at_idx" ON "ai_usage"("organization_id", "provider", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_agent_run_id_idx" ON "ai_usage"("agent_run_id");

-- CreateIndex
CREATE INDEX "prompt_organization_id_agent_id_idx" ON "prompt"("organization_id", "agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_organization_id_name_key" ON "prompt"("organization_id", "name");

-- CreateIndex
CREATE INDEX "prompt_version_prompt_id_idx" ON "prompt_version"("prompt_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_version_prompt_id_version_key" ON "prompt_version"("prompt_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_base_organization_id_deleted_at_idx" ON "knowledge_base"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_organization_id_name_key" ON "knowledge_base"("organization_id", "name");

-- CreateIndex
CREATE INDEX "knowledge_document_organization_id_status_idx" ON "knowledge_document"("organization_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_document_knowledge_base_id_idx" ON "knowledge_document"("knowledge_base_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_document_knowledge_base_id_content_hash_key" ON "knowledge_document"("knowledge_base_id", "content_hash");

-- CreateIndex
CREATE INDEX "knowledge_chunk_organization_id_knowledge_base_id_idx" ON "knowledge_chunk"("organization_id", "knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_chunk_document_id_idx" ON "knowledge_chunk"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunk_document_id_position_key" ON "knowledge_chunk"("document_id", "position");

-- CreateIndex
CREATE INDEX "metric_daily_organization_id_date_idx" ON "metric_daily"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_organization_id_date_channel_campaign_id_key" ON "metric_daily"("organization_id", "date", "channel", "campaign_id");

-- CreateIndex
CREATE INDEX "attribution_touch_organization_id_occurred_at_idx" ON "attribution_touch"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attribution_touch_organization_id_contact_id_idx" ON "attribution_touch"("organization_id", "contact_id");

-- CreateIndex
CREATE INDEX "attribution_touch_organization_id_deal_id_idx" ON "attribution_touch"("organization_id", "deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_slug_key" ON "template"("slug");

-- CreateIndex
CREATE INDEX "template_organization_id_deleted_at_idx" ON "template"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "template_is_public_category_idx" ON "template"("is_public", "category");

-- CreateIndex
CREATE INDEX "template_install_organization_id_installed_at_idx" ON "template_install"("organization_id", "installed_at");

-- CreateIndex
CREATE INDEX "template_install_template_id_idx" ON "template_install"("template_id");

-- CreateIndex
CREATE INDEX "provider_credential_organization_id_kind_is_active_idx" ON "provider_credential"("organization_id", "kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credential_organization_id_kind_provider_label_key" ON "provider_credential"("organization_id", "kind", "provider", "label");

-- CreateIndex
CREATE INDEX "integration_connection_organization_id_provider_status_idx" ON "integration_connection"("organization_id", "provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connection_organization_id_provider_external_ac_key" ON "integration_connection"("organization_id", "provider", "external_account_id");

-- CreateIndex
CREATE INDEX "outbox_event_status_available_at_idx" ON "outbox_event"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_event_organization_id_occurred_at_idx" ON "outbox_event"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_event_aggregate_type_aggregate_id_idx" ON "outbox_event"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "webhook_organization_id_is_active_idx" ON "webhook"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "webhook_delivery_webhook_id_created_at_idx" ON "webhook_delivery"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_next_attempt_at_idx" ON "webhook_delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_created_at_idx" ON "audit_log"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_resource_type_resource_id_idx" ON "audit_log"("organization_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_user_id_created_at_idx" ON "audit_log"("organization_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_organization_id_user_id_read_at_idx" ON "notification"("organization_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_organization_id_created_at_idx" ON "notification"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_key_expires_at_idx" ON "idempotency_key"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_organization_id_scope_key_key" ON "idempotency_key"("organization_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_channel" ADD CONSTRAINT "campaign_channel_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_document" ADD CONSTRAINT "content_document_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "content_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approval" ADD CONSTRAINT "content_approval_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "content_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approval" ADD CONSTRAINT "content_approval_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequence" ADD CONSTRAINT "email_sequence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequence_step" ADD CONSTRAINT "email_sequence_step_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "email_sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sequence_enrollment" ADD CONSTRAINT "email_sequence_enrollment_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "email_sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_email_campaign_id_fkey" FOREIGN KEY ("email_campaign_id") REFERENCES "email_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_sequence_step_id_fkey" FOREIGN KEY ("sequence_step_id") REFERENCES "email_sequence_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_template" ADD CONSTRAINT "message_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_number" ADD CONSTRAINT "phone_number_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call" ADD CONSTRAINT "call_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call" ADD CONSTRAINT "call_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_number"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call" ADD CONSTRAINT "call_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call" ADD CONSTRAINT "call_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "provider_credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_target" ADD CONSTRAINT "social_post_target_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_target" ADD CONSTRAINT "social_post_target_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_run_step" ADD CONSTRAINT "workflow_run_step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_step" ADD CONSTRAINT "agent_run_step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call" ADD CONSTRAINT "tool_call_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call" ADD CONSTRAINT "tool_call_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_run_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_version" ADD CONSTRAINT "prompt_version_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_touch" ADD CONSTRAINT "attribution_touch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_install" ADD CONSTRAINT "template_install_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_install" ADD CONSTRAINT "template_install_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credential" ADD CONSTRAINT "provider_credential_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

